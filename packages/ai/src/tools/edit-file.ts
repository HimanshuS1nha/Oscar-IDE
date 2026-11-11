import { toolDefinition } from "@tanstack/ai";
import z from "zod";

import { workspacePath } from "./shared";

/** Client tool: replaces exact text in a file, after the user approves the diff. */
export const editFileTool = toolDefinition({
  name: "edit_file",
  description:
    "Replace exact text in a file in the user's opened folder. oldString must match the file exactly, " +
    "including whitespace, and appear only once unless replaceAll is true; include surrounding lines to make it unique. " +
    "Read the file first. The user approves each edit as a diff.",
  inputSchema: z.object({
    path: workspacePath,
    oldString: z.string().min(1).describe("The exact text to replace."),
    newString: z
      .string()
      .describe("The text to put in its place. Empty deletes it."),
    replaceAll: z
      .boolean()
      .optional()
      .describe("Replace every occurrence instead of requiring exactly one."),
  }),
  outputSchema: z.object({
    path: z.string(),
    replacements: z
      .number()
      .int()
      .describe("How many occurrences were replaced."),
    saved: z
      .boolean()
      .describe(
        "False if the file is open in the editor with the user's unsaved edits: the change is in the editor but not yet on disk, so commands won't see it.",
      ),
  }),
  needsApproval: true,
});
