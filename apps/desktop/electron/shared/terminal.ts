export type TerminalCreateRequest = {
  cols: number;
  rows: number;
};

export type TerminalInfo = {
  id: number;
  /** The shell's executable name, e.g. "bash" or "pwsh". */
  shellName: string;
  cwd: string;
};

export type TerminalExit = {
  id: number;
  exitCode: number;
};
