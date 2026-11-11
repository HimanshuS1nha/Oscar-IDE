import type * as Monaco from "monaco-editor";

import { editorFontFamily } from "@/lib/monaco-theme";

import type { Settings } from "../../electron/shared/settings";

/** A font list from the settings, with the app's monospace font as the fallback. */
export const settingsFontFamily = (custom: string) =>
  custom.trim() ? `${custom.trim()}, ${editorFontFamily()}` : editorFontFamily();

/**
 * The editor's options from the user's settings. Shared by the code editor
 * and both sides of the diff view. Indentation is per file, so it is set on
 * the models instead (see `applyIndentation`).
 */
export const editorOptions = ({
  editor,
}: Settings): Monaco.editor.IEditorOptions => ({
  automaticLayout: true,
  fontFamily: settingsFontFamily(editor.fontFamily),
  fontLigatures: editor.fontLigatures,
  fontSize: editor.fontSize,
  // Monaco's default height for 13px is 20px; keep that ratio at other sizes.
  lineHeight: Math.round(editor.fontSize * 1.54),
  padding: { top: 8 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  renderLineHighlight: "line",
  wordWrap: editor.wordWrap ? "on" : "off",
  lineNumbers: editor.lineNumbers ? "on" : "off",
  cursorStyle: editor.cursorStyle,
  cursorBlinking: editor.cursorBlinking ? "blink" : "solid",
  minimap: { enabled: editor.minimap, renderCharacters: false },
});

/**
 * Sets a file's tab size and tabs-or-spaces from the settings, or guesses
 * them from its contents (falling back to the settings) when detection is on.
 */
export const applyIndentation = (
  model: Monaco.editor.ITextModel,
  { editor }: Settings,
) => {
  if (editor.detectIndentation) {
    model.detectIndentation(editor.insertSpaces, editor.tabSize);
  } else {
    model.updateOptions({
      tabSize: editor.tabSize,
      indentSize: editor.tabSize,
      insertSpaces: editor.insertSpaces,
    });
  }
};
