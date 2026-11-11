import { create } from "zustand";

import { useOpenedFiles, type OpenedFile } from "@/hooks/use-opened-files";
import type { FileChange, TurnFile } from "@/lib/ai/change-summary";
import { deleteEntry } from "@/lib/explorer-actions";
import { baseName } from "@/lib/paths";
import {
  readCurrentText,
  writeCurrentText,
  type WorkspacePath,
} from "@/tools/workspace";

/*
 * What the AI changed, for reviewing after a turn: `write_file` and
 * `edit_file` record each call's before and after here, by tool call id. The
 * chat sums up each turn's calls (`summarizeChanges`) under its reply, with a
 * diff per file and one undo for the whole turn. This matters most in full
 * access mode, where changes apply without a diff to approve.
 *
 * Only the file tools are recorded: what a `bash` command changes isn't.
 * Kept in memory, so a reloaded chat has no summary.
 */

type UseTurnChanges = {
  /** By tool call id. */
  changes: Record<string, FileChange>;
  /** Files whose turn change was undone, by `changeKey`. */
  undone: Record<string, true>;
  /** What each open AI change tab shows, by `changeKey`. */
  diffs: Record<string, TurnFile>;
};

export const useTurnChanges = create<UseTurnChanges>(() => ({
  changes: {},
  undone: {},
  diffs: {},
}));

/** One file's change in one turn. A turn is named by its first tool call. */
export const changeKey = (turnId: string, path: string) => `${turnId}\n${path}`;

/** Called by the file tools once a change is made. */
export const recordFileChange = (
  toolCallId: string | undefined,
  change: FileChange,
) => {
  // Outside a chat run there's no turn to show it under.
  if (!toolCallId) return;
  useTurnChanges.setState(({ changes }) => ({
    changes: { ...changes, [toolCallId]: change },
  }));
};

/** Forgets the changes of the chat being left. Open diff tabs keep theirs. */
export const forgetTurnChanges = () =>
  useTurnChanges.setState({ changes: {}, undone: {} });

const aiChangeTab = (key: string, file: TurnFile): OpenedFile => ({
  name: baseName(file.path),
  path: file.path,
  isPermanent: true,
  aiChange: { key },
});

/** Shows a file's change in a read-only diff tab. */
export const openTurnChange = (turnId: string, file: TurnFile) => {
  const key = changeKey(turnId, file.path);
  useTurnChanges.setState(({ diffs }) => ({
    diffs: { ...diffs, [key]: file },
  }));
  useOpenedFiles.getState().addFile(aiChangeTab(key, file));
};

/** Why a file's change couldn't be undone, for the user. */
export class UndoSkipped extends Error {}

/**
 * Puts the file back how it was before the turn, if it's still as the turn
 * left it: a later change, the user's or the AI's, is never overwritten. A
 * file the turn created is moved to the trash, after the user confirms.
 * Resolves to false if the user cancelled; throws `UndoSkipped` otherwise.
 */
const undoFile = async (file: TurnFile) => {
  const target: WorkspacePath = {
    absolute: file.path,
    relative: file.relativePath,
  };
  const current = await readCurrentText(target).catch(() => null);
  if (!current) {
    throw new UndoSkipped(`${file.relativePath} no longer exists.`);
  }
  if (current.text !== file.after) {
    throw new UndoSkipped(`${file.relativePath} changed after the AI's edit.`);
  }

  if (file.before === null) {
    return deleteEntry({ path: file.path, type: "file" });
  }
  await writeCurrentText(target, current, file.before);
  return true;
};

/**
 * Undoes the turn's change to each file in `files`. Resolves to the files
 * left as they were, with why.
 */
export const undoTurnChanges = async (
  turnId: string,
  files: ReadonlyArray<TurnFile>,
) => {
  const skipped: string[] = [];
  for (const file of files) {
    const key = changeKey(turnId, file.path);
    if (useTurnChanges.getState().undone[key]) continue;
    try {
      if (!(await undoFile(file))) continue;
    } catch (error) {
      skipped.push(
        error instanceof UndoSkipped
          ? error.message
          : `${file.relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    useTurnChanges.setState(({ undone }) => ({
      undone: { ...undone, [key]: true },
    }));
  }
  return skipped;
};
