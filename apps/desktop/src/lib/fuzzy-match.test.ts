import { describe, expect, it } from "vitest";

import { fuzzyScore, fuzzyScorePath, normalizeQuery } from "@/lib/fuzzy-match";

const rank = (query: string, paths: string[]) =>
  paths
    .map((path) => ({
      path,
      score: fuzzyScorePath(normalizeQuery(query), path),
    }))
    .filter((match) => match.score !== null)
    .sort((a, b) => b.score! - a.score!)
    .map((match) => match.path);

describe("fuzzy match", () => {
  it("needs every character, in order", () => {
    expect(fuzzyScore("utl", "utils.ts")).not.toBeNull();
    expect(fuzzyScore("ltu", "utils.ts")).toBeNull();
  });

  it("ranks a file name match above a match across folders", () => {
    expect(
      rank("button", [
        "src/b/u/t/t/o/n.ts",
        "src/components/ui/button.tsx",
        "src/other.ts",
      ]),
    ).toEqual(["src/components/ui/button.tsx", "src/b/u/t/t/o/n.ts"]);
  });

  it("ranks word starts and camelCase above scattered letters", () => {
    expect(
      rank("uof", ["src/hooks/use-opened-files.ts", "src/upload-form.ts"]),
    ).toEqual(["src/hooks/use-opened-files.ts", "src/upload-form.ts"]);
  });
});
