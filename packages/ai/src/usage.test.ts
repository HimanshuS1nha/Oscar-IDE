import { describe, expect, it } from "vitest";
import { chat, toolDefinition } from "@tanstack/ai";
import { fakeText } from "@tanstack/ai/testing";
import { z } from "zod";

import { withUsage, type ModelCallUsage } from "./usage";

const lookup = toolDefinition({
  name: "lookup",
  description: "Looks something up.",
  inputSchema: z.object({ query: z.string() }),
}).server(async ({ query }) => ({ answer: `About ${query}` }));

describe("withUsage", () => {
  it("reports every model call of a run that uses tools", async () => {
    const adapter = fakeText();
    adapter.setResponses([
      { toolCalls: [{ name: "lookup", input: { query: "oscar" } }] },
      { text: "Oscar is an editor." },
    ]);
    const calls: ModelCallUsage[] = [];

    const stream = chat({
      adapter,
      messages: [{ role: "user", content: "What is Oscar?" }],
      threadId: "usage-test",
      tools: [lookup],
      middleware: [withUsage((usage) => void calls.push(usage))],
    });
    for await (const _chunk of stream) {
      // Drain the run.
    }

    expect(calls).toHaveLength(2);
    for (const usage of calls) {
      expect(usage.promptTokens).toBeGreaterThan(0);
      expect(usage.completionTokens).toBeGreaterThan(0);
    }
    // The second call sends the tool result back, so it reads more.
    expect(calls[1]!.promptTokens).toBeGreaterThan(calls[0]!.promptTokens);
  });

  it("reports the call of a run that isn't streamed", async () => {
    const adapter = fakeText();
    adapter.setResponses([{ text: "fix: handle empty input" }]);
    const calls: ModelCallUsage[] = [];

    const result = await chat({
      adapter,
      messages: [{ role: "user", content: "Write a commit message." }],
      threadId: "usage-test",
      stream: false,
      middleware: [withUsage((usage) => void calls.push(usage))],
    });

    expect(result.text).toBe("fix: handle empty input");
    expect(calls).toHaveLength(1);
  });
});
