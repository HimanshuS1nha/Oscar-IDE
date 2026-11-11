/**
 * Fuzzy matching for quick open: the query's characters must appear in order
 * (ignoring case and spaces). Higher scores are better; matches at the start
 * of a word, in a run, or early on score higher.
 */

const isSeparator = (char: string) => /[\s/\\_\-.]/.test(char);

const isWordStart = (text: string, index: number) => {
  if (index === 0) return true;
  const previous = text[index - 1];
  const char = text[index];
  return (
    isSeparator(previous) ||
    // camelCase: a capital after a lowercase letter.
    (char !== char.toLowerCase() && previous === previous.toLowerCase())
  );
};

/**
 * Scores `text` against an already normalised (lowercase, no spaces) `query`.
 * Returns null if the characters don't all appear in order.
 */
const scoreNormalized = (query: string, text: string) => {
  if (query.length === 0) return 0;
  const lower = text.toLowerCase();

  let score = 0;
  let from = 0;
  let previousMatch = -2;
  for (const char of query) {
    // Prefer the next occurrence at a word start, if there is one before the run breaks.
    let index = lower.indexOf(char, from);
    if (index === -1) return null;
    if (index !== previousMatch + 1) {
      for (
        let candidate = index;
        candidate !== -1;
        candidate = lower.indexOf(char, candidate + 1)
      ) {
        if (isWordStart(text, candidate)) {
          index = candidate;
          break;
        }
      }
    }

    score += 1;
    if (index === previousMatch + 1) score += 5;
    if (isWordStart(text, index)) score += 8;
    if (text[index] === char) score += 1; // same case as typed
    previousMatch = index;
    from = index + 1;
  }
  // Shorter texts, and matches that start early, are closer to what was typed.
  return score - text.length * 0.05;
};

export const normalizeQuery = (query: string) =>
  query.toLowerCase().replace(/\s+/g, "");

/** Fuzzy score of `text` for a query; null if it doesn't match. */
export const fuzzyScore = (query: string, text: string) =>
  scoreNormalized(normalizeQuery(query), text);

/**
 * Fuzzy score of a file path from the opened folder (with `/`). Matching
 * within the file name ranks above matching across folders.
 */
export const fuzzyScorePath = (
  normalizedQuery: string,
  relativePath: string,
) => {
  const slash = relativePath.lastIndexOf("/");
  const name = relativePath.slice(slash + 1);
  const nameScore = scoreNormalized(normalizedQuery, name);
  if (nameScore !== null) {
    return nameScore + 100 - relativePath.length * 0.05;
  }
  return scoreNormalized(normalizedQuery, relativePath);
};
