import { create } from "zustand";

import type { ServerLanguage } from "../../../electron/shared/language-server";

export type LanguageServerState =
  /** Not running: turned off, or no file of its language has been opened. */
  | { state: "off" }
  | { state: "starting" }
  | {
      state: "ready";
      /** e.g. TypeScript "5.9.3" or Pyright "1.1.414", once the server reports it. */
      version: string | null;
      /**
       * TypeScript: whether it's the opened folder's own ("workspace") or the
       * app's. Python: the virtual environment's interpreter, if one was found.
       */
      source: string | null;
      /** Work the server is doing, such as loading the project. */
      progress: string | null;
    }
  /** Stopped by itself too often to restart automatically. */
  | { state: "failed"; message: string };

/** Each language server's state, for the status bar. */
export const useLanguageServers = create<{
  status: Record<ServerLanguage, LanguageServerState>;
}>(() => ({
  status: { typescript: { state: "off" }, python: { state: "off" } },
}));

export const serverStatus = (language: ServerLanguage) =>
  useLanguageServers.getState().status[language];

export const setServerStatus = (
  language: ServerLanguage,
  status: LanguageServerState,
) =>
  useLanguageServers.setState((state) => ({
    status: { ...state.status, [language]: status },
  }));
