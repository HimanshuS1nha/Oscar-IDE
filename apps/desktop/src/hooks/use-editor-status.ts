import type * as Monaco from "monaco-editor";
import { useEffect, useState } from "react";

import { useCodeEditor } from "@/hooks/use-code-editor";
import { monaco } from "@/lib/monaco";

export type EditorStatus = {
  /** The model's URI, to tell files (`file:`) from diff sides. */
  uri: Monaco.Uri;
  line: number;
  column: number;
  /** Characters selected across all selections. */
  selectedChars: number;
  /** Number of cursors, when there is more than one. */
  cursorCount: number;
  languageName: string;
  insertSpaces: boolean;
  tabSize: number;
  eol: "LF" | "CRLF";
};

const languageName = (languageId: string) =>
  monaco.languages.getLanguages().find((language) => language.id === languageId)
    ?.aliases?.[0] ?? languageId;

const readStatus = (editor: Monaco.editor.ICodeEditor): EditorStatus | null => {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return null;

  const selections = editor.getSelections() ?? [];
  const options = model.getOptions();
  return {
    uri: model.uri,
    line: position.lineNumber,
    column: position.column,
    selectedChars: selections.reduce(
      (sum, selection) => sum + model.getValueLengthInRange(selection),
      0,
    ),
    cursorCount: selections.length,
    languageName: languageName(model.getLanguageId()),
    insertSpaces: options.insertSpaces,
    tabSize: options.tabSize,
    eol: model.getEOL() === "\r\n" ? "CRLF" : "LF",
  };
};

/** Cursor position and file details of the current editor, or null while none is showing. */
export const useEditorStatus = () => {
  const editor = useCodeEditor((state) => state.editor);
  const [status, setStatus] = useState<EditorStatus | null>(null);

  useEffect(() => {
    if (!editor) {
      setStatus(null);
      return;
    }
    const update = () => setStatus(readStatus(editor));
    update();

    const disposables = [
      editor.onDidChangeCursorSelection(update),
      editor.onDidChangeModel(update),
      editor.onDidChangeModelLanguage(update),
      editor.onDidChangeModelOptions(update),
      // Pasting text can change the line endings.
      editor.onDidChangeModelContent(update),
    ];
    return () => disposables.forEach((disposable) => disposable.dispose());
  }, [editor]);

  return status;
};
