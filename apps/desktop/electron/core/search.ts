import type { IpcMainInvokeEvent } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

import {
  compileGlobs,
  compileSearchQuery,
  replaceInText,
  type ReplaceRequest,
  type ReplaceResult,
  type SearchFileResult,
  type SearchMatch,
  type SearchRequest,
  type SearchResult,
  type WorkspaceFiles,
} from "../shared/search";
import { FileExplorer, HIDDEN_NAMES } from "./file-explorer";
import { showMessageBox } from "./file-operations";

/** Folders never searched unless the user opts in by opening them. */
const SKIPPED_DIRS = new Set(["node_modules"]);

/** Files above this are skipped: they're almost never source. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Stop collecting after this many matches, so huge result sets stay responsive. */
const MAX_MATCHES = 5000;

/** How much of a file is checked for NUL bytes to detect binary content (same as git). */
const BINARY_SNIFF_BYTES = 8000;

/** Quick open lists at most this many files. */
const MAX_LISTED_FILES = 50_000;

/** Files read at once. */
const CONCURRENCY = 16;

/** Characters of context kept before a match: the sidebar is narrow, so the match must come early. */
const PREVIEW_BEFORE = 16;
const PREVIEW_AFTER = 200;

/** Latest search per window. Older ones see a different number and stop. */
const generations = new Map<number, number>();

const buildPreview = (
  line: string,
  start: number,
  end: number,
): Pick<SearchMatch, "preview" | "matchStart" | "matchEnd"> => {
  let from = Math.max(0, start - PREVIEW_BEFORE);
  // Indentation adds nothing to a preview.
  while (from < start && /\s/.test(line[from])) from++;
  const to = Math.min(line.length, end + PREVIEW_AFTER);

  // Only mark a cut when it removed more than indentation.
  const prefix = line.slice(0, from).trim() ? "…" : "";
  return {
    preview: prefix + line.slice(from, to),
    matchStart: prefix.length + start - from,
    matchEnd: prefix.length + end - from,
  };
};

