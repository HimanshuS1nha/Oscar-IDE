import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  useExplorerTree,
  type PendingCreation,
} from "@/hooks/use-explorer-tree";
import { directoryQuery } from "@/queries/directory-query";
import type { DirectoryEntry } from "@/types";

/** One line of the explorer, in display order. */
export type TreeRow =
  | {
      kind: "entry";
      key: string;
      entry: DirectoryEntry;
      depth: number;
      /** The listing `entry` is part of, for rename duplicate checks. */
      siblings: DirectoryEntry[];
    }
  | {
      kind: "create";
      key: string;
      pending: PendingCreation;
      depth: number;
      siblings: DirectoryEntry[];
    }
  | { kind: "loading"; key: string; depth: number }
  | { kind: "error"; key: string; depth: number; message: string }
  /** The opened folder itself has nothing in it. */
  | { kind: "empty"; key: string };

/**
 * Only what the rows use. A stable function, so React Query keeps the same
 * result while none of it changes, and the rows aren't rebuilt for nothing.
 */
const pickListings = (
  queries: { data?: DirectoryEntry[]; error: Error | null }[],
) => queries.map(({ data, error }) => ({ data, error }));

/**
 * The explorer as a flat list of rows, so only the ones on screen need to
 * render. Loads the listing of the opened folder and of each expanded folder
 * whose parents are all expanded too.
 */
export const useTreeRows = (root: string): TreeRow[] => {
  const queryClient = useQueryClient();
  const expandedPaths = useExplorerTree((state) => state.expandedPaths);
  const pendingCreation = useExplorerTree((state) => state.pendingCreation);

  // Found by walking the cached listings: a folder's listing is only fetched
  // once its parent's listing shows it. `useQueries` re-renders as each one
  // arrives, which extends the walk.
  const dirs = [root];
  for (let index = 0; index < dirs.length; index++) {
    const listing = queryClient.getQueryData(
      directoryQuery(dirs[index]).queryKey,
    );
    for (const entry of listing ?? []) {
      if (entry.type === "directory" && expandedPaths[entry.path]) {
        dirs.push(entry.path);
      }
    }
  }

  const results = useQueries({
    queries: dirs.map((dir) => directoryQuery(dir)),
    combine: pickListings,
  });

  return useMemo(() => {
    const listings = new Map(dirs.map((dir, index) => [dir, results[index]]));
    const rows: TreeRow[] = [];

    const addListing = (dir: string, depth: number) => {
      const result = listings.get(dir);
      if (result?.error) {
        rows.push({
          kind: "error",
          key: `error:${dir}`,
          depth,
          message: result.error.message,
        });
        return;
      }
      const entries = result?.data;
      if (!entries) {
        rows.push({ kind: "loading", key: `loading:${dir}`, depth });
        return;
      }

      const pending = pendingCreation?.parentPath === dir ? pendingCreation : null;
      if (entries.length === 0 && depth === 0 && !pending) {
        rows.push({ kind: "empty", key: "empty" });
        return;
      }

      // New folders go above everything, new files below the folders (as in VS Code).
      const insertAt = !pending
        ? -1
        : pending.type === "directory"
          ? 0
          : entries.filter((entry) => entry.type === "directory").length;
      const addInput = () =>
        pending &&
        rows.push({
          kind: "create",
          key: `create:${pending.id}`,
          pending,
          depth,
          siblings: entries,
        });

      entries.forEach((entry, index) => {
        if (index === insertAt) addInput();
        rows.push({
          kind: "entry",
          key: entry.path,
          entry,
          depth,
          siblings: entries,
        });
        if (entry.type === "directory" && expandedPaths[entry.path]) {
          addListing(entry.path, depth + 1);
        }
      });
      if (insertAt === entries.length) addInput();
    };

    addListing(root, 0);
    return rows;
    // `dirs` is derived from the same state as `results`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, results, expandedPaths, pendingCreation]);
};
