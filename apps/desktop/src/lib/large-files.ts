import type * as Monaco from "monaco-editor";

/*
 * Files this big open in a lighter editor: no language server, Git blame,
 * minimap, folding or word wrap. Those send or lay out the whole text, which
 * makes big generated, minified or data files slow to open and to type in.
 */
const LARGE_FILE_CHARS = 2 * 1024 * 1024;
const LARGE_FILE_LINES = 100_000;

/** Turned off on top of the user's settings for large files. */
export const LARGE_FILE_EDITOR_OPTIONS: Monaco.editor.IEditorOptions = {
  minimap: { enabled: false },
  folding: false,
  wordWrap: "off",
};

/** Whether `text` has more than `limit` lines, without counting past it. */
const hasMoreLinesThan = (text: string, limit: number) => {
  let lines = 1;
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    if (++lines > limit) return true;
  }
  return false;
};

export const isLargeText = (text: string) =>
  text.length > LARGE_FILE_CHARS || hasMoreLinesThan(text, LARGE_FILE_LINES);

export const isLargeModel = (model: Monaco.editor.ITextModel) =>
  model.getValueLength() > LARGE_FILE_CHARS ||
  model.getLineCount() > LARGE_FILE_LINES;
