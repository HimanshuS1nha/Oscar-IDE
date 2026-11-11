import z from "zod";

/** A file or folder the tools act on, as the model writes it. */
export const workspacePath = z
  .string()
  .min(1)
  .describe(
    "Path relative to the opened folder (e.g. src/index.ts), or an absolute path inside it.",
  );
