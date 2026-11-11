import type * as Monaco from "monaco-editor";
import { toast } from "react-hot-toast";

import { useAiChat } from "@/hooks/use-ai-chat";
import { useCodeEditor } from "@/hooks/use-code-editor";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useTerminals } from "@/hooks/use-terminals";
import { monaco } from "@/lib/monaco";
import { isSameOrInside } from "@/lib/paths";
import { readTerminalText } from "@/lib/terminal-sessions";

/**
 * "Explain this error": asks the chat about an error from the terminal or
 * the editor. The message carries the error and where it came from; the
 * model can read the files itself.
 */

const ASK = "Explain this error and how to fix it.";

/** Lines of code shown around an editor problem. */
const CONTEXT_LINES = 3;
const MAX_CONTEXT_LINES = 40;

/** A path from the opened folder, or the whole path for files outside it. */
const displayPath = (path: string) => {
  const folder = useSelectedFolder.getState().selectedFolderPath;
  return folder && isSameOrInside(path, folder)
    ? path.slice(folder.replace(/[\\/]+$/, "").length + 1)
    : path;
};

/** A fence longer than any run of backticks in `text`, so it can't end early. */
const fence = (text: string, language = "") => {
  const longest = Math.max(
    2,
    ...[...text.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${language}\n${text}\n${ticks}`;
};

// ---------------------------------------------------------------- terminal

/**
 * Explains the active terminal's selection, or its recent output when nothing
 * is selected.
 */
export const explainTerminalOutput = () => {
  const { activeId, terminals } = useTerminals.getState();
  const terminal = terminals.find((item) => item.id === activeId);
  const output = activeId === null ? null : readTerminalText(activeId);
  if (!terminal || !output) {
    toast.error("There's no terminal output to explain.");
    return;
  }

  const source = output.isSelection
    ? "This is from my terminal"
    : "This is the latest output in my terminal";
  useAiChat
    .getState()
    .ask(
      `${ASK}\n\n${source} (shell: ${terminal.title}, started in ${displayPath(terminal.cwd)}):\n\n${fence(output.text)}`,
    );
};

// ------------------------------------------------------------------ editor

const severityName = (severity: Monaco.MarkerSeverity) => {
  switch (severity) {
    case monaco.MarkerSeverity.Error:
      return "error";
    case monaco.MarkerSeverity.Warning:
      return "warning";
    case monaco.MarkerSeverity.Info:
      return "info";
    default:
      return "hint";
  }
};

/** Errors and warnings; hints and info are rarely worth a question. */
const isProblem = (marker: Monaco.editor.IMarkerData) =>
  marker.severity >= monaco.MarkerSeverity.Warning;

const describeMarker = (path: string, marker: Monaco.editor.IMarkerData) => {
  const code =
    typeof marker.code === "string" ? marker.code : marker.code?.value;
  const origin = [code, marker.source && `(${marker.source})`]
    .filter(Boolean)
    .join(" ");
  return `${path}:${marker.startLineNumber}:${marker.startColumn}: ${severityName(marker.severity)}${origin ? ` ${origin}` : ""}: ${marker.message}`;
};

/** Asks about `markers` in `model`, with the code around them. */
export const explainMarkers = (
  model: Monaco.editor.ITextModel,
  markers: Monaco.editor.IMarkerData[],
) => {
  if (markers.length === 0) return;
  const path = displayPath(model.uri.fsPath);

  let startLine = Math.max(
    1,
    Math.min(...markers.map((marker) => marker.startLineNumber)) -
      CONTEXT_LINES,
  );
  const endLine = Math.min(
    model.getLineCount(),
    Math.max(...markers.map((marker) => marker.endLineNumber)) + CONTEXT_LINES,
    startLine + MAX_CONTEXT_LINES - 1,
  );
  startLine = Math.max(1, Math.min(startLine, endLine));
  const code = model.getValueInRange({
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: model.getLineMaxColumn(endLine),
  });

  const problems = markers
    .map((marker) => describeMarker(path, marker))
    .join("\n");
  const lines =
    startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  useAiChat
    .getState()
    .ask(
      `${ASK}\n\n${fence(problems)}\n\n${path}:${lines}\n${fence(code, model.getLanguageId())}`,
    );
};

/** The errors and warnings on the lines of the editor's selection, or its cursor's line. */
const markersAtSelection = (
  model: Monaco.editor.ITextModel,
  selection: Monaco.Selection,
) => {
  const all = monaco.editor
    .getModelMarkers({ resource: model.uri })
    .filter(isProblem);
  if (selection.isEmpty()) {
    // Problems under the cursor first; else any on its line.
    const position = selection.getPosition();
    const under = all.filter((marker) =>
      monaco.Range.containsPosition(marker, position),
    );
    if (under.length > 0) return under;
  }
  return all.filter(
    (marker) =>
      marker.startLineNumber <= selection.endLineNumber &&
      marker.endLineNumber >= selection.startLineNumber,
  );
};

/**
 * Explains the problems at the editor's cursor or selection. With none
 * there, a selection is taken to be an error message itself (e.g. a stack
 * trace in a log file).
 */
export const explainEditorError = (editor: Monaco.editor.ICodeEditor) => {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const markers = markersAtSelection(model, selection);
  if (markers.length > 0) {
    explainMarkers(model, markers);
    return;
  }

  const selected = model.getValueInRange(selection).trim();
  if (selected) {
    const path = displayPath(model.uri.fsPath);
    useAiChat.getState().ask(`${ASK}\n\nFrom ${path}:\n\n${fence(selected)}`);
    return;
  }
  toast.error(
    "There's no error or warning here. Select an error message to explain it.",
  );
};

/** For the Code menu and the command palette: acts on the current editor. */
export const explainError = () => {
  const { editor } = useCodeEditor.getState();
  if (editor) explainEditorError(editor);
};