const findInText = (
  text: string,
  regExp: RegExp,
  limit: number,
): SearchMatch[] => {
  const matches: SearchMatch[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    regExp.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regExp.exec(line))) {
      if (match[0].length === 0) {
        // Zero-length matches (e.g. `^`) would loop forever and mean nothing here.
        regExp.lastIndex++;
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      matches.push({
        line: index + 1,
        column: start + 1,
        length: match[0].length,
        ...buildPreview(line, start, end),
      });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
};

/** Reads a file as text, or null if it is binary, too large or unreadable. */
const readSearchableText = async (filePath: string) => {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;

    const buffer = await fs.readFile(filePath);
    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
};

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const pluralize = (count: number, word: string) =>
  `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

export class FileSearch {
  /**
   * Searches every text file in the window's opened folder. Starting another
   * search from the same window cancels this one.
   */
  static async search(
    event: IpcMainInvokeEvent,
    request: SearchRequest,
  ): Promise<SearchResult> {
    const windowId = event.sender.id;
    let isCancelled = () => event.sender.isDestroyed();
    if (!request.independent) {
      const generation = (generations.get(windowId) ?? 0) + 1;
      generations.set(windowId, generation);
      isCancelled = () =>
        generations.get(windowId) !== generation || event.sender.isDestroyed();
    }

    const root = FileExplorer.workspaceRoot(windowId);
    if (!root || !request.query) {
      return { status: "done", files: [], limitHit: false };
    }

    let regExp: RegExp;
    try {
      regExp = compileSearchQuery(request);
    } catch (error) {
      return {
        status: "invalid-query",
        message: error instanceof Error ? error.message : String(error),
      };
    }

    const isIncluded = compileGlobs(request.include);
    const isExcluded = compileGlobs(request.exclude);
    const toRelative = (fullPath: string) =>
      path.relative(root, fullPath).split(path.sep).join("/");

    const files: SearchFileResult[] = [];
    let matchCount = 0;
    let limitHit = false;

    const searchFile = async (filePath: string) => {
      const text = await readSearchableText(filePath);
      if (text === null || limitHit || isCancelled()) return;

      const matches = findInText(
        text,
        new RegExp(regExp.source, regExp.flags),
        MAX_MATCHES - matchCount,
      );
      if (matches.length === 0) return;

      files.push({
        path: filePath,
        relativePath: toRelative(filePath),
        matches,
      });
      matchCount += matches.length;
      if (matchCount >= MAX_MATCHES) limitHit = true;
    };

    // Breadth-first walk; files are searched in batches as they're found.
    const dirs = [root];
    let pending: string[] = [];
    const flush = async () => {
      const batch = pending;
      pending = [];
      for (let i = 0; i < batch.length && !limitHit; i += CONCURRENCY) {
        if (isCancelled()) return;
        await Promise.all(batch.slice(i, i + CONCURRENCY).map(searchFile));
      }
    };

    while (dirs.length > 0 && !limitHit) {
      if (isCancelled()) return { status: "cancelled" };

      const dir = dirs.shift()!;
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const dirent of dirents) {
        if (HIDDEN_NAMES.has(dirent.name)) continue;
        const fullPath = path.join(dir, dirent.name);
        const relativePath = toRelative(fullPath);
        if (isExcluded?.(relativePath)) continue;

        if (dirent.isDirectory()) {
          if (!SKIPPED_DIRS.has(dirent.name)) dirs.push(fullPath);
        } else if (dirent.isFile() || dirent.isSymbolicLink()) {
          // Linked folders are not followed (they can loop); linked files are read.
          if (!isIncluded || isIncluded(relativePath)) pending.push(fullPath);
        }
      }

      if (pending.length >= CONCURRENCY * 4) await flush();
    }
    await flush();

    if (isCancelled()) return { status: "cancelled" };

    files.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
    return { status: "done", files, limitHit };
  }

  /**
   * Replaces matches in files on disk, keeping each file's line breaks and
   * byte order mark. Matches are found again in the current contents, so a
   * file edited since the search only has what still matches replaced.
   */
  static async replace(
    event: IpcMainInvokeEvent,
    request: ReplaceRequest,
  ): Promise<ReplaceResult> {
    const result: ReplaceResult = { replaced: [], failed: [] };

    for (const file of request.files) {
      try {
        const target = FileExplorer.resolveInWorkspace(event, file.path);
        const stat = await fs.stat(target);
        if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
          throw new Error("Not a file, or too large to edit");
        }
        const buffer = await fs.readFile(target);
        if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
          throw new Error("Binary files can't be edited");
        }
        const hasBom = buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM);
        const text = buffer.toString("utf8", hasBom ? UTF8_BOM.length : 0);

        const replaced = replaceInText(
          text,
          request,
          request.replacement,
          file.matches,
        );
        if (replaced.count === 0) continue;

        await FileExplorer.writeText(
          target,
          replaced.text,
          hasBom ? "utf-8-bom" : "utf-8",
        );
        result.replaced.push({ path: target, count: replaced.count });
      } catch (error) {
        result.failed.push({ path: file.path, message: errorMessage(error) });
      }
    }

    if (result.failed.length > 0) {
      await showMessageBox(event, {
        type: "error",
        title: "Replace Failed",
        message: `Couldn't replace in ${pluralize(result.failed.length, "file")}.`,
        detail: result.failed
          .map((f) => `${path.basename(f.path)}: ${f.message}`)
          .join("\n"),
        buttons: ["OK"],
      });
    }
    return result;
  }

  /** "Replace N occurrences across M files with …?" Resolves true to go ahead. */
  static async confirmReplace(
    event: IpcMainInvokeEvent,
    request: { matchCount: number; fileCount: number; replacement: string },
  ): Promise<boolean> {
    const occurrences = pluralize(request.matchCount, "occurrence");
    const files = pluralize(request.fileCount, "file");
    const { response } = await showMessageBox(event, {
      type: "warning",
      title: "Replace All",
      message: request.replacement
        ? `Replace ${occurrences} across ${files} with "${request.replacement}"?`
        : `Remove ${occurrences} across ${files}?`,
      detail:
        "Files open in the editor can be changed back with Undo. Other files are written directly.",
      buttons: ["Replace", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    return response === 0;
  }

  /** Every file in the opened folder, for quick open. Skips the same folders as search. */
  static async listFiles(event: IpcMainInvokeEvent): Promise<WorkspaceFiles> {
    const root = FileExplorer.workspaceRoot(event.sender.id);
    if (!root) return { root: null, files: [], limitHit: false };

    const files: string[] = [];
    const dirs = [root];
    while (dirs.length > 0) {
      const dir = dirs.shift()!;
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const dirent of dirents) {
        if (HIDDEN_NAMES.has(dirent.name)) continue;
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          if (!SKIPPED_DIRS.has(dirent.name)) dirs.push(fullPath);
        } else if (dirent.isFile() || dirent.isSymbolicLink()) {
          files.push(path.relative(root, fullPath).split(path.sep).join("/"));
          if (files.length >= MAX_LISTED_FILES) {
            return { root, files, limitHit: true };
          }
        }
      }
    }
    return { root, files, limitHit: false };
  }
}
