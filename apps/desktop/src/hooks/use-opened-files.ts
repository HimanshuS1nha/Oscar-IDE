import { create } from "zustand";

import { baseName, isSameOrInside, rebasePath } from "@/lib/paths";
import type { GitDiffRequest } from "../../electron/shared/git";

export type OpenedFile = {
  name: string;
  path: string;
  /**
   * Preview tabs (`false`) are replaced by the next preview file opened.
   * Permanent tabs (`true`) stay open until closed.
   */
  isPermanent: boolean;
  /**
   * Set for a Git diff of the file instead of the file itself. A file can be
   * open both ways at once, so tabs are told apart by `tabKey`.
   */
  diff?: Pick<GitDiffRequest, "staged" | "originalPath" | "commit">;
  /**
   * Set for a change the AI proposes to the file (an `edit_file` or
   * `write_file` call waiting for approval), shown as a read-only diff.
   */
  proposal?: { toolCallId: string };
  /**
   * Set for what one turn of the AI chat changed in the file, shown as a
   * read-only diff (`lib/ai/turn-changes`).
   */
  aiChange?: { key: string };
};

type TabIdentity = Pick<OpenedFile, "path" | "diff" | "proposal" | "aiChange">;

/** Identifies a tab: its path, plus which diff or proposal it shows, if any. */
export const tabKey = (file: TabIdentity) => {
  if (file.proposal) return `proposal:${file.proposal.toolCallId}`;
  if (file.aiChange) return `ai-change:${file.aiChange.key}`;
  if (!file.diff) return file.path;
  if (file.diff.commit)
    return `diff:commit:${file.diff.commit.hash}:${file.path}`;
  return `diff:${file.diff.staged ? "index" : "working"}:${file.path}`;
};

/** A tab showing the file itself rather than a Git diff or proposed change. */
export const isFileTab = (file: OpenedFile) =>
  !file.diff && !file.proposal && !file.aiChange;

/**
 * True if the tab edits the file on disk: its own tab, or an unstaged diff,
 * whose Working Tree side is the file. Every such tab of one path shares one
 * Monaco model, so they share its text, undo history and unsaved state.
 * Staged diffs (HEAD against the index), commit diffs, proposed changes and
 * AI changes are read-only.
 */
export const editsFile = (file: OpenedFile) =>
  !file.proposal &&
  !file.aiChange &&
  (!file.diff || (!file.diff.staged && !file.diff.commit));

type UseOpenedFiles = {
  fileInFocus: OpenedFile | null;
  openedFiles: OpenedFile[];
  /** Focuses an already opened tab (matched by `tabKey`). Unknown tabs are ignored. */
  setFileInFocus: (file: OpenedFile | null) => void;
  /**
   * Opens a tab and focuses it.
   * - Already open: just focus it, upgrading it to permanent if requested.
   * - New preview tab: takes over the existing preview tab's slot, if any.
   * - Otherwise: appended as a new tab.
   */
  addFile: (file: OpenedFile) => void;
  /** Closes a tab. If it was focused, focus moves to its neighbour. */
  removeFile: (file: TabIdentity) => void;
  /** Turns the preview tab editing `path` (see `editsFile`) into a permanent one without changing focus. */
  makePermanent: (path: string) => void;
  /**
   * Swaps the file tab for `oldPath` for `file` (after Save As), keeping its
   * place. If `file` is already open elsewhere, that tab is focused and this one closed.
   */
  replaceFile: (oldPath: string, file: OpenedFile) => void;
  /**
   * After `from` was renamed to `to`: points every tab at or inside `from` at
   * its new path. Their editor models are disposed, so move them first
   * (see `moveDocuments`).
   */
  renamePaths: (from: string, to: string) => void;
  /** Closes every tab at or inside `path` (after it was deleted). */
  closeInside: (path: string) => void;
  /** Closes every tab. */
  reset: () => void;
};

const isSameTab = (a: OpenedFile, b: TabIdentity) => tabKey(a) === tabKey(b);

