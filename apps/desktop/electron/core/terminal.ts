import { app, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, type IPty } from "node-pty";

import { IPC_CHANNEL } from "../shared/ipc-channel";
import type {
  TerminalCreateRequest,
  TerminalExit,
  TerminalInfo,
} from "../shared/terminal";
import { FileExplorer } from "./file-explorer";
import { Settings } from "./settings";

/** Output is sent in batches: a busy command emits thousands of tiny chunks. */
const OUTPUT_FLUSH_MS = 5;

type Session = {
  pty: IPty;
  webContents: WebContents;
  pending: string;
  flushTimer: ReturnType<typeof setTimeout> | null;
};

const sessions = new Map<number, Session>();
/** Windows whose reload/close already kills their terminals. */
const trackedWindows = new Set<number>();
let nextId = 1;

/*
 * Variables the app sets on its own process for internal reasons, which the
 * user's shell must not inherit (e.g. Git's "never prompt" switch from git.ts).
 */
const APP_ONLY_ENV = [
  "GIT_TERMINAL_PROMPT",
  "GIT_OPTIONAL_LOCKS",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "VITE_DEV_SERVER_URL",
  "APP_ROOT",
  "VITE_PUBLIC",
];

const loginShell = () => {
  if (process.platform === "win32") {
    return process.env.COMSPEC && !/cmd\.exe$/i.test(process.env.COMSPEC)
      ? process.env.COMSPEC
      : "powershell.exe";
  }
  if (process.env.SHELL) return process.env.SHELL;
  return process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
};

/**
 * The shell from the settings, or the login shell. A path that doesn't exist
 * falls back to the login shell; a bare name is looked up on the PATH.
 */
export const chooseShell = () => {
  const configured = Settings.current.terminal.shell.trim();
  if (!configured) return loginShell();
  if (path.isAbsolute(configured) && !existsSync(configured)) {
    console.warn(`Terminal shell "${configured}" not found; using the login shell`);
    return loginShell();
  }
  return configured;
};

export const shellEnv = () => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !APP_ONLY_ENV.includes(key)) env[key] = value;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.TERM_PROGRAM = "oscar";
  return env;
};

const clampSize = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.floor(value), 1), 1000)
    : fallback;

const flush = (id: number) => {
  const session = sessions.get(id);
  if (!session) return;
  session.flushTimer = null;
  if (!session.pending) return;

  if (!session.webContents.isDestroyed()) {
    session.webContents.send(IPC_CHANNEL.terminal.data, id, session.pending);
  }
  session.pending = "";
};

const killSession = (id: number) => {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (session.flushTimer) clearTimeout(session.flushTimer);
  try {
    session.pty.kill();
  } catch {
    // Already gone.
  }
};

const killWindowSessions = (webContentsId: number) => {
  for (const [id, session] of sessions) {
    if (session.webContents.id === webContentsId) killSession(id);
  }
};

/** A reload or close of the window ends its shells; nothing could show them anymore. */
const trackWindow = (webContents: WebContents) => {
  if (trackedWindows.has(webContents.id)) return;
  const id = webContents.id;
  trackedWindows.add(id);

  webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) killWindowSessions(id);
  });
  webContents.once("destroyed", () => {
    trackedWindows.delete(id);
    killWindowSessions(id);
  });
};

/** The session `id`, if it belongs to the window that sent the request. */
const ownedSession = (event: IpcMainEvent | IpcMainInvokeEvent, id: unknown) => {
  if (typeof id !== "number") return undefined;
  const session = sessions.get(id);
  return session?.webContents === event.sender ? session : undefined;
};

export class Terminal {
  /** Starts the user's shell in the opened folder (or the home folder). */
  static create(
    event: IpcMainInvokeEvent,
    request: TerminalCreateRequest,
  ): TerminalInfo {
    const webContents = event.sender;
    trackWindow(webContents);

    const root = FileExplorer.workspaceRoot(webContents.id);
    const cwd = root && existsSync(root) ? root : app.getPath("home");
    const shell = chooseShell();
    // macOS GUI apps don't get the login PATH, so start a login shell there.
    const args = process.platform === "darwin" ? ["-l"] : [];

    const pty = spawn(shell, args, {
      name: "xterm-256color",
      cols: clampSize(request?.cols, 80),
      rows: clampSize(request?.rows, 24),
      cwd,
      env: shellEnv(),
    });

    const id = nextId++;
    const session: Session = {
      pty,
      webContents,
      pending: "",
      flushTimer: null,
    };
    sessions.set(id, session);

    pty.onData((data) => {
      session.pending += data;
      session.flushTimer ??= setTimeout(() => flush(id), OUTPUT_FLUSH_MS);
    });
    pty.onExit(({ exitCode }) => {
      // Deliver the last output before announcing the exit.
      flush(id);
      // Not after `kill`, which already removed the session.
      if (sessions.delete(id) && !webContents.isDestroyed()) {
        const exit: TerminalExit = { id, exitCode };
        webContents.send(IPC_CHANNEL.terminal.exit, exit);
      }
    });

    return {
      id,
      shellName: path.basename(shell).replace(/\.exe$/i, ""),
      cwd,
    };
  }

  static write(event: IpcMainEvent, id: unknown, data: unknown) {
    if (typeof data !== "string") return;
    ownedSession(event, id)?.pty.write(data);
  }

  static resize(event: IpcMainEvent, id: unknown, cols: unknown, rows: unknown) {
    const session = ownedSession(event, id);
    if (!session) return;
    try {
      session.pty.resize(clampSize(cols, 80), clampSize(rows, 24));
    } catch {
      // The shell exited between the resize and now.
    }
  }

  static kill(event: IpcMainInvokeEvent, id: unknown) {
    if (ownedSession(event, id)) killSession(id as number);
  }
}

app.on("before-quit", () => {
  for (const id of [...sessions.keys()]) killSession(id);
});
