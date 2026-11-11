import { useCodeEditor } from "@/hooks/use-code-editor";

/**
 * Runs a Monaco command on the current editor, as if from its own keybinding.
 * Most commands (undo, clipboard…) only act on the focused editor, so it is
 * focused first. Call this once any menu has closed, or it takes focus back.
 */
const runEditorCommand = (commandId: string) => {
  const { editor } = useCodeEditor.getState();
  if (!editor) return;

  editor.focus();
  editor.trigger("menu", commandId, null);
};

export const undo = () => runEditorCommand("undo");
export const redo = () => runEditorCommand("redo");
export const cut = () => runEditorCommand("editor.action.clipboardCutAction");
export const copy = () => runEditorCommand("editor.action.clipboardCopyAction");
export const paste = () =>
  runEditorCommand("editor.action.clipboardPasteAction");
export const find = () => runEditorCommand("actions.find");
export const replace = () =>
  runEditorCommand("editor.action.startFindReplaceAction");

export const goToDefinition = () =>
  runEditorCommand("editor.action.revealDefinition");
export const findReferences = () =>
  runEditorCommand("editor.action.goToReferences");
export const renameSymbol = () => runEditorCommand("editor.action.rename");
export const quickFix = () => runEditorCommand("editor.action.quickFix");
export const formatDocument = () =>
  runEditorCommand("editor.action.formatDocument");
export const organizeImports = () =>
  runEditorCommand("editor.action.organizeImports");