export const useOpenedFiles = create<UseOpenedFiles>((set) => ({
  fileInFocus: null,
  openedFiles: [],

  setFileInFocus: (file) =>
    set((state) => {
      if (!file) return { fileInFocus: null };

      const opened = state.openedFiles.find((f) => isSameTab(f, file));
      return opened ? { fileInFocus: opened } : {};
    }),

  addFile: (file) =>
    set((state) => {
      const existingIndex = state.openedFiles.findIndex((f) =>
        isSameTab(f, file),
      );

      if (existingIndex !== -1) {
        const existing = state.openedFiles[existingIndex];
        if (!file.isPermanent || existing.isPermanent) {
          return { fileInFocus: existing };
        }

        const upgraded = { ...existing, isPermanent: true };
        const openedFiles = [...state.openedFiles];
        openedFiles[existingIndex] = upgraded;
        return { openedFiles, fileInFocus: upgraded };
      }

      const newFile = { ...file };
      const previewIndex = file.isPermanent
        ? -1
        : state.openedFiles.findIndex((f) => !f.isPermanent);

      if (previewIndex !== -1) {
        const openedFiles = [...state.openedFiles];
        openedFiles[previewIndex] = newFile;
        return { openedFiles, fileInFocus: newFile };
      }

      return {
        openedFiles: [...state.openedFiles, newFile],
        fileInFocus: newFile,
      };
    }),

  removeFile: (file) =>
    set((state) => {
      const index = state.openedFiles.findIndex((f) => isSameTab(f, file));
      if (index === -1) return {};

      const openedFiles = state.openedFiles.filter((_, i) => i !== index);

      if (!state.fileInFocus || !isSameTab(state.fileInFocus, file)) {
        return { openedFiles };
      }

      // Prefer the tab that slides into the closed one's place, else the one before it.
      const fileInFocus = openedFiles[index] ?? openedFiles[index - 1] ?? null;
      return { openedFiles, fileInFocus };
    }),

  makePermanent: (path) =>
    set((state) => {
      const isPreview = (f: OpenedFile) =>
        !f.isPermanent && f.path === path && editsFile(f);
      // Runs on every keystroke: return the same state so nothing re-renders.
      if (!state.openedFiles.some(isPreview)) return state;

      const openedFiles = state.openedFiles.map((f) =>
        isPreview(f) ? { ...f, isPermanent: true } : f,
      );
      return {
        openedFiles,
        fileInFocus:
          (state.fileInFocus &&
            openedFiles.find((f) => isSameTab(f, state.fileInFocus!))) ??
          state.fileInFocus,
      };
    }),

  replaceFile: (oldPath, file) =>
    set((state) => {
      const index = state.openedFiles.findIndex(
        (f) => isFileTab(f) && f.path === oldPath,
      );
      if (index === -1) return {};
      const old = state.openedFiles[index];

      const existing = state.openedFiles.find((f) => isSameTab(f, file));
      if (existing) {
        const kept = { ...existing, isPermanent: true };
        const openedFiles = state.openedFiles
          .filter((f) => f !== old)
          .map((f) => (f === existing ? kept : f));
        return { openedFiles, fileInFocus: kept };
      }

      const replacement = { ...file };
      const openedFiles = [...state.openedFiles];
      openedFiles[index] = replacement;
      return {
        openedFiles,
        fileInFocus:
          state.fileInFocus && isSameTab(state.fileInFocus, old)
            ? replacement
            : state.fileInFocus,
      };
    }),

  renamePaths: (from, to) =>
    set((state) => {
      if (!state.openedFiles.some((f) => isSameOrInside(f.path, from))) {
        return state;
      }
      const move = (file: OpenedFile): OpenedFile => {
        if (!isSameOrInside(file.path, from)) return file;
        const path = rebasePath(file.path, from, to);
        return { ...file, path, name: baseName(path) };
      };
      const openedFiles = state.openedFiles.map(move);
      const focused = state.fileInFocus && move(state.fileInFocus);
      return {
        openedFiles,
        fileInFocus:
          (focused && openedFiles.find((f) => isSameTab(f, focused))) ?? null,
      };
    }),

  closeInside: (path) =>
    set((state) => {
      const focusIndex = state.openedFiles.findIndex(
        (f) => state.fileInFocus && isSameTab(f, state.fileInFocus),
      );
      const openedFiles = state.openedFiles.filter(
        (f) => !isSameOrInside(f.path, path),
      );
      if (openedFiles.length === state.openedFiles.length) return state;

      if (state.fileInFocus && !isSameOrInside(state.fileInFocus.path, path)) {
        return { openedFiles };
      }
      // Focus the nearest remaining tab after the closed focused one, else before it.
      const after = state.openedFiles
        .slice(focusIndex + 1)
        .find((f) => !isSameOrInside(f.path, path));
      return { openedFiles, fileInFocus: after ?? openedFiles.at(-1) ?? null };
    }),

  reset: () => set({ openedFiles: [], fileInFocus: null }),
}));
