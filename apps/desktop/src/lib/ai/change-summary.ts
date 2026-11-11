/**
 * What the AI's file tools changed in one turn of the chat (from a message of
 * the user's to the end of the reply), worked out from each tool call's
 * before and after. Kept free of Monaco and the app's stores, for testing.
 */

/** One `write_file` or `edit_file` call that went through. */
export type FileChange = {
  /** Native absolute path. */
  path: string;
  /** From the opened folder, with `/`. */
  relativePath: string;
  /** The text before the call; null when the call created the file. */
  before: string | null;
  after: string;
};

/** A file the turn changed, from before its first change to after its last. */
export type TurnFile = FileChange & {
  /** Lines added and removed. */
  added: number;
  removed: number;
};

const splitLines = (text: string) =>
  text === "" ? [] : text.replace(/\r\n/g, "\n").split("\n");

/** Above this many cells, the middle of a diff is counted as all changed. */
const MAX_LCS_CELLS = 4_000_000;

/**
 * Lines added and removed between two texts. Lines kept at the start and end
 * are skipped first; the rest is a longest-common-subsequence diff, or, for a
 * very large rewrite, counted as removed and added in full.
 */
export const lineStats = (before: string, after: string) => {
  const a = splitLines(before);
  const b = splitLines(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const removedLines = a.slice(start, endA);
  const addedLines = b.slice(start, endB);
  const m = removedLines.length;
  const n = addedLines.length;
  if (m === 0 || n === 0 || m * n > MAX_LCS_CELLS) {
    return { added: n, removed: m };
  }

  // One row at a time: the length of the longest common subsequence.
  let previous = new Uint32Array(n + 1);
  let current = new Uint32Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      current[j] =
        removedLines[i - 1] === addedLines[j - 1]
          ? previous[j - 1]! + 1
          : Math.max(previous[j]!, current[j - 1]!);
    }
    [previous, current] = [current, previous];
  }
  const common = previous[n]!;
  return { added: n - common, removed: m - common };
};

/**
 * The files a turn changed, in the order it first changed them. A file the
 * turn changed back to how it was is left out.
 */
export const summarizeChanges = (changes: ReadonlyArray<FileChange>) => {
  const byPath = new Map<string, FileChange>();
  for (const change of changes) {
    const first = byPath.get(change.path);
    byPath.set(
      change.path,
      first ? { ...first, after: change.after } : { ...change },
    );
  }

  const files: TurnFile[] = [];
  for (const change of byPath.values()) {
    if (change.before === change.after) continue;
    files.push({ ...change, ...lineStats(change.before ?? "", change.after) });
  }
  return files;
};
