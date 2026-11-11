import {
  app,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { IPC_CHANNEL } from "../shared/ipc-channel";
import {
  SERVER_LANGUAGES,
  type LanguageServerExit,
  type LanguageServerInfo,
  type ServerLanguage,
} from "../shared/language-server";
import { FileExplorer } from "./file-explorer";

/*
 * Runs language servers (TypeScript, Python) for the renderer, which speaks the Language Server
 * Protocol itself (see src/lib/lsp). This side only starts the process and
 * moves JSON-RPC messages between its stdio and the window, so the
 * renderer never gets to spawn arbitrary programs.
 */

const require = createRequire(import.meta.url);

/** Stderr kept per server, to explain a crash. */
const STDERR_LIMIT = 8 * 1024;
/** How long a server gets to exit after `shutdown`/`exit` before it is killed. */
const STOP_TIMEOUT_MS = 2000;

const HEADER_END = Buffer.from("\r\n\r\n");

type Server = {
  id: number;
  process: ChildProcessWithoutNullStreams;
  webContents: WebContents;
  /** Bytes read from stdout that don't make up a whole message yet. */
  buffer: Buffer;
  stderr: string;
  /** Set once the renderer asked for it to stop, so its exit isn't reported as a crash. */
  stopping: boolean;
};

const servers = new Map<number, Server>();
/** Windows whose reload/close already stops their servers. */
const trackedWindows = new Set<number>();
let nextId = 1;

const resolveFile = (request: string) => {
  try {
    return require.resolve(request);
  } catch {
    return null;
  }
};

/** A file inside an npm package the app depends on, or null if it isn't installed. */
const packageFile = (packageName: string, ...file: string[]) => {
  const packageJson = resolveFile(`${packageName}/package.json`);
  return packageJson ? path.join(path.dirname(packageJson), ...file) : null;
};

/** The npm package that runs each language's server, and its entry point. */
const SERVER_ENTRY: Record<ServerLanguage, { packageName: string; file: string[] }> = {
  typescript: { packageName: "typescript-language-server", file: ["lib", "cli.mjs"] },
  python: { packageName: "pyright", file: ["langserver.index.js"] },
};

/** The installed version of an npm package the app depends on. */
const packageVersion = (packageName: string): string | null => {
  try {
    return (require(`${packageName}/package.json`) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
};

/** Pyright's copy of typeshed: the stubs for Python's standard library. */
const typeshedDir = () => packageFile("pyright", "dist", "typeshed-fallback");

/** Virtual environments in the opened folder, by the names tools give them. */
const VENV_NAMES = [".venv", "venv", "env"];

/** The interpreter of a virtual environment in `root`, if it has one. */
const findVenvPython = (root: string | null) => {
  if (!root) return null;
  const relative =
    process.platform === "win32"
      ? ["Scripts", "python.exe"]
      : ["bin", "python"];
  for (const name of VENV_NAMES) {
    const candidate = path.join(root, name, ...relative);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

/** `tsserver.js` of the TypeScript the app depends on. */
const bundledTsserverPath = () => {
  const typescript = resolveFile("typescript");
  if (!typescript) return null;
  const tsserver = path.join(path.dirname(typescript), "tsserver.js");
  return existsSync(tsserver) ? tsserver : null;
};

/** The app's own TypeScript package folder, whose `.d.ts` files definitions may point into. */
const bundledTypescriptDir = () => {
  const tsserver = bundledTsserverPath();
  return tsserver ? path.dirname(path.dirname(tsserver)) : null;
};

const isInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative))
  );
};

/** Splits complete `Content-Length` framed messages off the front of `server.buffer`. */
const readMessages = (server: Server) => {
  const messages: string[] = [];
  for (;;) {
    const headerEnd = server.buffer.indexOf(HEADER_END);
    if (headerEnd === -1) break;

    const header = server.buffer.subarray(0, headerEnd).toString("ascii");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      // Not LSP framing; drop what we have rather than stall forever.
      console.error("Language server sent a message without Content-Length");
      server.buffer = server.buffer.subarray(headerEnd + HEADER_END.length);
      continue;
    }

    const length = Number(match[1]);
    const start = headerEnd + HEADER_END.length;
    if (server.buffer.length < start + length) break;

    messages.push(server.buffer.toString("utf8", start, start + length));
    server.buffer = server.buffer.subarray(start + length);
  }
  return messages;
};

const killServer = (server: Server) => {
  servers.delete(server.id);
  server.stopping = true;
  if (server.process.exitCode === null && server.process.signalCode === null) {
    server.process.kill();
  }
};

const killWindowServers = (webContentsId: number) => {
  for (const server of [...servers.values()]) {
    if (server.webContents.id === webContentsId) killServer(server);
  }
};

/** A reload or close of the window stops its servers; nothing could talk to them anymore. */
const trackWindow = (webContents: WebContents) => {
  if (trackedWindows.has(webContents.id)) return;
  const id = webContents.id;
  trackedWindows.add(id);

  webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) killWindowServers(id);
  });
  webContents.once("destroyed", () => {
    trackedWindows.delete(id);
    killWindowServers(id);
  });
};

/** The server `id`, if it belongs to the window that sent the request. */
const ownedServer = (event: IpcMainEvent | IpcMainInvokeEvent, id: unknown) => {
  if (typeof id !== "number") return undefined;
  const server = servers.get(id);
  return server?.webContents === event.sender ? server : undefined;
};

