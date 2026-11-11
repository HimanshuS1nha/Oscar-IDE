import { describe, expect, it } from "vitest";

import { cleanCommitMessage } from "./clean-commit-message";
import { cleanCompletion } from "./clean-completion";

describe("cleanCompletion", () => {
  it("unwraps a code fence", () => {
    expect(
      cleanCompletion({
        reply: "```ts\nreturn a + b;\n```",
        prefix: "",
        suffix: "",
      }),
    ).toBe("return a + b;");
  });

  it("drops the start of the line the model repeated", () => {
    expect(
      cleanCompletion({
        reply: "const total = items.length;",
        prefix: "let x = 1;\nconst total = ",
        suffix: "",
      }),
    ).toBe("items.length;");
  });

  it("drops code the model repeated from after the cursor", () => {
    expect(
      cleanCompletion({
        reply: "a + b);\n}",
        prefix: "sum(",
        suffix: ");\n}",
      }),
    ).toBe("a + b");
  });
});

describe("cleanCommitMessage", () => {
  it("unwraps a fence and trims each line", () => {
    expect(
      cleanCommitMessage("```\nFix login   \n\n\n\nBody line  \n```"),
    ).toBe("Fix login\n\nBody line");
  });

  it("removes quotes around the whole message", () => {
    expect(cleanCommitMessage('"Add tests"')).toBe("Add tests");
  });
});
