export type GitChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "untracked"
  | "conflicted";

export type GitChange = {
  /** Absolute path, in the OS's native format. */
  path: string;
  /** Path from the repository root, always with `/`. */
  relativePath: string;
  /** For renames and copies: the absolute path it came from. */
  originalPath?: string;
  status: GitChangeStatus;
};

export type GitStatus =
  /** The opened folder is not inside a Git repository. */
  | { kind: "no-repo" }
  /** The `git` executable couldn't be run. */
  | { kind: "git-missing"; message: string }
  | {
      kind: "repo";
      /** Absolute path of the repository's top-level folder. */
      root: string;
      /** Current branch, or null when HEAD is detached. */
      branch: string | null;
      /** Short commit hash when HEAD is detached. */
      detachedAt: string | null;
      /** e.g. `origin/main`, or null if the branch doesn't track one. */
      upstream: string | null;
      ahead: number;
      behind: number;
      /** False in a freshly initialized repository. */
      hasCommits: boolean;
      hasRemotes: boolean;
      /** Changes in the index, ready to commit. */
      staged: GitChange[];
      /** Changes in the working tree only, including untracked files. */
      unstaged: GitChange[];
      /** Files with unresolved merge conflicts. */
      conflicted: GitChange[];
    };

export type GitBranches = {
  current: string | null;
  local: string[];
};

export type GitActionResult =
  | { status: "ok" }
  /** The user dismissed a confirmation. */
  | { status: "cancelled" }
  /** Git failed; the main process already showed the error. */
  | { status: "failed"; message: string };

/** What to discard: the path and whether Git tracks it (untracked files are trashed). */
export type GitDiscardRequest = Pick<GitChange, "path" | "status">[];

/** Which two versions of a changed file to compare. */
export type GitDiffRequest = {
  /** Absolute path of the file (its new path, for a rename). */
  path: string;
  /** For a staged rename: the absolute path it had in HEAD. */
  originalPath?: string;
  /**
   * True compares HEAD with the index (what the next commit changes); false
   * compares the index with the file on disk (what isn't staged yet).
   */
  staged: boolean;
  /**
   * Set to compare a file as a commit changed it: the commit's parent with
   * the commit (`staged` is ignored). `path` and `originalPath` may then be
   * anywhere in the repository, not just in the opened folder.
   */
  commit?: GitCommitRef;
};

/** A commit, and the parent its changes are shown against (null for a root commit). */
export type GitCommitRef = {
  hash: string;
  parent: string | null;
  /** Shown instead of the short hash, e.g. `stash@{0}`. */
  label?: string;
};

/** Both sides of a diff. A side that doesn't exist (e.g. a new file's original) is empty. */
export type GitDiffContents =
  | { kind: "text"; original: string; modified: string }
  | { kind: "binary" }
  | { kind: "too-large"; size: number; limit: number };

export type GitRefKind = "branch" | "remote" | "tag" | "head";

/** A branch, remote branch or tag pointing at a commit. */
export type GitRef = {
  /** Short name, e.g. `main`, `origin/main`, `v1.0`; "HEAD" when detached. */
  name: string;
  kind: GitRefKind;
  /** True for the checked-out branch (or a detached HEAD). */
  isHead: boolean;
};

export type GitCommit = {
  hash: string;
  /** First parent first; two or more for a merge, none for a root commit. */
  parents: string[];
  subject: string;
  /** The message after the subject line, trimmed. */
  body: string;
  authorName: string;
  authorEmail: string;
  /** Author date, in milliseconds since the epoch. */
  date: number;
  refs: GitRef[];
};

export type GitLogRequest = {
  /** Commits to skip, for loading the next page. */
  skip: number;
  limit: number;
  /**
   * True shows every branch, remote branch and tag; false shows HEAD and its
   * upstream, as VS Code's graph does by default.
   */
  allBranches: boolean;
};

/** Commits newest first, in topological order (children before parents). */
export type GitLogPage = { commits: GitCommit[]; hasMore: boolean };

/** A file a commit changed, compared with its first parent. */
export type GitCommitFile = {
  /** Absolute path, in the OS's native format. */
  path: string;
  /** Path from the repository root, always with `/`. */
  relativePath: string;
  /** For renames and copies: the absolute path it came from. */
  originalPath?: string;
  status: Exclude<GitChangeStatus, "untracked" | "conflicted">;
};

/** A stash entry, newest first. */
export type GitStash = {
  /** N in `stash@{N}`. */
  index: number;
  hash: string;
  /** The commit the stash was made on. */
  baseHash: string;
  /** The stash's message, without Git's "On main:" prefix. */
  message: string;
  /** The branch it was made on, if Git recorded one. */
  branch: string | null;
  /** In milliseconds since the epoch. */
  date: number;
};

export type GitStashRequest = {
  /** Optional; Git writes "WIP on <branch>: …" without one. */
  message: string;
  includeUntracked: boolean;
};

/** A file in a stash, and which two versions show its change. */
export type GitStashFile = GitCommitFile & {
  /** Tracked files compare the base commit with the stash; untracked ones are all new. */
  source: GitCommitRef;
  untracked: boolean;
};

/** Who last changed a line. */
export type GitBlameCommit = {
  hash: string;
  authorName: string;
  authorEmail: string;
  /** In milliseconds since the epoch. */
  date: number;
  summary: string;
  /** True for lines that aren't committed yet. */
  uncommitted: boolean;
};

export type GitBlameRequest = {
  path: string;
  /** The editor's text, so unsaved edits line up; the file on disk if omitted. */
  contents?: string;
};

export type GitBlame =
  /** `lines[i]` is the hash of the commit that last changed line i + 1. */
  | { kind: "blame"; lines: string[]; commits: Record<string, GitBlameCommit> }
  /** Outside the repository, untracked, or Git couldn't blame it. */
  | { kind: "none" };

/** What a commit message suggestion is based on: the changes a commit would include. */
export type GitCommitMessageContext = {
  /** The diffstat, the patch (cut to fit) and any new untracked files. Empty with no changes. */
  changes: string;
  /** False when nothing is staged: then it's everything a commit would offer to stage. */
  stagedOnly: boolean;
  /** Subjects of the latest commits, newest first, to follow the repository's style. */
  recentCommits: string[];
  /** Null on a detached HEAD. */
  branch: string | null;
};
