import { toolDefinition } from "@tanstack/ai";
import z from "zod";

import { workspacePath } from "./shared";

/** Client tool: creates a file, or replaces one, after the user approves. */
export const writeFileTool = toolDefinition({
  name: "write_file",
  description:
    "Create a file, or replace a whole file, in the user's opened folder. Missing folders are created. " +
    "To change part of an existing file, use edit_file instead. The user approves each write.",
  inputSchema: z.object({
    path: workspacePath,
    content: z.string().describe("The file's full new contents."),
  }),
  outputSchema: z.object({
    path: z.string(),
    created: z.boolean().describe("True if the file didn't exist before."),
    saved: z
      .boolean()
      .describe(
        "False if the file is open in the editor with the user's unsaved edits: the change is in the editor but not yet on disk, so commands won't see it.",
      ),
  }),
  needsApproval: true,
});
