import { create } from "zustand";

import { useCurrentTab } from "@/hooks/use-current-tab";
import { useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { isSameOrInside, parentPath, rebasePath } from "@/lib/paths";
import type { DirectoryEntry } from "@/types";

export type NewEntryType = DirectoryEntry["type"];

/** An inline "New File" / "New Folder" input shown in the tree. */
export type PendingCreation = {
  /** Distinguishes repeated requests so the input remounts and refocuses. */
  id: number;
  type: NewEntryType;
  /** Directory the entry is created in. */
  parentPath: string;
};

type SelectedEntry = Pick<DirectoryEntry, "path" | "type">;

/** An entry whose row is showing the inline rename input. */
export type PendingRename = SelectedEntry & {
  /** Distinguishes repeated requests so the input remounts and refocuses. */
  id: number;
};

type UseExplorerTree = {
  /** Paths of expanded directories. Kept while a parent is collapsed. */
  expandedPaths: Record<string, true>;
  /** Last entry clicked in the tree, or the file focused in the editor. */
  selectedEntry: SelectedEntry | null;
  pendingCreation: PendingCreation | null;
  pendingRename: PendingRename | null;

  toggleExpanded: (path: string) => void;
  expand: (paths: string[]) => void;
  collapseAll: () => void;
  select: (entry: SelectedEntry | null) => void;
  /**
   * Shows the inline name input for a new file or folder in `parentPath`, or
   * next to the current selection (inside a selected folder, beside a selected
   * file, else at the root). Asks for a folder first if none is open.
   */
  startCreation: (type: NewEntryType, parentPath?: string) => Promise<void>;
  /** Turns an entry's row into an inline rename input. */
  startRename: (entry: SelectedEntry) => void;
  /** Hides the rename input, but only if it is still the one with `id` (or any, if omitted). */
  cancelRename: (id?: number) => void;
  /** After `from` was renamed to `to`: carries expansion and selection over. */
  renamePaths: (from: string, to: string) => void;
  /** After `path` was deleted: forgets its expansion and selection. */
  forgetInside: (path: string) => void;
  /** Hides the input, but only if it is still the one with `id` (or any, if omitted). */
  cancelCreation: (id?: number) => void;
  /** Forgets everything; used when a different folder is opened. */
  reset: () => void;
};

let nextInputId = 1;

/** Applies `update` to each expanded path at or inside `dir`; null drops it. */
const remapExpanded = (
  expandedPaths: Record<string, true>,
  dir: string,
  update: (path: string) => string | null,
) => {
  const next: Record<string, true> = {};
  for (const path of Object.keys(expandedPaths)) {
    const mapped = isSameOrInside(path, dir) ? update(path) : path;
    if (mapped) next[mapped] = true;
  }
  return next;
};

/** `path` and each of its ancestors up to, but excluding, `root`. */
const pathsUpTo = (root: string, path: string) => {
  const paths: string[] = [];
  let current = path;
  while (current !== root && current.length > root.length) {
    paths.push(current);
    const parent = parentPath(current);
    if (parent === current) break;
    current = parent;
  }
  return paths;
};

export const useExplorerTree = create<UseExplorerTree>((set, get) => ({
  expandedPaths: {},
  selectedEntry: null,
  pendingCreation: null,
  pendingRename: null,

  toggleExpanded: (path) =>
    set((state) => {
      const expandedPaths = { ...state.expandedPaths };
      if (expandedPaths[path]) delete expandedPaths[path];
      else expandedPaths[path] = true;
      return { expandedPaths };
    }),

  expand: (paths) =>
    set((state) => {
      const expandedPaths = { ...state.expandedPaths };
      for (const path of paths) expandedPaths[path] = true;
      return { expandedPaths };
    }),

  collapseAll: () => set({ expandedPaths: {} }),

  select: (entry) => set({ selectedEntry: entry }),

  startCreation: async (type, requestedParent) => {
    if (!useSelectedFolder.getState().selectedFolderPath) {
      await useSelectedFolder.getState().openFolder();
    }
    const root = useSelectedFolder.getState().selectedFolderPath;
    if (!root) return;

    useCurrentTab.getState().setCurrentTab("Explorer");

    const selected = get().selectedEntry;
    const target =
      requestedParent ??
      (!selected
        ? root
        : selected.type === "directory"
          ? selected.path
          : parentPath(selected.path));

    // A stale selection from outside the folder falls back to the root.
    const parent = target.startsWith(root) ? target : root;

    get().expand(pathsUpTo(root, parent));
    set({
      pendingCreation: { id: nextInputId++, type, parentPath: parent },
      pendingRename: null,
    });
  },

  startRename: (entry) =>
    set({
      pendingRename: { ...entry, id: nextInputId++ },
      pendingCreation: null,
      selectedEntry: entry,
    }),

  cancelRename: (id) =>
    set((state) =>
      id === undefined || state.pendingRename?.id === id
        ? { pendingRename: null }
        : state,
    ),

  renamePaths: (from, to) =>
    set((state) => ({
      expandedPaths: remapExpanded(state.expandedPaths, from, (path) =>
        rebasePath(path, from, to),
      ),
      selectedEntry:
        state.selectedEntry && isSameOrInside(state.selectedEntry.path, from)
          ? {
              ...state.selectedEntry,
              path: rebasePath(state.selectedEntry.path, from, to),
            }
          : state.selectedEntry,
      pendingCreation:
        state.pendingCreation &&
        isSameOrInside(state.pendingCreation.parentPath, from)
          ? null
          : state.pendingCreation,
    })),

  forgetInside: (path) =>
    set((state) => ({
      expandedPaths: remapExpanded(state.expandedPaths, path, () => null),
      selectedEntry:
        state.selectedEntry && isSameOrInside(state.selectedEntry.path, path)
          ? null
          : state.selectedEntry,
      pendingCreation:
        state.pendingCreation &&
        isSameOrInside(state.pendingCreation.parentPath, path)
          ? null
          : state.pendingCreation,
      pendingRename:
        state.pendingRename && isSameOrInside(state.pendingRename.path, path)
          ? null
          : state.pendingRename,
    })),

  cancelCreation: (id) =>
    set((state) =>
      id === undefined || state.pendingCreation?.id === id
        ? { pendingCreation: null }
        : {},
    ),

  reset: () =>
    set({
      expandedPaths: {},
      selectedEntry: null,
      pendingCreation: null,
      pendingRename: null,
    }),
}));

// The explorer selection follows the file focused in the editor, like VS Code.
useOpenedFiles.subscribe((state, previous) => {
  const file = state.fileInFocus;
  if (!file || file.path === previous.fileInFocus?.path) return;
  useExplorerTree.getState().select({ path: file.path, type: "file" });
});
