import { shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import { watch, type FSWatcher } from "node:fs";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit, type FileStatusResult, type SimpleGit } from "simple-git";

import type {
  GitActionResult,
  GitBlame,
  GitBlameCommit,
  GitBlameRequest,
  GitBranches,
  GitChange,
  GitChangeStatus,
  GitCommit,
  GitCommitFile,
  GitCommitMessageContext,
  GitDiffContents,
  GitDiffRequest,
  GitDiscardRequest,
  GitLogPage,
  GitLogRequest,
  GitRef,
  GitStash,
  GitStashFile,
  GitStashRequest,
  GitStatus,
} from "../shared/git";
import { AI_COMMIT_MESSAGE_LIMITS } from "@oscar/validators";

import { IPC_CHANNEL } from "../shared/ipc-channel";
import {
  BINARY_SNIFF_BYTES,
  FileExplorer,
  MAX_TEXT_FILE_BYTES,
} from "./file-explorer";
import { showMessageBox } from "./file-operations";

/** Coalesces the burst of writes one Git command makes inside `.git`. */
const GIT_CHANGE_DELAY_MS = 150;

type RepoWatch = { gitDir: string; watcher: FSWatcher };

/** One watched `.git` folder per window, keyed by `webContents.id`. */
const repoWatches = new Map<number, RepoWatch>();

const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).trim();

const isGitMissing = (error: unknown) =>
  /ENOENT|not found|spawn git/i.test(errorMessage(error));

/*
 * Set on the main process so git children inherit them. (Passing an env to
 * simple-git instead makes it refuse to run whenever the user's environment
 * has e.g. GIT_EDITOR or GIT_SSH_COMMAND set.)
 * - Never prompt on a terminal (there is none in the app): credentials must
 *   come from a credential helper or SSH agent, or the command fails.
 * - Reading status must not write `.git/index`. Besides fighting a commit for
 *   index.lock, that write would trip the `.git` watcher and refresh status
 *   again, forever.
 */
const INHERITED_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
};
Object.assign(process.env, INHERITED_ENV);

/** A Git client for the window's opened folder. */
const gitFor = (event: IpcMainInvokeEvent) => {
  const root = FileExplorer.workspaceRoot(event.sender.id);
  if (!root) throw new Error("No folder is open");
  const git = simpleGit({
    baseDir: root,
    maxConcurrentProcesses: 4,
    // simple-git strips every inherited GIT_* variable unless it's listed here.
    allowEnvironment: Object.keys(INHERITED_ENV),
  });
  return { git, root };
};

/**
 * Tells the window when anything in `.git` changes (commits, checkouts, staging
 * from a terminal…). The workspace watcher deliberately ignores `.git`, so this
 * watches only its top level, which every such command writes to.
 */
const watchRepo = (webContents: WebContents, gitDir: string) => {
  const existing = repoWatches.get(webContents.id);
  if (existing?.gitDir === gitDir) return;
  existing?.watcher.close();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const notify = () => {
    timer = null;
    if (!webContents.isDestroyed()) webContents.send(IPC_CHANNEL.git.changed);
  };

  try {
    const watcher = watch(gitDir, () => {
      timer ??= setTimeout(notify, GIT_CHANGE_DELAY_MS);
    });
    watcher.on("error", () => watcher.close());
    repoWatches.set(webContents.id, { gitDir, watcher });
  } catch {
    return; // Not fatal: status still refreshes on focus and file changes.
  }

  if (!existing) {
    webContents.once("destroyed", () => {
      repoWatches.get(webContents.id)?.watcher.close();
      repoWatches.delete(webContents.id);
    });
  }
};

const unwatchRepo = (webContentsId: number) => {
  repoWatches.get(webContentsId)?.watcher.close();
  repoWatches.delete(webContentsId);
};

const STATUS_BY_CODE: Record<string, GitChangeStatus> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
};

const isConflict = ({ index, working_dir }: FileStatusResult) =>
  index === "U" ||
  working_dir === "U" ||
  (index === "A" && working_dir === "A") ||
  (index === "D" && working_dir === "D");

const hasCommits = async (git: SimpleGit) => {
  try {
    // With -q, an unborn HEAD fails silently, which simple-git doesn't treat
    // as an error: it just prints nothing.
    return !!(await git.revparse(["--verify", "-q", "HEAD"])).trim();
  } catch {
    return false;
  }
};

