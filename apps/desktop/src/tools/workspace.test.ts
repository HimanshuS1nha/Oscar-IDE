import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { resolveWorkspacePath } from "@/tools/workspace";

// Monaco needs a browser; path resolution doesn't use it.
vi.mock("@/lib/monaco", () => ({ monaco: {} }));
vi.mock("@/lib/file-documents", () => ({}));
vi.mock("@/lib/replace-in-files", () => ({}));

describe("resolveWorkspacePath", () => {
  beforeEach(() => {
    useSelectedFolder.setState({ selectedFolderPath: "/repo" });
  });

  it("resolves relative and absolute paths inside the folder", () => {
    expect(resolveWorkspacePath("src/./a/../index.ts")).toEqual({
      absolute: "/repo/src/index.ts",
      relative: "src/index.ts",
    });
    expect(resolveWorkspacePath("/repo/src/index.ts").relative).toBe(
      "src/index.ts",
    );
    expect(resolveWorkspacePath(".")).toEqual({
      absolute: "/repo",
      relative: "",
    });
  });

  it("refuses paths outside the folder", () => {
    for (const path of [
      "../secret",
      "src/../../secret",
      "/etc/passwd",
      "/repo-other/a",
    ]) {
      expect(() => resolveWorkspacePath(path), path).toThrow(
        "outside the opened folder",
      );
    }
  });

  it("refuses everything when no folder is open", () => {
    useSelectedFolder.setState({ selectedFolderPath: null });
    expect(() => resolveWorkspacePath("a.ts")).toThrow("No folder is open");
  });
});
