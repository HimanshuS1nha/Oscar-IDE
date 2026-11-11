import { watch, type FSWatcher } from "chokidar";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";

import { splitEntryName, validateEntryName } from "../shared/entry-name";
import {
  imageMimeType,
  type DirectoryEntry,
  type FileContents,
  type ImageContents,
  type ReadFileOptions,
  type TextEncoding,
} from "../shared/file-tree";
import { IPC_CHANNEL } from "../shared/ipc-channel";

/** Never shown in the explorer (same defaults as VS Code's `files.exclude`). */
export const HIDDEN_NAMES = new Set([".git", ".svn", ".hg", ".DS_Store", "Thumbs.db"]);

/**
 * Not watched for changes. These trees are huge and would exhaust OS watch
 * limits; they still show in the explorer, they just don't live-update.
 */
const UNWATCHED = /(^|\/)(\.git|\.svn|\.hg|node_modules)(\/|$)/;

/** Files above this are not loaded into the editor unless the user asks to ("Open Anyway"). */
export const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Files above this are never loaded as text. Monaco stops syncing models
 * this large to its worker, and the text is held several times over.
 */
const MAX_LARGE_TEXT_FILE_BYTES = 50 * 1024 * 1024;

/** Images above this are not previewed. */
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

/** How much of a file is checked for NUL bytes to detect binary content (same as git). */
export const BINARY_SNIFF_BYTES = 8000;

const UTF8_BOM = [0xef, 0xbb, 0xbf];

/** Coalesces bursts of events (e.g. `git checkout`, `npm install`). */
const FLUSH_DELAY_MS = 75;

type Workspace = {
  root: string;
  watcher: FSWatcher;
  changedDirs: Set<string>;
  changedFiles: Set<string>;
  flushTimer: ReturnType<typeof setTimeout> | null;
};

/** One opened folder per window, keyed by `webContents.id`. */
const workspaces = new Map<number, Workspace>();

/**
 * Files outside the opened folder that the user picked in a native dialog
 * (e.g. Save As), keyed by `webContents.id`. Cleared with the workspace.
 */
const allowedFiles = new Map<number, Set<string>>();

const isInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative))
  );
};

const resolveType = async (
  dirent: Dirent,
  fullPath: string,
): Promise<DirectoryEntry["type"]> => {
  if (dirent.isDirectory()) return "directory";
  if (!dirent.isSymbolicLink()) return "file";

  // Follow symlinks so linked folders can be expanded. Broken links show as files.
  try {
    return (await fs.stat(fullPath)).isDirectory() ? "directory" : "file";
  } catch {
    return "file";
  }
};

const exists = async (target: string) => {
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
};

/**
 * True if something other than `source` exists at `target`. Changing only the
 * case (`readme.md` → `README.md`) finds `source` itself on case-insensitive
 * file systems, which isn't a clash; on case-sensitive ones both can exist.
 */
const isOtherEntry = async (source: string, target: string) => {
  let targetStats;
  try {
    targetStats = await fs.lstat(target);
  } catch {
    return false;
  }
  const sourceStats = await fs.lstat(source);
  return (
    targetStats.ino !== sourceStats.ino || targetStats.dev !== sourceStats.dev
  );
};

