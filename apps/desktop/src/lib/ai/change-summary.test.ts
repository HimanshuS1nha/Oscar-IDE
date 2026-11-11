import { describe, expect, it } from "vitest";

import { lineStats, summarizeChanges, type FileChange } from "./change-summary";

const lines = (...items: string[]) => items.join("\n");

describe("lineStats", () => {
  it("counts nothing for the same text", () => {
    expect(lineStats("a\nb", "a\nb")).toEqual({ added: 0, removed: 0 });
    expect(lineStats("", "")).toEqual({ added: 0, removed: 0 });
  });

  it("counts a changed line as one removed and one added", () => {
    expect(lineStats(lines("a", "b", "c"), lines("a", "B", "c"))).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it("counts inserted and deleted lines", () => {
    expect(lineStats(lines("a", "c"), lines("a", "b", "c"))).toEqual({
      added: 1,
      removed: 0,
    });
    expect(lineStats(lines("a", "b", "c"), lines("a", "c"))).toEqual({
      added: 0,
      removed: 1,
    });
  });

  it("counts a new file's lines as added", () => {
    expect(lineStats("", lines("a", "b"))).toEqual({ added: 2, removed: 0 });
  });

  it("matches lines kept between changes", () => {
    // x and y move apart; only the edges change.
    expect(
      lineStats(lines("1", "x", "2", "y", "3"), lines("x", "new", "y")),
    ).toEqual({ added: 1, removed: 3 });
  });

  it("ignores Windows line breaks", () => {
    expect(lineStats("a\r\nb\r\n", "a\nb\n")).toEqual({ added: 0, removed: 0 });
  });

  it("counts a very large rewrite in full", () => {
    const before = Array.from({ length: 3000 }, (_, i) => `old ${i}`).join(
      "\n",
    );
    const after = Array.from({ length: 3000 }, (_, i) => `new ${i}`).join("\n");
    expect(lineStats(before, after)).toEqual({ added: 3000, removed: 3000 });
  });
});

describe("summarizeChanges", () => {
  const change = (
    path: string,
    before: string | null,
    after: string,
  ): FileChange => ({
    path: `/repo/${path}`,
    relativePath: path,
    before,
    after,
  });

  it("spans each file from before its first change to after its last", () => {
    const files = summarizeChanges([
      change("a.ts", "one", "two"),
      change("b.ts", null, "new"),
      change("a.ts", "two", "three"),
    ]);

    expect(
      files.map((file) => [file.relativePath, file.before, file.after]),
    ).toEqual([
      ["a.ts", "one", "three"],
      ["b.ts", null, "new"],
    ]);
    expect(files[1]).toMatchObject({ added: 1, removed: 0 });
  });

  it("leaves out a file changed back to how it was", () => {
    expect(
      summarizeChanges([
        change("a.ts", "one", "two"),
        change("a.ts", "two", "one"),
      ]),
    ).toEqual([]);
  });

  it("keeps a created file even when it's empty", () => {
    expect(summarizeChanges([change("empty.ts", null, "")])).toHaveLength(1);
  });
});