/**
 * Runs a Git action. On failure, shows Git's own message (it usually says
 * exactly what to do, e.g. "Please tell me who you are").
 */
const runAction = async (
  event: IpcMainInvokeEvent,
  failureMessage: string,
  action: (git: SimpleGit, root: string) => Promise<GitActionResult | void>,
): Promise<GitActionResult> => {
  try {
    const { git, root } = gitFor(event);
    return (await action(git, root)) ?? { status: "ok" };
  } catch (error) {
    const message = errorMessage(error);
    await showMessageBox(event, {
      type: "error",
      title: "Git",
      message: failureMessage,
      detail: message,
      buttons: ["OK"],
    });
    return { status: "failed", message };
  }
};

/** Checks renderer-supplied paths are inside the opened folder. */
const resolvePaths = (event: IpcMainInvokeEvent, paths: string[]) =>
  paths.map((p) => FileExplorer.resolveInWorkspace(event, p));

/** `target` as Git names it in `<rev>:<path>`: relative to the repository root, with `/`. */
const toRepoPath = (repoRoot: string, target: string) => {
  const relative = path.relative(repoRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`"${target}" is not inside the repository`);
  }
  return relative.split(path.sep).join("/");
};

/** One side of a diff: its size up front, so huge files are never read. */
type DiffSide = { size: number; read: () => Promise<Buffer> };

/** A file as stored in Git (`HEAD:a.ts`, or `:a.ts` for the index); null if it isn't there. */
const blobSide = async (
  git: SimpleGit,
  spec: string,
): Promise<DiffSide | null> => {
  try {
    const size = Number((await git.raw(["cat-file", "-s", spec])).trim());
    return { size, read: () => git.binaryCatFile(["blob", spec]) };
  } catch {
    return null; // e.g. a new file has no HEAD version
  }
};

/** The file on disk; null if it was deleted. */
const fileSide = async (target: string): Promise<DiffSide | null> => {
  try {
    const stats = await fs.stat(target);
    if (!stats.isFile()) return null;
    return { size: stats.size, read: () => fs.readFile(target) };
  } catch {
    return null;
  }
};

/** Text without a UTF-8 BOM, so a BOM alone never shows as a change. */
const decodeText = (buffer: Buffer) =>
  buffer.toString("utf8").replace(/^\uFEFF/, "");

/** Renderer-supplied commit hashes must be hashes, never options or revision expressions. */
const assertHash = (hash: string) => {
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
    throw new Error(`"${hash}" is not a commit hash`);
  }
};

/** Field and record separators for `git log --format`, which never occur in commit data. */
const FIELD = "\x1f";
const RECORD = "\x1e";
const LOG_FORMAT = ["%H", "%P", "%an", "%ae", "%at", "%D", "%s", "%b"].join(
  "%x1f",
);

/** Parses `%D` with `--decorate=full`, e.g. `HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1`. */
const parseRefs = (decoration: string): GitRef[] => {
  const refs: GitRef[] = [];
  for (const part of decoration.split(", ")) {
    if (!part) continue;
    if (part === "HEAD") {
      refs.push({ name: "HEAD", kind: "head", isHead: true });
      continue;
    }
    const isHead = part.startsWith("HEAD -> ");
    const ref = isHead ? part.slice("HEAD -> ".length) : part;
    const tag = ref.replace(/^tag: /, "");
    if (tag.startsWith("refs/tags/")) {
      refs.push({ name: tag.slice(10), kind: "tag", isHead: false });
    } else if (ref.startsWith("refs/heads/")) {
      refs.push({ name: ref.slice(11), kind: "branch", isHead });
    } else if (ref.startsWith("refs/remotes/") && !ref.endsWith("/HEAD")) {
      // `origin/HEAD` only repeats the remote's default branch.
      refs.push({ name: ref.slice(13), kind: "remote", isHead: false });
    }
  }
  // The checked-out branch first, then local branches, remotes, tags.
  const order: Record<GitRef["kind"], number> = {
    head: 0,
    branch: 1,
    remote: 2,
    tag: 3,
  };
  return refs.sort(
    (a, b) => Number(b.isHead) - Number(a.isHead) || order[a.kind] - order[b.kind],
  );
};

