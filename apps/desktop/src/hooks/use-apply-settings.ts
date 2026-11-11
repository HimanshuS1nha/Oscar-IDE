import { useEffect } from "react";

import { useSettings } from "@/hooks/use-settings";
import { applyIndentation } from "@/lib/editor-options";
import { monaco } from "@/lib/monaco";
import { defineMonacoTheme, MONACO_THEME } from "@/lib/monaco-theme";
import {
  applyTerminalSettings,
  applyTerminalTheme,
} from "@/lib/terminal-sessions";

import type { Theme } from "../../electron/shared/settings";

/** Follows the OS for "Match system". The main process keeps it in step with the setting. */
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

/** Switches the page's colour tokens (see index.css) to `theme`. */
export const applyThemeClass = (theme: Theme) => {
  const isDark = theme === "system" ? prefersDark.matches : theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
};

/**
 * Applies settings that live outside React: the theme (page, Monaco and
 * terminals), each file's indentation and the open terminals' options.
 * Mounted once at the app root. The editors read their own options.
 */
export const useApplySettings = () => {
  const settings = useSettings((state) => state.settings);
  const { theme } = settings.appearance;
  const { tabSize, insertSpaces, detectIndentation } = settings.editor;

  useEffect(() => {
    const apply = () => {
      applyThemeClass(theme);
      // Monaco and xterm read their colours from the CSS tokens just switched.
      defineMonacoTheme(monaco);
      monaco.editor.setTheme(MONACO_THEME);
      applyTerminalTheme();
    };
    apply();
    if (theme !== "system") return;
    prefersDark.addEventListener("change", apply);
    return () => prefersDark.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const current = useSettings.getState().settings;
    for (const model of monaco.editor.getModels()) {
      applyIndentation(model, current);
    }
  }, [tabSize, insertSpaces, detectIndentation]);

  useEffect(() => {
    const listener = monaco.editor.onDidCreateModel((model) =>
      applyIndentation(model, useSettings.getState().settings),
    );
    return () => listener.dispose();
  }, []);

  useEffect(() => applyTerminalSettings(settings), [settings]);
};
