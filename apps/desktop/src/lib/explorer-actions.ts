import type { DirectoryEntry } from "@/types";
import { useDirtyFiles } from "@/hooks/use-dirty-files";
import { useExplorerTree } from "@/hooks/use-explorer-tree";
import { editsFile, useOpenedFiles } from "@/hooks/use-opened-files";
import { moveDocuments } from "@/lib/file-documents";
import { isSameOrInside, parentPath } from "@/lib/paths";
import { queryClient } from "@/lib/query-client";
import {
  DIRECTORY_QUERY_ROOT,
  directoryQuery,
} from "@/queries/directory-query";
import { FILE_QUERY_ROOT } from "@/queries/file-query";

/** Rename and delete for explorer entries, keeping tabs, tree state and caches in step. */

type Entry = Pick<DirectoryEntry, "path" | "type">;

const CACHED_ROOTS = new Set<unknown>([
  DIRECTORY_QUERY_ROOT[0],
  FILE_QUERY_ROOT[0],
]);

/** Drops cached listings and contents at or inside `path`, which no longer exists there. */
const forgetCachedPaths = (path: string) =>
  queryClient.removeQueries({
    predicate: ({ queryKey: [root, cachedPath] }) =>
      CACHED_ROOTS.has(root) &&
      typeof cachedPath === "string" &&
      isSameOrInside(cachedPath, path),
  });

/** Shows the change now rather than waiting for the file watcher. */
const refreshParent = (path: string) =>
  queryClient.invalidateQueries({
    queryKey: directoryQuery(parentPath(path)).queryKey,
    exact: true,
  });

/** Renames an entry in place. Throws (with a message to show) if it can't. */
export const renameEntry = async (entry: Entry, newName: string) => {
  const newPath = await window.electron.file.renameEntry(entry.path, newName);
  if (newPath === entry.path) return;

  moveDocuments(entry.path, newPath);
  useExplorerTree.getState().renamePaths(entry.path, newPath);
  forgetCachedPaths(entry.path);
  await refreshParent(entry.path);
};

/** Asks for confirmation (in the main process), then moves the entry to the trash. */
export const deleteEntry = async (entry: Entry) => {
  const { dirtyPaths } = useDirtyFiles.getState();
  // Counted by path: a file's tab and its unstaged diff share its edits.
  const unsavedFileCount = new Set(
    useOpenedFiles
      .getState()
      .openedFiles.filter(
        (file) =>
          editsFile(file) &&
          dirtyPaths[file.path] &&
          isSameOrInside(file.path, entry.path),
      )
      .map((file) => file.path),
  ).size;

  const result = await window.electron.file.deleteEntry({
    path: entry.path,
    type: entry.type,
    unsavedFileCount,
  });
  if (result.status !== "deleted") return false;

  // Closing the tabs disposes their models, discarding any unsaved edits.
  useOpenedFiles.getState().closeInside(entry.path);
  useExplorerTree.getState().forgetInside(entry.path);
  forgetCachedPaths(entry.path);
  await refreshParent(entry.path);
  return true;
};
