import { toolDefinition } from "@tanstack/ai";
import z from "zod";

/** Client tool: runs a shell command in the opened folder, after the user approves it. */
export const bashTool = toolDefinition({
  name: "bash",
  description:
    "Run a shell command in the user's opened folder, e.g. to list files, run tests, build, or use git. " +
    "Each call starts a new shell, so cd and variables don't carry over. Interactive commands aren't supported. " +
    "Prefer read_file, edit_file, find_files and search_code where they fit. The user approves each command.",
  inputSchema: z.object({
    command: z.string().min(1).describe("The command to run."),
    description: z
      .string()
      .describe("A few words saying what the command does, shown to the user."),
    cwd: z
      .string()
      .optional()
      .describe(
        "Folder to run it in, relative to the opened folder. Defaults to the opened folder.",
      ),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(600_000)
      .optional()
      .describe(
        "Stop the command after this long. Defaults to 120000 (2 minutes).",
      ),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z
      .number()
      .int()
      .nullable()
      .describe("Null if the command was stopped before it exited."),
    timedOut: z.boolean(),
    truncated: z
      .boolean()
      .describe("True if the output was too long and was cut."),
  }),
  needsApproval: true,
});
