import { describe, expect, it } from "vitest";

import {
  baseName,
  isSameOrInside,
  joinRelative,
  parentPath,
  rebasePath,
} from "@/lib/paths";

describe("paths", () => {
  it("handles POSIX and Windows paths", () => {
    expect(baseName("/a/b/c.ts")).toBe("c.ts");
    expect(baseName("C:\\a\\c.ts")).toBe("c.ts");
    expect(parentPath("/a/b/c.ts")).toBe("/a/b");
    expect(parentPath("/a")).toBe("/");
    expect(parentPath("C:\\a")).toBe("C:\\");
    expect(joinRelative("C:\\repo", "src/a.ts")).toBe("C:\\repo\\src\\a.ts");
    expect(joinRelative("/repo/", "src/a.ts")).toBe("/repo/src/a.ts");
  });

  it("does not treat a sibling with the same prefix as inside", () => {
    expect(isSameOrInside("/repo/src/a.ts", "/repo")).toBe(true);
    expect(isSameOrInside("/repo", "/repo")).toBe(true);
    expect(isSameOrInside("/repo-other/a.ts", "/repo")).toBe(false);
  });

  it("moves a path to a renamed folder", () => {
    expect(rebasePath("/repo/old/a.ts", "/repo/old", "/repo/new")).toBe(
      "/repo/new/a.ts",
    );
  });
});
