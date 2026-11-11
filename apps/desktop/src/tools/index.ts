import { clientTools } from "@tanstack/ai-react";

import { withoutApproval } from "@oscar/ai/tools";

import { bash, fullAccessBash } from "@/tools/bash";
import { editFile } from "@/tools/edit-file";
import { findFiles } from "@/tools/find-files";
import { readFile } from "@/tools/read-file";
import { searchCode } from "@/tools/search-code";
import { writeFile } from "@/tools/write-file";

/**
 * The AI's tools that run in the app, on the opened folder, passed to
 * `useChat`. The definitions (names, descriptions, schemas, which need the
 * user's approval) are in `@oscar/ai/tools`; errors thrown here are sent to
 * the model as the tool's result.
 *
 * One array per access mode for the app's lifetime: `useChat` re-registers
 * tools whenever it gets a new one.
 */
export const CHAT_TOOLS = clientTools(
  readFile,
  writeFile,
  editFile,
  findFiles,
  searchCode,
  bash,
);

/**
 * For full access mode: the same tools, none of which ask through the chat.
 * The app checks too (for calls it takes over at the end of a run), not just
 * the server. Destructive commands still ask, in the app (`fullAccessBash`).
 */
export const FULL_ACCESS_CHAT_TOOLS = clientTools(
  readFile,
  withoutApproval(writeFile),
  withoutApproval(editFile),
  findFiles,
  searchCode,
  withoutApproval(fullAccessBash),
);
