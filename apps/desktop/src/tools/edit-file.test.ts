import { describe, expect, it, vi } from "vitest";

import { applyEdit } from "@/tools/edit-file";

// Monaco needs a browser; applyEdit is plain text.
vi.mock("@/lib/monaco", () => ({ monaco: {} }));
vi.mock("@/lib/file-documents", () => ({}));
vi.mock("@/lib/replace-in-files", () => ({}));

const edit = (
  text: string,
  oldString: string,
  newString: string,
  replaceAll?: boolean,
) => applyEdit(text, { oldString, newString, replaceAll }, "a.ts");

describe("applyEdit", () => {
  it("replaces a unique match", () => {
    expect(edit("let a = 1;\nlet b = 2;", "b = 2", "b = 3")).toEqual({
      text: "let a = 1;\nlet b = 3;",
      count: 1,
    });
  });

  it("refuses a missing or ambiguous match unless replaceAll", () => {
    expect(() => edit("x x", "y", "z")).toThrow("wasn't found");
    expect(() => edit("x x", "x", "z")).toThrow("appears 2 times");
    expect(edit("x x", "x", "z", true)).toEqual({ text: "z z", count: 2 });
  });

  it("matches a file with Windows line breaks", () => {
    expect(edit("a\r\nb\r\n", "a\nb", "c\nd").text).toBe("c\r\nd\r\n");
  });

  it("inserts `$` sequences literally", () => {
    expect(edit("price", "price", "$& $1").text).toBe("$& $1");
  });
});
