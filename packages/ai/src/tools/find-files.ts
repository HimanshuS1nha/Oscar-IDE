import { toolDefinition } from "@tanstack/ai";
import z from "zod";

/**
 * Client tool: lists files by name. Backed by the app's quick-open file list,
 * so it skips the same folders (node_modules and so on).
 */
export const findFilesTool = toolDefinition({
  name: "find_files",
  description:
    "Find files in the user's opened folder whose path matches a glob, e.g. **/*.ts or src/**/route.tsx. " +
    "Returns paths relative to the opened folder. Skips node_modules.",
  inputSchema: z.object({
    pattern: z
      .string()
      .min(1)
      .describe("Glob matched against each file's relative path."),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Defaults to 200."),
  }),
  outputSchema: z.object({
    files: z.array(z.string()),
    truncated: z
      .boolean()
      .describe("True if more files matched than were returned."),
  }),
});
