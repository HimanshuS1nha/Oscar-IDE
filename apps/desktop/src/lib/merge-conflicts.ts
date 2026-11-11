import type * as Monaco from "monaco-editor";

import { useCodeEditor } from "@/hooks/use-code-editor";
import { monaco } from "@/lib/monaco";
import { createColorReader } from "@/lib/monaco-theme";

/**
 * Merge conflicts as Git writes them into a file:
 *
 *   <<<<<<< HEAD            (current: what you had)
 *   …
 *   ||||||| base            (only with merge.conflictStyle = diff3/zdiff3)
 *   …
 *   =======
 *   …                       (incoming: what is being merged in)
 *   >>>>>>> feature
 *
 * Found in the editor's text, so they're resolved like any edit: undoable,
 * and saved with the file.
 */

/** Lines `start`…`end`, 1-based and inclusive; empty when `end < start`. */
export type LineRange = { start: number; end: number };

export type MergeConflict = {
  /** The `<<<<<<<` line. */
  start: number;
  /** The `>>>>>>>` line. */
  end: number;
  current: LineRange;
  /** The common ancestor's lines, with diff3-style markers. */
  base: (LineRange & { marker: number }) | null;
  /** The `=======` line. */
  separator: number;
  incoming: LineRange;
  /** Text after the markers, e.g. `HEAD` and `feature`. */
  currentLabel: string;
  incomingLabel: string;
};

export type ConflictChoice = "current" | "incoming" | "both";

const START = /^<{7}(?:\s(.*))?$/;
const BASE = /^\|{7}(?:\s.*)?$/;
const SEPARATOR = /^={7}\s*$/;
const END = /^>{7}(?:\s(.*))?$/;

/** Cheap check before scanning every line. */
export const mayHaveConflicts = (model: Monaco.editor.ITextModel) =>
  model.findNextMatch(
    "<<<<<<<",
    { lineNumber: 1, column: 1 },
    false,
    true,
    null,
    false,
  ) !== null;

export const parseConflicts = (
  model: Monaco.editor.ITextModel,
): MergeConflict[] => {
  if (!mayHaveConflicts(model)) return [];
  const conflicts: MergeConflict[] = [];
  const lineCount = model.getLineCount();

  let open: {
    start: number;
    currentLabel: string;
    base: number | null;
    separator: number | null;
  } | null = null;

  for (let line = 1; line <= lineCount; line++) {
    const text = model.getLineContent(line);
    const start = START.exec(text);
    if (start) {
      // A new start before the old one ended: the old one was malformed.
      open = {
        start: line,
        currentLabel: start[1] ?? "",
        base: null,
        separator: null,
      };
      continue;
    }
    if (!open) continue;

    if (open.separator === null && open.base === null && BASE.test(text)) {
      open.base = line;
    } else if (open.separator === null && SEPARATOR.test(text)) {
      open.separator = line;
    } else if (open.separator !== null) {
      const end = END.exec(text);
      if (!end) continue;
      const currentEnd = (open.base ?? open.separator) - 1;
      conflicts.push({
        start: open.start,
        end: line,
        current: { start: open.start + 1, end: currentEnd },
        base:
          open.base === null
            ? null
            : {
                marker: open.base,
                start: open.base + 1,
                end: open.separator - 1,
              },
        separator: open.separator,
        incoming: { start: open.separator + 1, end: line - 1 },
        currentLabel: open.currentLabel,
        incomingLabel: end[1] ?? "",
      });
      open = null;
    }
  }
  return conflicts;
};

const linesOf = (model: Monaco.editor.ITextModel, range: LineRange) => {
  const lines: string[] = [];
  for (let line = range.start; line <= range.end; line++) {
    lines.push(model.getLineContent(line));
  }
  return lines;
};

/** The edit that replaces a whole conflict, markers included, with the chosen side(s). */
const resolutionEdit = (
  model: Monaco.editor.ITextModel,
  conflict: MergeConflict,
  choice: ConflictChoice,
): Monaco.editor.IIdentifiedSingleEditOperation => {
  const lines =
    choice === "current"
      ? linesOf(model, conflict.current)
      : choice === "incoming"
        ? linesOf(model, conflict.incoming)
        : [
            ...linesOf(model, conflict.current),
            ...linesOf(model, conflict.incoming),
          ];
  const eol = model.getEOL();

  if (conflict.end < model.getLineCount()) {
    // Replace up to the start of the line after the markers, keeping that line.
    return {
      range: new monaco.Range(conflict.start, 1, conflict.end + 1, 1),
      text: lines.length ? lines.join(eol) + eol : "",
    };
  }
  // The conflict ends the file: there is no next line to stop at.
  if (!lines.length && conflict.start > 1) {
    return {
      range: new monaco.Range(
        conflict.start - 1,
        model.getLineMaxColumn(conflict.start - 1),
        conflict.end,
        model.getLineMaxColumn(conflict.end),
      ),
      text: "",
    };
  }
  return {
    range: new monaco.Range(
      conflict.start,
      1,
      conflict.end,
      model.getLineMaxColumn(conflict.end),
    ),
    text: lines.join(eol),
  };
};

