import { app, type IpcMainInvokeEvent } from "electron";
import { spawn, type ChildProcess } from "node:child_process";

import {
  SHELL_COMMAND_DEFAULT_TIMEOUT_MS,
  SHELL_COMMAND_MAX_TIMEOUT_MS,
  type ShellCommandRequest,
  type ShellCommandResult,
} from "../shared/shell-command";
import { FileExplorer } from "./file-explorer";
import { chooseShell, shellEnv } from "./terminal";

/** Characters of output kept per stream: the start and the end, half each. */
const MAX_OUTPUT_CHARS = 30_000;

/** Time a stopped command gets to exit before it's killed outright. */
const KILL_GRACE_MS = 2_000;

/** Colors and cursor movement; they mean nothing to the model. */
const ANSI_ESCAPE =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)/g;

type Run = { child: ChildProcess; webContentsId: number; cancel: () => void };

const runs = new Map<string, Run>();
/** Windows whose close already stops their commands. */
const trackedWindows = new Set<number>();

/**
 * Collects a stream's output, keeping its start and its end when there's too
 * much: a build or test run's summary is at the end, the first error near
 * the start.
 */
const createOutput = () => {
  const half = MAX_OUTPUT_CHARS / 2;
  let head = "";
  let tail = "";
  let dropped = 0;
  return {
    append(chunk: string) {
      if (head.length < half) {
        const room = half - head.length;
        head += chunk.slice(0, room);
        chunk = chunk.slice(room);
      }
      tail += chunk;
      if (tail.length > half) {
        dropped += tail.length - half;
        tail = tail.slice(-half);
      }
    },
    get truncated() {
      return dropped > 0;
    },
    toString() {
      const text = dropped
        ? `${head}\n[… ${dropped.toLocaleString()} characters cut …]\n${tail}`
        : head + tail;
      return text.replace(ANSI_ESCAPE, "");
    },
  };
};

/** Ends the command and everything it started. */
const killTree = (child: ChildProcess, signal: NodeJS.Signals) => {
  // Even after the shell exits: something it started may still hold the output open.
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
      });
    } else {
      // The command leads its own process group (`detached`), so this reaches
      // what it started too, like a dev server behind `npm run`.
      process.kill(-child.pid, signal);
    }
  } catch {
    // Already gone.
  }
};

const trackWindow = (event: IpcMainInvokeEvent) => {
  const webContents = event.sender;
  if (trackedWindows.has(webContents.id)) return;
  const id = webContents.id;
  trackedWindows.add(id);

  const stopAll = () => {
    for (const run of runs.values()) {
      if (run.webContentsId === id) run.cancel();
    }
  };
  webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) stopAll();
  });
  webContents.once("destroyed", () => {
    trackedWindows.delete(id);
    stopAll();
  });
};

const clampTimeout = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.floor(value), 1_000), SHELL_COMMAND_MAX_TIMEOUT_MS)
    : SHELL_COMMAND_DEFAULT_TIMEOUT_MS;

export class ShellCommand {
  /**
   * Runs one command in the user's shell, inside the opened folder, and
   * resolves when it exits or is stopped. It gets no input, so a command that
   * asks for some ends instead of waiting forever.
   */
  static run(
    event: IpcMainInvokeEvent,
    request: ShellCommandRequest,
  ): Promise<ShellCommandResult> {
    const root = FileExplorer.workspaceRoot(event.sender.id);
    if (!root) throw new Error("No folder is open.");
    if (typeof request?.command !== "string" || !request.command.trim()) {
      throw new Error("The command is empty.");
    }
    if (typeof request.id !== "string" || runs.has(request.id)) {
      throw new Error("Each command needs its own id.");
    }
    const cwd = request.cwd
      ? FileExplorer.resolveInWorkspace(event, request.cwd)
      : root;
    trackWindow(event);

    const shell = chooseShell();
    const env = {
      ...shellEnv(),
      TERM: "dumb",
      NO_COLOR: "1",
      PAGER: "cat",
      GIT_PAGER: "cat",
      // Fail instead of waiting for a password nobody can type.
      GIT_TERMINAL_PROMPT: "0",
    };
    const child =
      process.platform === "win32"
        ? spawn(request.command, {
            shell,
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          })
        : spawn(
            shell,
            // macOS GUI apps don't get the login PATH (see terminal.ts).
            [
              ...(process.platform === "darwin" ? ["-l"] : []),
              "-c",
              request.command,
            ],
            { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true },
          );

    const stdout = createOutput();
    const stderr = createOutput();
    child.stdout?.setEncoding("utf8").on("data", stdout.append);
    child.stderr?.setEncoding("utf8").on("data", stderr.append);

    let timedOut = false;
    let cancelled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (killTimer) return;
      killTree(child, "SIGTERM");
      killTimer = setTimeout(() => killTree(child, "SIGKILL"), KILL_GRACE_MS);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      stop();
    }, clampTimeout(request.timeoutMs));

    runs.set(request.id, {
      child,
      webContentsId: event.sender.id,
      cancel: () => {
        cancelled = true;
        stop();
      },
    });

    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        runs.delete(request.id);
      };
      child.once("error", (error) => {
        finish();
        reject(new Error(`Couldn't start ${shell}: ${error.message}`));
      });
      // "close", not "exit": it waits for the output streams to finish.
      child.once("close", (code) => {
        finish();
        const stopped = timedOut || cancelled;
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: stopped ? null : code,
          timedOut,
          cancelled,
          truncated: stdout.truncated || stderr.truncated,
        });
      });
    });
  }

  /** Stops a running command started by this window. */
  static cancel(event: IpcMainInvokeEvent, id: unknown) {
    const run = typeof id === "string" ? runs.get(id) : undefined;
    if (run?.webContentsId === event.sender.id) run.cancel();
  }
}

app.on("before-quit", () => {
  for (const run of runs.values()) run.cancel();
});
