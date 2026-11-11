/** Languages with a language server the app ships. */
export const SERVER_LANGUAGES = ["typescript", "python"] as const;
export type ServerLanguage = (typeof SERVER_LANGUAGES)[number];

/** A language server the main process started for a window. */
export type LanguageServerInfo = {
  id: number;
  language: ServerLanguage;
  /** The version of the server package the app ships, e.g. Pyright's "1.1.414". */
  serverVersion: string | null;
  /** The folder the server works in: the window's opened folder, or null for loose files. */
  root: string | null;
  /**
   * TypeScript only: `tsserver.js` of the TypeScript the app ships with. The
   * server prefers the opened folder's own TypeScript and falls back to this one.
   */
  fallbackTsserverPath: string | null;
  /**
   * Python only: the interpreter of a virtual environment in the opened
   * folder (`.venv`, `venv` or `env`), so imports resolve to its packages.
   * Null leaves it to the server, which uses `python` on the PATH.
   */
  pythonPath: string | null;
};

/** A server that stopped by itself (not through `stop`). */
export type LanguageServerExit = {
  id: number;
  code: number | null;
  signal: string | null;
  /** The last lines it wrote to stderr, to explain a crash. */
  stderr: string;
};
