import { queryOptions } from "@tanstack/react-query";

export const WORKSPACE_FILES_QUERY_ROOT = ["workspace-files"] as const;

/**
 * Every file in the opened folder, for quick open. Keyed by folder;
 * `useFileTreeSync` marks it stale when files are added, removed or renamed,
 * and it is fetched again the next time the palette opens.
 */
export const workspaceFilesQuery = (folderPath: string | null) =>
  queryOptions({
    queryKey: [...WORKSPACE_FILES_QUERY_ROOT, folderPath],
    queryFn: () => window.electron.search.listFiles(),
    enabled: !!folderPath,
    staleTime: Infinity,
    retry: false,
  });
