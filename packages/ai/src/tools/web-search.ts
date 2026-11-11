import { toolDefinition } from "@tanstack/ai";
import z from "zod";

/** Server tool: searches the web. Runs on the API, which holds the search key. */
export const webSearchTool = toolDefinition({
  name: "web_search",
  description:
    "Search the web for current information, such as documentation, error messages or library versions. " +
    "Returns result titles, links and snippets; use web_fetch to read a page.",
  inputSchema: z.object({
    query: z.string().min(1),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Defaults to 5."),
    allowedDomains: z
      .array(z.string())
      .optional()
      .describe("Only return results from these domains, e.g. react.dev."),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      }),
    ),
  }),
});
