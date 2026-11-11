import { queryOptions } from "@tanstack/react-query";

export const FILE_QUERY_ROOT = ["file"] as const;

/**
 * Files the user chose to open although they're over the usual size limit.
 * Read by `fileQuery` rather than part of its key, so the file watcher's
 * invalidations still find the query.
 */
const largeFilesAllowed = new Set<string>();

/** "Open Anyway": the next read of `filePath` goes up to the hard limit. Refetch its query after. */
export const allowLargeFile = (filePath: string) => {
  largeFilesAllowed.add(filePath);
};

export const fileQuery = (filePath: string) =>
  queryOptions({
    queryKey: [...FILE_QUERY_ROOT, filePath],
    queryFn: () =>
      window.electron.file.readFile(filePath, {
        allowLarge: largeFilesAllowed.has(filePath),
      }),
    // The main-process file watcher invalidates contents when the file changes on disk.
    staleTime: Infinity,
    retry: false,
  });

/** An image's bytes for the preview. Under the file's key, so the same invalidations reach it. */
export const imageQuery = (filePath: string) =>
  queryOptions({
    queryKey: [...FILE_QUERY_ROOT, filePath, "image"],
    queryFn: () => window.electron.file.readImage(filePath),
    staleTime: Infinity,
    // Images are only held while a tab shows them.
    gcTime: 0,
    retry: false,
  });
