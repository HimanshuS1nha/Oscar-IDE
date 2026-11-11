/** One command run to completion without a terminal (the AI's bash tool). */
export type ShellCommandRequest = {
  /** Chosen by the renderer, so it can cancel the run while it's going. */
  id: string;
  command: string;
  /** Absolute folder inside the opened folder. Defaults to the opened folder. */
  cwd?: string;
  /** Defaults to `SHELL_COMMAND_DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
};

export type ShellCommandResult = {
  stdout: string;
  stderr: string;
  /** Null if the command was stopped (timed out or cancelled) before it exited. */
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  /** Some output was cut from the middle because there was too much. */
  truncated: boolean;
};

export const SHELL_COMMAND_DEFAULT_TIMEOUT_MS = 120_000;
export const SHELL_COMMAND_MAX_TIMEOUT_MS = 600_000;
