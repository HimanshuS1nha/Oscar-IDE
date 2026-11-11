export type SearchRequest = {
  query: string;
  isRegex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
  /** Comma-separated globs; only matching files are searched. Empty searches everything. */
  include: string;
  /** Comma-separated globs; matching files and folders are skipped. */
  exclude: string;
  /**
   * Neither cancels nor is cancelled by other searches. For the AI's
   * searches, which mustn't interrupt the Search sidebar (or each other).
   */
  independent?: boolean;
};

export type SearchMatch = {
  /** 1-based line number. */
  line: number;
  /** 1-based column where the match starts (UTF-16 units, as Monaco counts). */
  column: number;
  length: number;
  /** The line, shortened around the match. `matchStart`/`matchEnd` index into it. */
  preview: string;
  matchStart: number;
  matchEnd: number;
};

export type SearchFileResult = {
  /** Absolute path, in the OS's native format. */
  path: string;
  /** Path from the opened folder, always with `/`. */
  relativePath: string;
  matches: SearchMatch[];
};

export type SearchResult =
  | {
      status: "done";
      files: SearchFileResult[];
      /** Stopped early after hitting the match limit. */
      limitHit: boolean;
    }
  /** A newer search from the same window replaced this one. */
  | { status: "cancelled" }
  /** The query is not a valid regular expression. */
  | { status: "invalid-query"; message: string };

/** Search options that decide what matches (the query part of a request). */
export type SearchQuery = Pick<
  SearchRequest,
  "query" | "isRegex" | "matchCase" | "wholeWord"
>;

/** One match to replace, as reported by a search. */
export type ReplaceTarget = Pick<SearchMatch, "line" | "column">;

export type ReplaceFileRequest = {
  /** Absolute path of a file inside the opened folder. */
  path: string;
  /** Only these matches; omit to replace every match in the file. */
  matches?: ReplaceTarget[];
};

export type ReplaceRequest = SearchQuery & {
  replacement: string;
  files: ReplaceFileRequest[];
};

export type ReplaceResult = {
  /** Files that were rewritten, with how many matches each had replaced. */
  replaced: { path: string; count: number }[];
  /** Files that couldn't be read or written, with why. */
  failed: { path: string; message: string }[];
};

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The query as a global regular expression, matched one line at a time (as
 * search does). Throws if `isRegex` and the pattern is invalid.
 */
export const compileSearchQuery = (query: SearchQuery) => {
  let source = query.isRegex ? query.query : escapeRegExp(query.query);
  if (query.wholeWord) source = `\\b(?:${source})\\b`;
  return new RegExp(source, query.matchCase ? "g" : "gi");
};

/** `**`, `*`, `?` and `{a,b}` globs, matched against `/`-separated relative paths. */
const globToRegExpSource = (glob: string) => {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches any number of folders, including none.
        const slash = glob[i + 2] === "/";
        source += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        source += "\\{";
        continue;
      }
      const options = glob.slice(i + 1, end).split(",");
      source += `(?:${options.map(globToRegExpSource).join("|")})`;
      i = end;
    } else {
      source += escapeRegExp(char);
    }
  }
  return source;
};

/** Splits a glob list at its commas, except those inside `{a,b}`. */
const splitGlobList = (list: string) => {
  const globs: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "{") depth++;
    else if (char === "}" && depth > 0) depth--;
    if (char === "," && depth === 0) {
      globs.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  globs.push(current);
  return globs;
};

/**
 * A comma-separated glob list as one matcher. A glob without `/` matches any
 * file or folder name (`*.ts`, `dist`); one with `/` matches from the opened
 * folder (`src/**`). Matching a folder matches everything inside it.
 */
export const compileGlobs = (list: string) => {
  const globs = splitGlobList(list)
    .map((glob) =>
      glob
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.?\//, ""),
    )
    .filter(Boolean);
  if (globs.length === 0) return null;

  const sources = globs.map((glob) => {
    const body = globToRegExpSource(glob.replace(/\/+$/, ""));
    return glob.includes("/") ? `^${body}(?:/|$)` : `(?:^|/)${body}(?:/|$)`;
  });
  const regExp = new RegExp(sources.join("|"), "i");
  return (relativePath: string) => regExp.test(relativePath);
};

/** Splits text into lines, each with the line break that ended it ("" for the last). */
const splitLines = (text: string) => {
  const parts = text.split(/(\r\n|\r|\n)/);
  const lines: { text: string; eol: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push({ text: parts[i], eol: parts[i + 1] ?? "" });
  }
  return lines;
};

/**
 * Expands `$$`, `$&`, `` $` ``, `$'`, `$1`…`$99` and `$<name>` in a regular
 * expression replacement, as `String.prototype.replace` does, from a match
 * made against `line`.
 */
const expandReplacement = (
  replacement: string,
  match: RegExpExecArray,
  line: string,
) =>
  replacement.replace(
    /\$(\$|&|`|'|\d{1,2}|<([^>]*)>)/g,
    (token, code: string, name?: string) => {
      if (code === "$") return "$";
      if (code === "&") return match[0];
      if (code === "`") return line.slice(0, match.index);
      if (code === "'") return line.slice(match.index + match[0].length);
      if (name !== undefined) {
        return match.groups ? (match.groups[name] ?? "") : token;
      }
      // `$12` means group 12 if it exists, else group 1 followed by "2".
      const groupCount = match.length - 1;
      let index = Number(code);
      let rest = "";
      if (index > groupCount && code.length === 2) {
        index = Number(code[0]);
        rest = code[1];
      }
      if (index === 0 || index > groupCount) return token;
      return (match[index] ?? "") + rest;
    },
  );

/**
 * Replaces matches of `query` in `text`, line by line, so exactly what search
 * found is replaced and line breaks are kept. With a regular expression the
 * replacement may use `$1`, `$<name>` and `$&`; otherwise it is literal.
 * With `targets`, only matches starting at those positions are replaced
 * (positions that no longer match are skipped).
 */
export const replaceInText = (
  text: string,
  query: SearchQuery,
  replacement: string,
  targets?: ReplaceTarget[],
): { text: string; count: number } => {
  const regExp = compileSearchQuery(query);
  const wanted =
    targets && new Set(targets.map((t) => `${t.line}:${t.column}`));
  // Literal replacements must not treat `$` specially.
  const replace = query.isRegex
    ? (match: RegExpExecArray, line: string) =>
        expandReplacement(replacement, match, line)
    : () => replacement;

  let count = 0;
  const lines = splitLines(text).map(({ text: line, eol }, index) => {
    let result = "";
    let last = 0;
    regExp.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regExp.exec(line))) {
      if (match[0].length === 0) {
        regExp.lastIndex++;
        continue;
      }
      if (wanted && !wanted.has(`${index + 1}:${match.index + 1}`)) continue;
      result += line.slice(last, match.index) + replace(match, line);
      last = match.index + match[0].length;
      count++;
    }
    return result + line.slice(last) + eol;
  });
  return { text: lines.join(""), count };
};

/** Files in the opened folder, for quick open. */
export type WorkspaceFiles = {
  /** The opened folder, or null if none is open. */
  root: string | null;
  /** Paths from `root`, always with `/`. */
  files: string[];
  /** Stopped early: the folder has more files than are listed. */
  limitHit: boolean;
};
