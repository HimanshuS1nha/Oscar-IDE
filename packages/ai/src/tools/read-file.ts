import { toolDefinition } from "@tanstack/ai";
import z from "zod";

import { workspacePath } from "./shared";

/** Client tool: reads a text file from the opened folder. */
export const readFileTool = toolDefinition({
  name: "read_file",
  description:
    "Read a text file from the user's opened folder. Returns its lines numbered from 1. " +
    "For large files, read a part at a time with offset and limit. Binary files can't be read.",
  inputSchema: z.object({
    path: workspacePath,
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "First line to read, from 1. Defaults to the start of the file.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe("How many lines to read. Defaults to 2000."),
  }),
  outputSchema: z.object({
    path: z.string().describe("The file's path relative to the opened folder."),
    content: z.string().describe("The lines read, joined with newlines."),
    startLine: z.number().int(),
    endLine: z.number().int(),
    totalLines: z.number().int(),
    truncated: z
      .boolean()
      .describe("True if the file has lines after endLine."),
  }),
});
