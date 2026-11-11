import { toolDefinition } from "@tanstack/ai";
import z from "zod";

/** Server tool: reads a web page as text. Runs on the API, not on the user's machine. */
export const webFetchTool = toolDefinition({
  name: "web_fetch",
  description:
    "Fetch a public web page, such as a result from web_search or a documentation link, and return its text " +
    "converted to Markdown. Long pages are cut.",
  inputSchema: z.object({
    url: z.url().describe("An http or https URL."),
  }),
  outputSchema: z.object({
    url: z.string().describe("The final URL, after redirects."),
    title: z.string().nullable(),
    content: z.string().describe("The page's main text as Markdown."),
    truncated: z.boolean(),
  }),
});
