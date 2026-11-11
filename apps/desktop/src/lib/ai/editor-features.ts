/**
 * The editor's AI features: inline suggestions, "Add Selection to Chat" and
 * "Explain Error". Imported once by the code editor, like lib/lsp.
 */
import type * as Monaco from "monaco-editor";

import { explainEditorError, explainMarkers } from "@/lib/ai/explain-error";
import { addEditorSelectionToChat } from "@/lib/ai/selection-to-chat";
import "@/lib/ai/inline-completions";
import { monaco } from "@/lib/monaco";

/** In every editor's context menu, and on Ctrl/Cmd+L while an editor has focus. */
const addSelectionAction = monaco.editor.addEditorAction({
  id: "oscar.ai.addSelectionToChat",
  label: "Add Selection to Chat",
  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
  contextMenuGroupId: "0_ai",
  contextMenuOrder: 1,
  run: addEditorSelectionToChat,
});

/** In every editor's context menu: the problems at the cursor, or the selected text. */
const explainAction = monaco.editor.addEditorAction({
  id: "oscar.ai.explainError",
  label: "Explain Error with AI",
  contextMenuGroupId: "0_ai",
  contextMenuOrder: 2,
  run: explainEditorError,
});

const EXPLAIN_MARKER_COMMAND = "oscar.ai.explainMarker";

const explainCommand = monaco.editor.registerCommand(
  EXPLAIN_MARKER_COMMAND,
  (_accessor, uri: string, marker: Monaco.editor.IMarkerData) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(uri));
    if (model) explainMarkers(model, [marker]);
  },
);

/** "Explain with AI" in the light bulb (Quick Fix) for each error and warning. */
const explainCodeActions = monaco.languages.registerCodeActionProvider("*", {
  provideCodeActions: (model, _range, context) => {
    // Only for files: a diff's read-only sides have nothing to fix.
    if (model.uri.scheme !== "file") return undefined;
    const actions = context.markers
      .filter((marker) => marker.severity >= monaco.MarkerSeverity.Warning)
      .map((marker): Monaco.languages.CodeAction => ({
        title: `Explain with AI: ${marker.message.split("\n")[0].slice(0, 60)}`,
        kind: "quickfix",
        diagnostics: [marker],
        command: {
          id: EXPLAIN_MARKER_COMMAND,
          title: "Explain with AI",
          arguments: [model.uri.toString(), marker],
        },
      }));
    return { actions, dispose: () => {} };
  },
});

// Vite reloads this module on edits; don't register anything twice.
import.meta.hot?.dispose(() => {
  addSelectionAction.dispose();
  explainAction.dispose();
  explainCommand.dispose();
  explainCodeActions.dispose();
});