/** The editor showing `model`, so edits join its undo stack. */
const editorFor = (model: Monaco.editor.ITextModel) => {
  const { editor } = useCodeEditor.getState();
  return editor?.getModel() === model ? editor : null;
};

const applyEdits = (
  model: Monaco.editor.ITextModel,
  edits: Monaco.editor.IIdentifiedSingleEditOperation[],
) => {
  if (!edits.length) return;
  const editor = editorFor(model);
  if (editor) {
    editor.pushUndoStop();
    editor.executeEdits("merge-conflict", edits);
    editor.pushUndoStop();
  } else {
    model.pushEditOperations([], edits, () => null);
  }
};

export const resolveConflict = (
  model: Monaco.editor.ITextModel,
  conflict: MergeConflict,
  choice: ConflictChoice,
) => applyEdits(model, [resolutionEdit(model, conflict, choice)]);

/** Resolves every conflict in the focused editor the same way. */
export const acceptAllConflicts = (choice: ConflictChoice) => {
  const model = useCodeEditor.getState().editor?.getModel();
  if (!model) return;
  applyEdits(
    model,
    parseConflicts(model).map((conflict) =>
      resolutionEdit(model, conflict, choice),
    ),
  );
};

/** Moves the cursor to the next or previous conflict, wrapping around. */
export const goToConflict = (direction: "next" | "previous") => {
  const { editor } = useCodeEditor.getState();
  const model = editor?.getModel();
  if (!editor || !model) return;
  const conflicts = parseConflicts(model);
  if (!conflicts.length) return;

  const line = editor.getPosition()?.lineNumber ?? 1;
  const target =
    direction === "next"
      ? (conflicts.find((c) => c.start > line) ?? conflicts[0])
      : (conflicts.findLast((c) => c.start < line) ?? conflicts.at(-1)!);
  editor.setPosition({ lineNumber: target.start, column: 1 });
  editor.revealLineInCenterIfOutsideViewport(target.start);
  editor.focus();
};

/* ------------------------------ Editor features ----------------------------- */

const ACCEPT_COMMAND = "oscar.mergeConflict.accept";

let registered = false;

/**
 * "Accept Current Change | Accept Incoming Change | Accept Both Changes" above
 * every conflict, as in VS Code. Registered once for every language.
 */
export const registerConflictCodeLens = () => {
  if (registered) return;
  registered = true;

  monaco.editor.registerCommand(
    ACCEPT_COMMAND,
    (_accessor, uri: string, start: number, choice: ConflictChoice) => {
      const model = monaco.editor.getModel(monaco.Uri.parse(uri));
      if (!model) return;
      // Found again: the text may have changed since the lens was drawn.
      const conflict = parseConflicts(model).find((c) => c.start === start);
      if (conflict) resolveConflict(model, conflict, choice);
    },
  );

  monaco.languages.registerCodeLensProvider("*", {
    provideCodeLenses: (model) => {
      // Only real files: a diff's read-only sides can't be resolved.
      if (model.uri.scheme !== "file") return { lenses: [], dispose: () => {} };
      const lenses = parseConflicts(model).flatMap((conflict) => {
        const range = new monaco.Range(conflict.start, 1, conflict.start, 1);
        const lens = (title: string, choice: ConflictChoice) => ({
          range,
          command: {
            id: ACCEPT_COMMAND,
            title,
            arguments: [model.uri.toString(), conflict.start, choice],
          },
        });
        return [
          lens("Accept Current Change", "current"),
          lens("Accept Incoming Change", "incoming"),
          lens("Accept Both Changes", "both"),
        ];
      });
      return { lenses, dispose: () => {} };
    },
  });
};

/** Line backgrounds for each part of a conflict, with marks in the scrollbar. */
export const conflictDecorations = (
  conflicts: MergeConflict[],
): Monaco.editor.IModelDeltaDecoration[] => {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
  const add = (range: LineRange, className: string, ruler?: string) => {
    if (range.end < range.start) return;
    decorations.push({
      range: new monaco.Range(range.start, 1, range.end, 1),
      options: {
        isWholeLine: true,
        className,
        ...(ruler && {
          overviewRuler: {
            color: ruler,
            position: monaco.editor.OverviewRulerLane.Full,
          },
          minimap: {
            color: ruler,
            position: monaco.editor.MinimapPosition.Inline,
          },
        }),
      },
    });
  };
  const color = createColorReader();
  const currentColor = color("--merge-current", 0.8);
  const incomingColor = color("--merge-incoming", 0.8);

  for (const conflict of conflicts) {
    add({ start: conflict.start, end: conflict.start }, "merge-current-header");
    add(conflict.current, "merge-current", currentColor);
    if (conflict.base) {
      add(
        { start: conflict.base.marker, end: conflict.base.marker },
        "merge-base-header",
      );
      add(conflict.base, "merge-base");
    }
    add(
      { start: conflict.separator, end: conflict.separator },
      "merge-separator",
    );
    add(conflict.incoming, "merge-incoming", incomingColor);
    add({ start: conflict.end, end: conflict.end }, "merge-incoming-header");
  }
  return decorations;
};
