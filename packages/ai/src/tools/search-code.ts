import { toolDefinition } from "@tanstack/ai";
import z from "zod";

/**
 * Client tool: searches file contents. Backed by the app's Find in Files,
 * so the options are the same.
 */
export const searchCodeTool = toolDefinition({
  name: "search_code",
  description:
    "Search the contents of files in the user's opened folder for text or a regular expression, line by line. " +
    "Returns each match with its file, line and the line's text.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Text, or a regular expression if isRegex is true."),
    isRegex: z.boolean().optional(),
    matchCase: z.boolean().optional(),
    wholeWord: z.boolean().optional(),
    include: z
      .string()
      .optional()
      .describe(
        "Comma-separated globs; only matching files are searched, e.g. src/**/*.ts.",
      ),
    exclude: z
      .string()
      .optional()
      .describe("Comma-separated globs of files and folders to skip."),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({
        path: z.string().describe("Relative to the opened folder."),
        line: z.number().int().describe("From 1."),
        text: z.string().describe("The line, shortened around the match."),
      }),
    ),
    truncated: z
      .boolean()
      .describe("True if the search stopped early at the match limit."),
  }),
});
