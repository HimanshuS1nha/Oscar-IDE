import { searchCodeTool } from "@oscar/ai/tools";

import { openedFolder } from "@/tools/workspace";

/** Matches returned to the model; the search itself finds up to 5,000. */
const MAX_MATCHES = 200;

export const searchCode = searchCodeTool.client(async (input) => {
  openedFolder();
  const result = await window.electron.search.run({
    query: input.query,
    isRegex: input.isRegex ?? false,
    matchCase: input.matchCase ?? false,
    wholeWord: input.wholeWord ?? false,
    include: input.include ?? "",
    exclude: input.exclude ?? "",
    // Leaves the Search sidebar's own search alone.
    independent: true,
  });

  if (result.status === "invalid-query") {
    throw new Error(`Invalid regular expression: ${result.message}`);
  }
  if (result.status === "cancelled") throw new Error("The search was stopped.");

  const matches = result.files.flatMap((file) =>
    file.matches.map((match) => ({
      path: file.relativePath,
      line: match.line,
      text: match.preview,
    })),
  );
  return {
    matches: matches.slice(0, MAX_MATCHES),
    truncated: result.limitHit || matches.length > MAX_MATCHES,
  };
});
