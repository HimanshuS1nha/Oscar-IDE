import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import type { GitDiffRequest } from "../../electron/shared/git";

export const GIT_QUERY_ROOT = ["git"] as const;

/**
 * Git status of the opened folder. Keyed by folder so a new folder never shows
 * the previous one's changes. `useGitSync` refreshes it when anything changes.
 */
export const gitStatusQuery = (folderPath: string | null) =>
  queryOptions({
    queryKey: [...GIT_QUERY_ROOT, "status", folderPath],
    queryFn: () => window.electron.git.status(),
    enabled: !!folderPath,
    staleTime: Infinity,
    retry: false,
  });

export const gitBranchesQuery = (folderPath: string | null) =>
  queryOptions({
    queryKey: [...GIT_QUERY_ROOT, "branches", folderPath],
    queryFn: () => window.electron.git.branches(),
    enabled: !!folderPath,
    staleTime: Infinity,
    retry: false,
  });

/**
 * Both sides of a changed file's diff. Under GIT_QUERY_ROOT, so `useGitSync`
 * refreshes it whenever files or `.git` change, like the status.
 */
export const gitDiffQuery = (request: GitDiffRequest) =>
  queryOptions({
    queryKey: [
      ...GIT_QUERY_ROOT,
      "diff",
      request.path,
      request.staged,
      request.originalPath ?? null,
      request.commit?.hash ?? null,
    ],
    queryFn: () => window.electron.git.diff(request),
    staleTime: Infinity,
    retry: false,
  });

/** Commits loaded per page of the graph. */
export const GIT_LOG_PAGE_SIZE = 200;

/** Commit history for the graph, a page at a time. Refreshed with the status. */
export const gitLogQuery = (folderPath: string | null, allBranches: boolean) =>
  infiniteQueryOptions({
    queryKey: [...GIT_QUERY_ROOT, "log", folderPath, allBranches],
    queryFn: ({ pageParam }) =>
      window.electron.git.log({
        skip: pageParam,
        limit: GIT_LOG_PAGE_SIZE,
        allBranches,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore
        ? pages.reduce((count, page) => count + page.commits.length, 0)
        : undefined,
    enabled: !!folderPath,
    staleTime: Infinity,
    retry: false,
  });

/**
 * The files a commit changed. A commit never changes, so this sits outside
 * GIT_QUERY_ROOT and isn't refetched on every refresh.
 */
export const gitCommitFilesQuery = (folderPath: string | null, hash: string) =>
  queryOptions({
    queryKey: ["git-commit-files", folderPath, hash],
    queryFn: () => window.electron.git.commitFiles(hash),
    enabled: !!folderPath,
    staleTime: Infinity,
    retry: false,
  });

/** Stash entries, refreshed with the status. */
export const gitStashesQuery = (folderPath: string | null) =>
  queryOptions({
    queryKey: [...GIT_QUERY_ROOT, "stashes", folderPath],
    queryFn: () => window.electron.git.stashes(),
    enabled: !!folderPath,
    staleTime: Infinity,
    retry: false,
  });

/** The files in a stash. A stash commit never changes, like any commit. */
export const gitStashFilesQuery = (folderPath: string | null, hash: string) =>
  queryOptions({
    queryKey: ["git-stash-files", folderPath, hash],
    queryFn: () => window.electron.git.stashFiles(hash),
    enabled: !!folderPath,
    staleTime: Infinity,
    retry: false,
  });

/**
 * Who last changed each line of `path`, as of `contents`. Keyed by the
 * editor's version so edits re-blame, and under GIT_QUERY_ROOT so a commit
 * does too.
 */
export const gitBlameQuery = (
  path: string | null,
  version: number,
  contents: () => string,
) =>
  queryOptions({
    queryKey: [...GIT_QUERY_ROOT, "blame", path, version],
    queryFn: () =>
      window.electron.git.blame({ path: path!, contents: contents() }),
    enabled: !!path,
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  });
