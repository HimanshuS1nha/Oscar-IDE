import { queryOptions } from "@tanstack/react-query";

export const DIRECTORY_QUERY_ROOT = ["directory"] as const;

export const directoryQuery = (dirPath: string) =>
  queryOptions({
    queryKey: [...DIRECTORY_QUERY_ROOT, dirPath],
    queryFn: () => window.electron.file.readDirectory(dirPath),
    // The main-process file watcher invalidates listings when they change on disk.
    staleTime: Infinity,
    retry: false,
  });
