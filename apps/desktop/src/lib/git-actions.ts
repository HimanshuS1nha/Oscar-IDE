import { create } from "zustand";

import { useOpenedFiles, type OpenedFile } from "@/hooks/use-opened-files";
import { baseName } from "@/lib/paths";
import { queryClient } from "@/lib/query-client";
import { GIT_QUERY_ROOT } from "@/queries/git-query";
import type {
  GitActionResult,
  GitChange,
  GitCommit,
  GitCommitFile,
  GitStash,
  GitStashFile,
} from "../../electron/shared/git";

/**
 * Git actions for the UI. Each one refreshes status afterwards; errors and
 * confirmations are shown by the main process.
 */

type LongOperation =
  | "init"
  | "commit"
  | "pull"
  | "push"
  | "checkout"
  | "stash";

type UseGitUi = {
  /** The slow operation in progress, to show a spinner and block others. */
  running: LongOperation | null;
  /** Kept here so it survives switching tabs. */
  commitMessage: string;
  setCommitMessage: (commitMessage: string) => void;
  /** An AI commit message suggestion is on its way (see lib/ai/commit-message). */
  suggestingMessage: boolean;
  /** The Graph section: expanded, its height, and whether it shows every branch. */
  graphOpen: boolean;
  graphHeight: number;
  graphAllBranches: boolean;
  /** The Stash dialog, open with whether it includes untracked files. */
  stashDialog: { includeUntracked: boolean } | null;
  /** Shows who last changed the cursor's line, in the editor and status bar. */
  blameEnabled: boolean;
};

export const useGitUi = create<UseGitUi>((set) => ({
  running: null,
  commitMessage: "",
  suggestingMessage: false,
  graphOpen: true,
  graphHeight: 320,
  graphAllBranches: false,
  stashDialog: null,
  blameEnabled: true,
  setCommitMessage: (commitMessage) => set({ commitMessage }),
}));

const refresh = () =>
  queryClient.invalidateQueries({ queryKey: GIT_QUERY_ROOT });

const run = async (
  operation: LongOperation | null,
  action: () => Promise<GitActionResult>,
): Promise<GitActionResult> => {
  if (operation) {
    if (useGitUi.getState().running) return { status: "cancelled" };
    useGitUi.setState({ running: operation });
  }
  try {
    return await action();
  } finally {
    if (operation) useGitUi.setState({ running: null });
    await refresh();
  }
};

export const stageChanges = (changes: GitChange[]) =>
  run(null, () => window.electron.git.stage(changes.map((c) => c.path)));

export const unstageChanges = (changes: GitChange[]) =>
  run(null, () =>
    window.electron.git.unstage(
      // A staged rename is two paths in the index: both must be unstaged.
      changes.flatMap((c) =>
        c.originalPath ? [c.path, c.originalPath] : [c.path],
      ),
    ),
  );

export const discardChanges = (changes: GitChange[]) =>
  run(null, () =>
    window.electron.git.discard(
      changes.map(({ path, status }) => ({ path, status })),
    ),
  );

export const commitChanges = async () => {
  const message = useGitUi.getState().commitMessage.trim();
  if (!message) return;
  const result = await run("commit", () => window.electron.git.commit(message));
  if (result.status === "ok") useGitUi.setState({ commitMessage: "" });
};

export const pull = () => run("pull", () => window.electron.git.pull());

export const push = () => run("push", () => window.electron.git.push());

/**
 * Brings the branch level with its upstream, as the status bar's sync button
 * does: pulls if behind, then pushes if ahead. Counts are from the last status.
 */
export const syncBranch = async ({
  ahead,
  behind,
}: {
  ahead: number;
  behind: number;
}) => {
  if (behind > 0) {
    const result = await pull();
    if (result.status !== "ok") return result;
  }
  return ahead > 0 ? push() : ({ status: "ok" } as const);
};

export const initRepository = () =>
  run("init", () => window.electron.git.init());

export const checkoutBranch = (branch: string) =>
  run("checkout", () => window.electron.git.checkout(branch));

/** A commit hash as people read it. */
export const shortHash = (hash: string) => hash.slice(0, 7);

/**
 * What a diff tab's right side shows: a commit, the index for staged changes,
 * else the disk.
 */
export const diffSideLabel = (diff: NonNullable<OpenedFile["diff"]>) =>
  diff.commit
    ? (diff.commit.label ?? shortHash(diff.commit.hash))
    : diff.staged
      ? "Index"
      : "Working Tree";

/**
 * Opens a change's diff: HEAD against the index if `staged`, else the index
 * against the disk. Single click previews, `permanent` keeps the tab.
 */
export const openChangeDiff = (
  change: GitChange,
  staged: boolean,
  permanent: boolean,
) => {
  useOpenedFiles.getState().addFile({
    name: baseName(change.path),
    path: change.path,
    isPermanent: permanent,
    // Only staged renames have a different path in HEAD.
    diff: { staged, originalPath: staged ? change.originalPath : undefined },
  });
};

/** Opens the changed file itself. Single click previews, `permanent` keeps the tab. */
export const openChange = (change: GitChange, permanent: boolean) => {
  if (change.status === "deleted") return;
  useOpenedFiles.getState().addFile({
    name: baseName(change.path),
    path: change.path,
    isPermanent: permanent,
  });
};

/**
 * Opens a file as `commit` changed it: its first parent against the commit.
 * Single click previews, `permanent` keeps the tab.
 */
export const openCommitFileDiff = (
  commit: Pick<GitCommit, "hash" | "parents">,
  file: GitCommitFile,
  permanent: boolean,
) => {
  useOpenedFiles.getState().addFile({
    name: baseName(file.path),
    path: file.path,
    isPermanent: permanent,
    diff: {
      staged: false,
      originalPath: file.originalPath,
      commit: { hash: commit.hash, parent: commit.parents[0] ?? null },
    },
  });
};

/** Opens the Stash dialog, which asks for an optional message. */
export const openStashDialog = (includeUntracked = false) =>
  useGitUi.setState({ stashDialog: { includeUntracked } });

export const stashChanges = (message: string, includeUntracked: boolean) =>
  run("stash", () =>
    window.electron.git.stash({ message, includeUntracked }),
  );

/** Applies a stash; `pop` also drops it if it applied without conflicts. */
export const applyStash = (stash: Pick<GitStash, "index">, pop: boolean) =>
  run("stash", () => window.electron.git.stashApply(stash.index, pop));

export const dropStash = (stash: Pick<GitStash, "index">) =>
  run(null, () => window.electron.git.stashDrop(stash.index));

/** Opens a file's change in a stash. Single click previews, `permanent` keeps the tab. */
export const openStashFileDiff = (
  stash: GitStash,
  file: GitStashFile,
  permanent: boolean,
) => {
  useOpenedFiles.getState().addFile({
    name: baseName(file.path),
    path: file.path,
    isPermanent: permanent,
    diff: {
      staged: false,
      originalPath: file.originalPath,
      commit: { ...file.source, label: `stash@{${stash.index}}` },
    },
  });
};

/** Stages a file whose conflicts were resolved, which tells Git they're done. */
export const markResolved = (path: string) =>
  run(null, () => window.electron.git.stage([path]));