const compareEntries = (a: DirectoryEntry, b: DirectoryEntry) => {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

export class FileExplorer {
  /** Makes `root` this window's opened folder and starts watching it. */
  static async openWorkspace(webContents: WebContents, root: string) {
    await FileExplorer.closeWorkspace(webContents.id);

    const workspace: Workspace = {
      root: path.resolve(root),
      watcher: watch(root, {
        ignoreInitial: true,
        // A symlink to e.g. the home folder would otherwise watch that entire tree.
        followSymlinks: false,
        ignored: (watchedPath) =>
          UNWATCHED.test(watchedPath.replace(/\\/g, "/")) ||
          HIDDEN_NAMES.has(path.basename(watchedPath)),
      }),
      changedDirs: new Set(),
      changedFiles: new Set(),
      flushTimer: null,
    };

    const flush = () => {
      workspace.flushTimer = null;
      if (webContents.isDestroyed()) return;

      if (workspace.changedDirs.size > 0) {
        webContents.send(IPC_CHANNEL.file.treeChanged, [
          ...workspace.changedDirs,
        ]);
      }
      if (workspace.changedFiles.size > 0) {
        webContents.send(IPC_CHANNEL.file.contentsChanged, [
          ...workspace.changedFiles,
        ]);
      }
      workspace.changedDirs.clear();
      workspace.changedFiles.clear();
    };

    const scheduleFlush = () => {
      workspace.flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
    };

    // Only the parent's listing changes when an entry is added or removed.
    const onEntryChanged = (changedPath: string) => {
      workspace.changedDirs.add(path.dirname(changedPath));
      scheduleFlush();
    };

    // Edited, created or deleted files: an open tab showing it must reload.
    const onFileChanged = (changedPath: string) => {
      workspace.changedFiles.add(changedPath);
      scheduleFlush();
    };

    const onFileAddedOrRemoved = (changedPath: string) => {
      onEntryChanged(changedPath);
      onFileChanged(changedPath);
    };

    workspace.watcher
      .on("add", onFileAddedOrRemoved)
      .on("addDir", onEntryChanged)
      .on("change", onFileChanged)
      .on("unlink", onFileAddedOrRemoved)
      .on("unlinkDir", onEntryChanged)
      .on("error", (error) => console.error("File watcher error:", error));

    workspaces.set(webContents.id, workspace);
    webContents.once("destroyed", () => {
      void FileExplorer.closeWorkspace(webContents.id);
    });
  }

  static async closeWorkspace(webContentsId: number) {
    const workspace = workspaces.get(webContentsId);
    if (!workspace) return;

    workspaces.delete(webContentsId);
    allowedFiles.delete(webContentsId);
    if (workspace.flushTimer) clearTimeout(workspace.flushTimer);
    await workspace.watcher.close();
  }

  /** Lets the window read and write `filePath` even though it's outside the opened folder. */
  static allowFile(webContentsId: number, filePath: string) {
    const resolved = path.resolve(filePath);
    const workspace = workspaces.get(webContentsId);
    if (workspace && isInside(workspace.root, resolved)) return;

    let files = allowedFiles.get(webContentsId);
    if (!files) {
      files = new Set();
      allowedFiles.set(webContentsId, files);
    }
    files.add(resolved);
  }

  /** The window's opened folder, or null if none is open. */
  static workspaceRoot(webContentsId: number) {
    return workspaces.get(webContentsId)?.root ?? null;
  }

  /**
   * Resolves a renderer-supplied path, refusing anything outside the window's
   * opened folder (other than files allowed with `allowFile`).
   */
  static resolveInWorkspace(event: IpcMainInvokeEvent, target: string) {
    const workspace = workspaces.get(event.sender.id);
    const resolved = path.resolve(target);

    if (allowedFiles.get(event.sender.id)?.has(resolved)) return resolved;
    if (!workspace || !isInside(workspace.root, resolved)) {
      throw new Error(`"${target}" is not inside the opened folder`);
    }
    return resolved;
  }

  /** Lists one directory, directories first. Only works inside the opened folder. */
  static async readDirectory(
    event: IpcMainInvokeEvent,
    dirPath: string,
  ): Promise<DirectoryEntry[]> {
    const target = FileExplorer.resolveInWorkspace(event, dirPath);

    const dirents = await fs.readdir(target, { withFileTypes: true });

    const entries = await Promise.all(
      dirents
        .filter((dirent) => !HIDDEN_NAMES.has(dirent.name))
        .map(async (dirent): Promise<DirectoryEntry> => {
          const fullPath = path.join(target, dirent.name);
          return {
            name: dirent.name,
            path: fullPath,
            type: await resolveType(dirent, fullPath),
          };
        }),
    );

    return entries.sort(compareEntries);
  }

  /** Writes text to an already resolved path, re-adding a BOM if the file had one. */
  static async writeText(
    target: string,
    content: string,
    encoding: TextEncoding,
  ) {
    const body = Buffer.from(content, "utf8");
    const data =
      encoding === "utf-8-bom"
        ? Buffer.concat([Buffer.from(UTF8_BOM), body])
        : body;

    await fs.writeFile(target, data);
    const stats = await fs.stat(target);
    return { size: data.length, mtimeMs: stats.mtimeMs };
  }

  /** Text currently on disk at a resolved path, without a BOM; null if it can't be read. */
  static async readTextIfExists(target: string) {
    try {
      const buffer = await fs.readFile(target);
      const hasBom = UTF8_BOM.every((byte, i) => buffer[i] === byte);
      return buffer.toString("utf8", hasBom ? UTF8_BOM.length : 0);
    } catch {
      return null;
    }
  }

  /** Reads one file inside the opened folder. Binary and oversized files come back without content. */
  static async readFile(
    event: IpcMainInvokeEvent,
    filePath: string,
    options?: ReadFileOptions,
  ): Promise<FileContents> {
    const target = FileExplorer.resolveInWorkspace(event, filePath);

    const stats = await fs.stat(target);
    if (!stats.isFile()) {
      throw new Error(`"${filePath}" is not a file`);
    }

    const limit = options?.allowLarge
      ? MAX_LARGE_TEXT_FILE_BYTES
      : MAX_TEXT_FILE_BYTES;
    if (stats.size > limit) {
      return {
        kind: "too-large",
        path: target,
        size: stats.size,
        limit,
        canOpenAnyway: stats.size <= MAX_LARGE_TEXT_FILE_BYTES,
      };
    }

    const buffer = await fs.readFile(target);

    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
      return { kind: "binary", path: target, size: buffer.length };
    }

    const hasBom = UTF8_BOM.every((byte, i) => buffer[i] === byte);
    return {
      kind: "text",
      path: target,
      size: buffer.length,
      encoding: hasBom ? "utf-8-bom" : "utf-8",
      content: buffer.toString("utf8", hasBom ? UTF8_BOM.length : 0),
      mtimeMs: stats.mtimeMs,
    };
  }

  /** Reads an image inside the opened folder for the editor to preview. */
  static async readImage(
    event: IpcMainInvokeEvent,
    filePath: string,
  ): Promise<ImageContents> {
    const target = FileExplorer.resolveInWorkspace(event, filePath);
    const mimeType = imageMimeType(target);
    if (!mimeType) throw new Error(`"${filePath}" is not an image`);

    const stats = await fs.stat(target);
    if (!stats.isFile()) {
      throw new Error(`"${filePath}" is not a file`);
    }
    if (stats.size > MAX_IMAGE_BYTES) {
      return {
        kind: "too-large",
        path: target,
        size: stats.size,
        limit: MAX_IMAGE_BYTES,
      };
    }

    const data = await fs.readFile(target);
    return { kind: "image", path: target, size: data.length, mimeType, data };
  }

  /**
   * Resolves where a new entry called `name` goes inside `parentPath`, refusing
   * invalid names, anything outside the opened folder and names already taken.
   */
  private static async resolveNewEntry(
    event: IpcMainInvokeEvent,
    parentPath: string,
    name: string,
  ) {
    const error = validateEntryName(name);
    if (error) throw new Error(error);

    const parent = FileExplorer.resolveInWorkspace(event, parentPath);
    const target = FileExplorer.resolveInWorkspace(
      event,
      path.join(parent, ...splitEntryName(name)),
    );

    if (await exists(target)) {
      throw new Error(
        `A file or folder "${path.relative(parent, target)}" already exists at this location.`,
      );
    }
    return target;
  }

  /**
   * Resolves an existing entry for renaming or deleting: inside the opened
   * folder, and never the opened folder itself.
   */
  static resolveExistingEntry(event: IpcMainInvokeEvent, entryPath: string) {
    const target = FileExplorer.resolveInWorkspace(event, entryPath);
    if (target === workspaces.get(event.sender.id)?.root) {
      throw new Error("The opened folder itself can't be changed here.");
    }
    return target;
  }

  /** Renames a file or folder within its folder. Returns the new path. */
  static async renameEntry(
    event: IpcMainInvokeEvent,
    oldPath: string,
    newName: string,
  ): Promise<string> {
    const source = FileExplorer.resolveExistingEntry(event, oldPath);

    const error = validateEntryName(newName);
    if (error) throw new Error(error);
    const segments = splitEntryName(newName);
    if (segments.length !== 1) {
      throw new Error("A new name cannot contain a slash.");
    }

    const target = FileExplorer.resolveInWorkspace(
      event,
      path.join(path.dirname(source), segments[0]),
    );
    if (target === source) return source;

    if (await isOtherEntry(source, target)) {
      throw new Error(
        `A file or folder "${segments[0]}" already exists at this location. Please choose a different name.`,
      );
    }

    await fs.rename(source, target);
    return target;
  }

  /** Creates an empty file, plus any missing folders in `name`. Returns its path. */
  static async createFile(
    event: IpcMainInvokeEvent,
    parentPath: string,
    name: string,
  ): Promise<string> {
    const target = await FileExplorer.resolveNewEntry(event, parentPath, name);

    await fs.mkdir(path.dirname(target), { recursive: true });
    // `wx` fails instead of truncating if something appeared since the check.
    await fs.writeFile(target, "", { flag: "wx" });
    return target;
  }

  /** Creates a folder, plus any missing folders in `name`. Returns its path. */
  static async createDirectory(
    event: IpcMainInvokeEvent,
    parentPath: string,
    name: string,
  ): Promise<string> {
    const target = await FileExplorer.resolveNewEntry(event, parentPath, name);

    await fs.mkdir(path.dirname(target), { recursive: true });
    // Non-recursive so it fails if something appeared since the check.
    await fs.mkdir(target);
    return target;
  }
}