const COMMIT_FILE_STATUS: Record<string, GitCommitFile["status"]> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
};

/** The files changed between two trees (`diff-tree` arguments), sorted by path. */
const diffTreeFiles = async (
  git: SimpleGit,
  repoRoot: string,
  revisions: string[],
): Promise<GitCommitFile[]> => {
  const output = await git.raw([
    "diff-tree",
    "-r",
    "-M",
    "-z",
    "--no-commit-id",
    "--name-status",
    ...revisions,
  ]);

  // -z: `status NUL path NUL`, or `status NUL from NUL to NUL` for renames and copies.
  const fields = output.split("\0").filter(Boolean);
  const files: GitCommitFile[] = [];
  for (let i = 0; i < fields.length; ) {
    const code = fields[i++];
    const status = COMMIT_FILE_STATUS[code[0]] ?? "modified";
    const hasSource = code[0] === "R" || code[0] === "C";
    const from = hasSource ? fields[i++] : undefined;
    const relativePath = fields[i++];
    if (!relativePath) break;
    files.push({
      path: path.join(repoRoot, relativePath),
      relativePath,
      originalPath: from ? path.join(repoRoot, from) : undefined,
      status,
    });
  }
  return files.sort(byRelativePath);
};

const byRelativePath = (
  a: { relativePath: string },
  b: { relativePath: string },
) =>
  a.relativePath.localeCompare(b.relativePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });

const repoRootOf = async (git: SimpleGit) =>
  path.resolve((await git.revparse(["--show-toplevel"])).trim());

/** `stash@{N}` for a renderer-supplied index. */
const stashRef = (index: number) => {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`"${index}" is not a stash index`);
  }
  return `stash@{${index}}`;
};

const UNCOMMITTED_HASH = /^0+$/;

/** Parses `git blame --porcelain`: one header per line, commit details the first time each commit appears. */
const parseBlame = (output: string): GitBlame => {
  const lines: string[] = [];
  const commits: Record<string, GitBlameCommit> = {};
  let current: GitBlameCommit | null = null;
  let finalLine = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("\t")) {
      if (current) lines[finalLine - 1] = current.hash;
      current = null;
      continue;
    }
    if (!current) {
      const header = /^([0-9a-f]{40,64}) \d+ (\d+)/.exec(line);
      if (!header) continue;
      const hash = header[1];
      finalLine = Number(header[2]);
      const uncommitted = UNCOMMITTED_HASH.test(hash);
      current = commits[hash] ??= {
        hash,
        authorName: uncommitted ? "You" : "",
        authorEmail: "",
        date: Date.now(),
        summary: uncommitted ? "Uncommitted changes" : "",
        uncommitted,
      };
      continue;
    }
    if (current.uncommitted) continue;
    const space = line.indexOf(" ");
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? "" : line.slice(space + 1);
    if (key === "author") current.authorName = value;
    else if (key === "author-mail") current.authorEmail = value.replace(/^<|>$/g, "");
    else if (key === "author-time") current.date = Number(value) * 1000;
    else if (key === "summary") current.summary = value;
  }
  return { kind: "blame", lines, commits };
};

/** Generated files whose diffs say little and would crowd out the rest. Still in the diffstat. */
const NOISY_DIFFS = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
].map((name) => `:(top,exclude,glob)**/${name}`);

/** How much of each new untracked file a commit message suggestion sees. */
const UNTRACKED_PREVIEW = { files: 10, characters: 2000 } as const;