/** Files a definition or reference may lead to outside the opened folder. */
const SOURCE_FILE = /\.((d\.)?[cm]?[jt]sx?|pyi?)$/i;

/** Folders installed packages live in: npm's, and pip's (virtual environments included). */
const PACKAGE_FOLDERS = new Set(["node_modules", "site-packages", "dist-packages"]);

/** Python's own standard library, e.g. `/usr/lib/python3.12/os.py`. */
const PYTHON_STDLIB = /[\\/]lib[\\/]python\d+(\.\d+)?[\\/]/i;

const isLanguage = (value: unknown): value is ServerLanguage =>
  SERVER_LANGUAGES.includes(value as ServerLanguage);

export class LanguageServer {
  /**
   * Starts `language`'s server for the window's opened folder (or for loose
   * files when none is open). The renderer then initializes it.
   */
  static start(event: IpcMainInvokeEvent, language: unknown): LanguageServerInfo {
    if (!isLanguage(language)) {
      throw new Error(`There is no language server for "${String(language)}"`);
    }
    const webContents = event.sender;
    trackWindow(webContents);

    const { packageName, file } = SERVER_ENTRY[language];
    const cli = packageFile(packageName, ...file);
    if (!cli || !existsSync(cli)) {
      throw new Error(
        `${packageName} is not installed. Run \`pnpm install\` in apps/desktop.`,
      );
    }

    const root = FileExplorer.workspaceRoot(webContents.id);
    // Electron's own binary runs the server as plain Node, so no system Node
    // is needed. Processes the server forks (tsserver, Pyright's background
    // analysis) inherit the variable.
    const child = spawn(process.execPath, [cli, "--stdio"], {
      cwd: root && existsSync(root) ? root : app.getPath("home"),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "pipe",
      windowsHide: true,
    });

    const id = nextId++;
    const server: Server = {
      id,
      process: child,
      webContents,
      buffer: Buffer.alloc(0),
      stderr: "",
      stopping: false,
    };
    servers.set(id, server);

    child.stdout.on("data", (chunk: Buffer) => {
      server.buffer =
        server.buffer.length === 0 ? chunk : Buffer.concat([server.buffer, chunk]);
      if (webContents.isDestroyed()) return;
      for (const message of readMessages(server)) {
        webContents.send(IPC_CHANNEL.languageServer.message, id, message);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      server.stderr = (server.stderr + chunk.toString("utf8")).slice(-STDERR_LIMIT);
    });
    // Writing to a server that just died fails asynchronously; the exit handler reports it.
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      server.stderr += `\n${error.message}`;
    });
    child.on("exit", (code, signal) => {
      const wasStopping = server.stopping;
      servers.delete(id);
      if (wasStopping || webContents.isDestroyed()) return;
      const exit: LanguageServerExit = {
        id,
        code,
        signal,
        stderr: server.stderr.trim(),
      };
      webContents.send(IPC_CHANNEL.languageServer.exit, exit);
    });

    return {
      id,
      language,
      serverVersion: packageVersion(packageName),
      root,
      fallbackTsserverPath:
        language === "typescript" ? bundledTsserverPath() : null,
      pythonPath: language === "python" ? findVenvPython(root) : null,
    };
  }

  /** Writes one JSON-RPC message (already serialized) to the server's stdin. */
  static send(event: IpcMainEvent, id: unknown, message: unknown) {
    if (typeof message !== "string") return;
    const server = ownedServer(event, id);
    if (!server || !server.process.stdin.writable) return;
    const body = Buffer.from(message, "utf8");
    server.process.stdin.write(
      Buffer.concat([
        Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
        body,
      ]),
    );
  }

  /**
   * Stops a server. The renderer sends `shutdown` and `exit` first; this
   * kills it if it hasn't gone by itself shortly after.
   */
  static stop(event: IpcMainInvokeEvent, id: unknown) {
    const server = ownedServer(event, id);
    if (!server) return;
    server.stopping = true;
    const timer = setTimeout(() => killServer(server), STOP_TIMEOUT_MS);
    server.process.once("exit", () => clearTimeout(timer));
  }

  /**
   * Lets the window open a file a definition or reference led to outside the
   * opened folder: a source or declaration file in a `node_modules` folder
   * (e.g. hoisted in a monorepo) or in the app's own TypeScript, or a Python
   * file or stub of an installed package, the standard library or typeshed.
   */
  static allowFile(event: IpcMainInvokeEvent, filePath: unknown): boolean {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return false;
    const resolved = path.resolve(filePath);
    if (!SOURCE_FILE.test(resolved)) return false;

    const typescriptDir = bundledTypescriptDir();
    const typeshed = typeshedDir();
    const allowed =
      resolved.split(path.sep).some((part) => PACKAGE_FOLDERS.has(part)) ||
      (typescriptDir !== null && isInside(typescriptDir, resolved)) ||
      (typeshed !== null && isInside(typeshed, resolved)) ||
      (/\.pyi?$/i.test(resolved) && PYTHON_STDLIB.test(resolved));
    if (!allowed) return false;

    try {
      if (!statSync(resolved).isFile()) return false;
    } catch {
      return false;
    }
    FileExplorer.allowFile(event.sender.id, resolved);
    return true;
  }

  /** Kills every server, e.g. when the app quits. */
  static stopAll() {
    for (const server of [...servers.values()]) killServer(server);
  }
}
