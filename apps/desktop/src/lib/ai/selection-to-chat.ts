import type * as Monaco from "monaco-editor";

import { useAiChat } from "@/hooks/use-ai-chat";
import { useCodeEditor } from "@/hooks/use-code-editor";

/**
 * Adds the editor's selection to the chat panel's next message and opens it.
 * With nothing selected, adds the cursor's line.
 */
export const addEditorSelectionToChat = (editor: Monaco.editor.ICodeEditor) => {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection || model.uri.scheme !== "file") return;

  let startLine = selection.startLineNumber;
  let endLine = selection.endLineNumber;
  // A selection ending at the start of a line doesn't include that line.
  if (endLine > startLine && selection.endColumn === 1) endLine--;
  if (selection.isEmpty()) startLine = endLine = selection.positionLineNumber;

  // Whole lines, so the code reads as it does in the file.
  const code = model.getValueInRange({
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: model.getLineMaxColumn(endLine),
  });
  if (!code.trim()) return;

  useAiChat.getState().addAttachment({
    path: model.uri.fsPath,
    startLine,
    endLine,
    language: model.getLanguageId(),
    code,
  });
};

/** For the Code menu and the command palette: acts on the current editor. */
export const addSelectionToChat = () => {
  const { editor } = useCodeEditor.getState();
  if (editor) addEditorSelectionToChat(editor);
};