/** The start of a small text file, or null for a binary, big or unreadable one. */
const previewText = async (file: string) => {
  try {
    const stats = await fs.stat(file);
    if (!stats.isFile() || stats.size > MAX_TEXT_FILE_BYTES) return null;
    const handle = await fs.open(file, "r");
    try {
      const buffer = Buffer.alloc(
        Math.min(stats.size, Math.max(BINARY_SNIFF_BYTES, UNTRACKED_PREVIEW.characters * 4)),
      );
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const bytes = buffer.subarray(0, bytesRead);
      if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null;
      const text = bytes.toString("utf8");
      return text.length > UNTRACKED_PREVIEW.characters || bytesRead < stats.size
        ? `${text.slice(0, UNTRACKED_PREVIEW.characters)}\n[…]`
        : text;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
};

export class Git {
  /** Status of the repository the opened folder is in, limited to that folder. */
  static async status(event: IpcMainInvokeEvent): Promise<GitStatus> {
    const { git } = gitFor(event);

    let repoRoot: string;
    let gitDir: string;
    try {
      if (!(await git.checkIsRepo())) {
        unwatchRepo(event.sender.id);
        return { kind: "no-repo" };
      }
      [repoRoot, gitDir] = (
        await git.revparse(["--show-toplevel", "--absolute-git-dir"])
      )
        .split("\n")
        .map((line) => path.resolve(line.trim()));
    } catch (error) {
      if (isGitMissing(error)) {
        return { kind: "git-missing", message: errorMessage(error) };
      }
      throw error;
    }
    watchRepo(event.sender, gitDir);

    const [status, committed, remotes] = await Promise.all([
      // `.` limits it to the opened folder; untracked folders are listed file by file.
      git.status(["--untracked-files=all", "--", "."]),
      hasCommits(git),
      git.getRemotes(),
    ]);

    // Porcelain status paths are relative to the repository root.
    const toChange = (
      file: FileStatusResult,
      status: GitChangeStatus,
    ): GitChange => ({
      path: path.join(repoRoot, file.path),
      relativePath: file.path,
      originalPath: file.from ? path.join(repoRoot, file.from) : undefined,
      status,
    });

    const staged: GitChange[] = [];
    const unstaged: GitChange[] = [];
    const conflicted: GitChange[] = [];

    for (const file of status.files) {
      if (isConflict(file)) {
        conflicted.push(toChange(file, "conflicted"));
        continue;
      }
      if (file.index === "?") {
        unstaged.push(toChange(file, "untracked"));
        continue;
      }
      const inIndex = STATUS_BY_CODE[file.index];
      if (inIndex) staged.push(toChange(file, inIndex));
      const inWorkTree = STATUS_BY_CODE[file.working_dir];
      // A rename is recorded in the index; the work tree only sees the new path.
      if (inWorkTree)
        unstaged.push({
          ...toChange(file, inWorkTree),
          originalPath: undefined,
        });
    }

    const byPath = (a: GitChange, b: GitChange) =>
      a.relativePath.localeCompare(b.relativePath, undefined, {
        numeric: true,
        sensitivity: "base",
      });

    let detachedAt: string | null = null;
    if (status.detached && committed) {
      detachedAt = (await git.revparse(["--short", "HEAD"])).trim();
    }

    return {
      kind: "repo",
      root: repoRoot,
      branch: status.detached ? null : status.current,
      detachedAt,
      upstream: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      hasCommits: committed,
      hasRemotes: remotes.length > 0,
      staged: staged.sort(byPath),
      unstaged: unstaged.sort(byPath),
      conflicted: conflicted.sort(byPath),
    };
  }

  /**
   * Both versions of a changed file: HEAD and the index for a staged change,
   * the index and the disk for an unstaged one. A missing side (a new or
   * deleted file) is empty.
   */
  static async diff(
    event: IpcMainInvokeEvent,
    request: GitDiffRequest,
  ): Promise<GitDiffContents> {
    const { git } = gitFor(event);
    const { commit } = request;
    // A commit's files can be anywhere in the repository; only Git's own
    // copies are read for them, never the disk.
    const target = commit
      ? path.resolve(request.path)
      : FileExplorer.resolveInWorkspace(event, request.path);
    const repoRoot = path.resolve(
      (await git.revparse(["--show-toplevel"])).trim(),
    );
    const repoPath = toRepoPath(repoRoot, target);
    const originalRepoPath = request.originalPath
      ? toRepoPath(repoRoot, path.resolve(request.originalPath))
      : repoPath;

    if (commit) {
      assertHash(commit.hash);
      if (commit.parent) assertHash(commit.parent);
    }

    const sides = await Promise.all(
      commit
        ? [
            commit.parent
              ? blobSide(git, `${commit.parent}:${originalRepoPath}`)
              : null,
            blobSide(git, `${commit.hash}:${repoPath}`),
          ]
        : request.staged
        ? [
            blobSide(git, `HEAD:${originalRepoPath}`),
            blobSide(git, `:${repoPath}`),
          ]
        : [blobSide(git, `:${repoPath}`), fileSide(target)],
    );

    const size = Math.max(...sides.map((side) => side?.size ?? 0));
    if (size > MAX_TEXT_FILE_BYTES) {
      return { kind: "too-large", size, limit: MAX_TEXT_FILE_BYTES };
    }

    const [original, modified] = await Promise.all(
      sides.map((side) => side?.read() ?? Buffer.alloc(0)),
    );
    if (
      [original, modified].some((buffer) =>
        buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0),
      )
    ) {
      return { kind: "binary" };
    }
    return {
      kind: "text",
      original: decodeText(original),
      modified: decodeText(modified),
    };
  }

  static async branches(event: IpcMainInvokeEvent): Promise<GitBranches> {
    const { git } = gitFor(event);
    const summary = await git.branchLocal();
    return {
      current: summary.detached ? null : summary.current || null,
      local: summary.all,
    };
  }

  static init(event: IpcMainInvokeEvent) {
    return runAction(
      event,
      "Couldn't initialize a repository.",
      async (git) => {
        await git.init();
      },
    );
  }

  static stage(event: IpcMainInvokeEvent, paths: string[]) {
    return runAction(event, "Couldn't stage the changes.", async (git) => {
      // -A also stages deletions of the given paths.
      await git.raw(["add", "-A", "--", ...resolvePaths(event, paths)]);
    });
  }

  /** `paths` should include a rename's original path, so both sides are unstaged. */
  static unstage(event: IpcMainInvokeEvent, paths: string[]) {
    return runAction(event, "Couldn't unstage the changes.", async (git) => {
      const targets = resolvePaths(event, paths);
      if (await hasCommits(git)) {
        await git.raw(["reset", "-q", "HEAD", "--", ...targets]);
      } else {
        // Nothing to reset to yet: just take them out of the index.
        await git.raw(["rm", "--cached", "-r", "-q", "--", ...targets]);
      }
    });
  }

  /**
   * Confirms, then throws away work-tree changes. Untracked files go to the
   * trash; tracked files are restored from the index, which can't be undone.
   */
  static async discard(
    event: IpcMainInvokeEvent,
    changes: GitDiscardRequest,
  ): Promise<GitActionResult> {
    if (changes.length === 0) return { status: "ok" };

    const untracked = changes.filter((c) => c.status === "untracked");
    const tracked = changes.filter((c) => c.status !== "untracked");
    const single = changes.length === 1;
    const name = path.basename(changes[0].path);

    const message = single
      ? untracked.length
        ? `Are you sure you want to delete "${name}"?`
        : `Are you sure you want to discard changes in "${name}"?`
      : `Are you sure you want to discard changes in ${changes.length} files?`;
    const detail = [
      tracked.length > 0 && "Discarded changes can't be recovered.",
      untracked.length > 0 &&
        (single
          ? "It isn't tracked by Git, so it will be moved to the Trash."
          : `${untracked.length} untracked ${untracked.length === 1 ? "file" : "files"} will be moved to the Trash.`),
    ]
      .filter(Boolean)
      .join(" ");

    const { response } = await showMessageBox(event, {
      type: "warning",
      title: "Discard Changes",
      message,
      detail,
      buttons: [
        untracked.length && single ? "Move to Trash" : "Discard",
        "Cancel",
      ],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return { status: "cancelled" };

    return runAction(event, "Couldn't discard the changes.", async (git) => {
      if (tracked.length > 0) {
        await git.raw([
          "checkout",
          "--",
          ...resolvePaths(
            event,
            tracked.map((c) => c.path),
          ),
        ]);
      }
      for (const target of resolvePaths(
        event,
        untracked.map((c) => c.path),
      )) {
        await shell.trashItem(target);
      }
    });
  }

  /**
   * Commits the staged changes. With nothing staged, offers to stage
   * everything in the opened folder first.
   */
  static async commit(
    event: IpcMainInvokeEvent,
    message: string,
  ): Promise<GitActionResult> {
    if (!message.trim()) {
      return { status: "failed", message: "The commit message is empty" };
    }

    let stageAll = false;
    try {
      const { git } = gitFor(event);
      const staged = await git.raw(["diff", "--cached", "--name-only"]);
      if (!staged.trim()) {
        const { response } = await showMessageBox(event, {
          type: "question",
          title: "Commit",
          message: "There are no staged changes to commit.",
          detail:
            "Would you like to stage all your changes and commit them directly?",
          buttons: ["Stage All and Commit", "Cancel"],
          defaultId: 0,
          cancelId: 1,
        });
        if (response !== 0) return { status: "cancelled" };
        stageAll = true;
      }
    } catch {
      // Fall through: the commit below reports the real problem.
    }

    return runAction(event, "Couldn't commit.", async (git) => {
      if (stageAll) await git.raw(["add", "-A", "--", "."]);
      await git.commit(message);
    });
  }

  static pull(event: IpcMainInvokeEvent) {
    return runAction(event, "Couldn't pull.", async (git) => {
      const status = await git.status();
      if (!status.tracking) {
        throw new Error(
          `The branch "${status.current}" has no upstream branch to pull from.`,
        );
      }
      await git.pull();
    });
  }

  /** Pushes, publishing the branch to `origin` (or the only remote) if it has no upstream. */
  static push(event: IpcMainInvokeEvent) {
    return runAction(event, "Couldn't push.", async (git) => {
      const status = await git.status();
      if (status.tracking) {
        await git.push();
        return;
      }
      if (status.detached || !status.current) {
        throw new Error("Check out a branch before pushing.");
      }
      const remotes = await git.getRemotes();
      if (remotes.length === 0) {
        throw new Error("This repository has no remotes to push to.");
      }
      const remote =
        remotes.find((r) => r.name === "origin")?.name ?? remotes[0].name;
      await git.push(["-u", remote, status.current]);
    });
  }

  static checkout(event: IpcMainInvokeEvent, branch: string) {
    return runAction(event, `Couldn't switch to "${branch}".`, async (git) => {
      const { all } = await git.branchLocal();
      if (!all.includes(branch)) {
        throw new Error(`There is no local branch named "${branch}".`);
      }
      await git.checkout(branch);
    });
  }

  /**
   * A page of history, newest first. Topological order keeps a branch's
   * commits together and every child above its parents, which the graph needs.
   */
  static async log(
    event: IpcMainInvokeEvent,
    request: GitLogRequest,
  ): Promise<GitLogPage> {
    const { git } = gitFor(event);
    if (!(await hasCommits(git))) return { commits: [], hasMore: false };

    const skip = Math.max(0, Math.floor(request.skip));
    const limit = Math.min(1000, Math.max(1, Math.floor(request.limit)));

    let revisions: string[];
    if (request.allBranches) {
      // Not `--all`, which would also list stashes and other internal refs.
      revisions = ["--branches", "--remotes", "--tags", "HEAD"];
    } else {
      revisions = ["HEAD"];
      try {
        const upstream = (
          await git.raw(["rev-parse", "--verify", "-q", "@{upstream}"])
        ).trim();
        if (upstream) revisions.push(upstream);
      } catch {
        // No upstream: just HEAD.
      }
    }

    const output = await git.raw([
      "log",
      "--topo-order",
      "--decorate=full",
      `--format=${LOG_FORMAT}%x1e`,
      `--skip=${skip}`,
      // One extra to learn whether there's another page.
      `--max-count=${limit + 1}`,
      ...revisions,
      "--",
    ]);

    const commits: GitCommit[] = output
      .split(RECORD)
      .map((record) => record.replace(/^\n/, ""))
      .filter(Boolean)
      .map((record) => {
        const [hash, parents, authorName, authorEmail, date, refs, subject, body] =
          record.split(FIELD);
        return {
          hash,
          parents: parents ? parents.split(" ") : [],
          authorName,
          authorEmail,
          date: Number(date) * 1000,
          refs: parseRefs(refs ?? ""),
          subject: subject ?? "",
          body: (body ?? "").trim(),
        };
      });

    return {
      commits: commits.slice(0, limit),
      hasMore: commits.length > limit,
    };
  }

  /** The files `hash` changed, compared with its first parent (everything, for a root commit). */
  static async commitFiles(
    event: IpcMainInvokeEvent,
    hash: string,
  ): Promise<GitCommitFile[]> {
    assertHash(hash);
    const { git } = gitFor(event);
    const repoRoot = path.resolve(
      (await git.revparse(["--show-toplevel"])).trim(),
    );
    const parent = (
      await git.raw(["rev-list", "--parents", "-n", "1", hash])
    )
      .trim()
      .split(" ")[1];

    return diffTreeFiles(
      git,
      repoRoot,
      parent ? [parent, hash] : ["--root", hash],
    );
  }

  static async stashes(event: IpcMainInvokeEvent): Promise<GitStash[]> {
    const { git } = gitFor(event);
    const output = await git.raw([
      "stash",
      "list",
      "--format=%H%x1f%P%x1f%gs%x1f%at%x1e",
    ]);
    return output
      .split(RECORD)
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record, index) => {
        const [hash, parents, subject, date] = record.split(FIELD);
        // "On main: message", or "WIP on main: abc1234 Last commit" without one.
        const match = /^(WIP )?[Oo]n (.+?): (.*)$/s.exec(subject ?? "");
        return {
          index,
          hash,
          baseHash: (parents ?? "").split(" ")[0] ?? "",
          branch: match && match[2] !== "(no branch)" ? match[2] : null,
          message: match
            ? match[1]
              ? `WIP: ${match[3]}`
              : match[3]
            : (subject ?? ""),
          date: Number(date) * 1000,
        };
      });
  }

  /** A stash's changes against its base commit, plus the untracked files it saved. */
  static async stashFiles(
    event: IpcMainInvokeEvent,
    hash: string,
  ): Promise<GitStashFile[]> {
    assertHash(hash);
    const { git } = gitFor(event);
    const repoRoot = await repoRootOf(git);
    // A stash is a merge: [stash, base, index, untracked?].
    const [, base, , untracked] = (
      await git.raw(["rev-list", "--parents", "-n", "1", hash])
    )
      .trim()
      .split(" ");

    const tracked: GitStashFile[] = (
      await diffTreeFiles(git, repoRoot, [base, hash])
    ).map((file) => ({
      ...file,
      source: { hash, parent: base },
      untracked: false,
    }));
    if (!untracked) return tracked;

    const added = (
      await git.raw(["ls-tree", "-r", "-z", "--name-only", untracked])
    )
      .split("\0")
      .filter(Boolean)
      .map(
        (relativePath): GitStashFile => ({
          path: path.join(repoRoot, relativePath),
          relativePath,
          status: "added",
          source: { hash: untracked, parent: null },
          untracked: true,
        }),
      );
    return [...tracked, ...added].sort(byRelativePath);
  }

  static async stash(event: IpcMainInvokeEvent, request: GitStashRequest) {
    let nothingToStash = false;
    const result = await runAction(
      event,
      "Couldn't stash the changes.",
      async (git) => {
        const message = request.message.trim();
        const output = await git.raw([
          "stash",
          "push",
          ...(request.includeUntracked ? ["--include-untracked"] : []),
          ...(message ? ["--message", message] : []),
        ]);
        if (/No local changes to save/i.test(output)) nothingToStash = true;
      },
    );
    if (!nothingToStash) return result;
    await showMessageBox(event, {
      type: "info",
      title: "Stash",
      message: "There are no changes to stash.",
      detail: request.includeUntracked
        ? undefined
        : "Untracked files are only stashed with Stash (Include Untracked).",
      buttons: ["OK"],
    });
    return { status: "cancelled" } satisfies GitActionResult;
  }

  static stashApply(event: IpcMainInvokeEvent, index: number, pop: boolean) {
    return runAction(
      event,
      pop ? "Couldn't pop the stash." : "Couldn't apply the stash.",
      async (git) => {
        await git.raw(["stash", pop ? "pop" : "apply", stashRef(index)]);
      },
    );
  }

  static async stashDrop(
    event: IpcMainInvokeEvent,
    index: number,
  ): Promise<GitActionResult> {
    const ref = stashRef(index);
    const { response } = await showMessageBox(event, {
      type: "warning",
      title: "Drop Stash",
      message: `Are you sure you want to drop ${ref}?`,
      detail: "A dropped stash can't be recovered from here.",
      buttons: ["Drop", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return { status: "cancelled" };
    return runAction(event, "Couldn't drop the stash.", async (git) => {
      await git.raw(["stash", "drop", ref]);
    });
  }

  /**
   * Blames the file as the editor has it: the given contents go through a
   * temporary file so unsaved edits line up (and show as uncommitted).
   */
  /**
   * The changes the next commit would include, described for a suggested
   * commit message: the staged changes, or with nothing staged, every change
   * in the opened folder (which committing then offers to stage).
   */
  static async commitMessageContext(
    event: IpcMainInvokeEvent,
  ): Promise<GitCommitMessageContext> {
    const { git, root } = gitFor(event);
    const committed = await hasCommits(git);

    const staged = (await git.raw(["diff", "--cached", "--name-only"])).trim();
    const stagedOnly = staged !== "";

    // What to compare: the index with HEAD, or the working tree with HEAD
    // (or with the empty index, before the first commit).
    const range = stagedOnly ? ["--cached"] : committed ? ["HEAD"] : [];
    const paths = stagedOnly ? [] : ["."];
    const [stat, patch, untrackedOutput, log, branch] = await Promise.all([
      git.raw(["diff", ...range, "--stat=120", "--", ...paths]),
      git.raw([
        "diff",
        ...range,
        "--no-color",
        "--no-ext-diff",
        "--",
        ...(paths.length > 0 ? paths : [":/"]),
        ...NOISY_DIFFS,
      ]),
      stagedOnly
        ? Promise.resolve("")
        : git.raw(["ls-files", "--others", "--exclude-standard", "--", "."]),
      committed
        ? git.raw([
            "log",
            `--max-count=${AI_COMMIT_MESSAGE_LIMITS.recentCommits}`,
            "--format=%s",
          ])
        : Promise.resolve(""),
      git
        .raw(["symbolic-ref", "--short", "-q", "HEAD"])
        .then((name) => name.trim() || null)
        .catch(() => null),
    ]);

    const untracked = untrackedOutput.split("\n").filter(Boolean);
    let untrackedSection = "";
    if (untracked.length > 0) {
      const previews = await Promise.all(
        untracked
          .slice(0, UNTRACKED_PREVIEW.files)
          .map(async (file) => {
            const text = await previewText(path.join(root, file));
            return text === null ? `+++ ${file}` : `+++ ${file}\n${text}`;
          }),
      );
      const more = untracked.length - previews.length;
      untrackedSection = [
        "New untracked files:",
        ...previews,
        ...(more > 0 ? [`…and ${more} more new files`] : []),
      ].join("\n");
    }

    // The diffstat and new files are short and always fit; the patch gets the rest.
    const limit = AI_COMMIT_MESSAGE_LIMITS.changesCharacters;
    const fixed = stat.trim().length + untrackedSection.length + 100;
    const room = Math.max(0, limit - fixed);
    const patchText =
      patch.length > room
        ? `${patch.slice(0, room)}\n[The diff is cut short here]`
        : patch.trim();
    const changes = [stat.trim(), patchText, untrackedSection]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, limit);

    return {
      changes,
      stagedOnly,
      recentCommits: log
        .split("\n")
        .map((subject) => subject.trim())
        .filter(Boolean)
        .map((subject) =>
          subject.slice(0, AI_COMMIT_MESSAGE_LIMITS.recentCommitCharacters),
        ),
      branch,
    };
  }

  static async blame(
    event: IpcMainInvokeEvent,
    request: GitBlameRequest,
  ): Promise<GitBlame> {
    let target: string;
    try {
      target = FileExplorer.resolveInWorkspace(event, request.path);
    } catch {
      return { kind: "none" }; // A file opened from outside the folder.
    }
    const { git } = gitFor(event);

    let contentsFile: string | null = null;
    try {
      if (!(await hasCommits(git))) return { kind: "none" };
      if (request.contents !== undefined) {
        contentsFile = path.join(os.tmpdir(), `oscar-blame-${randomUUID()}`);
        await fs.writeFile(contentsFile, request.contents);
      }
      const output = await git.raw([
        "blame",
        "--porcelain",
        ...(contentsFile ? ["--contents", contentsFile] : []),
        "--",
        target,
      ]);
      return parseBlame(output);
    } catch {
      // Untracked, ignored, or outside the repository.
      return { kind: "none" };
    } finally {
      if (contentsFile) await fs.rm(contentsFile, { force: true });
    }
  }
}
