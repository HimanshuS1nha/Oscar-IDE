/**
 * Tool definitions for the AI: names, descriptions and input/output schemas.
 * They do nothing by themselves: call `.client(execute)` on a client tool in
 * the desktop app, or `.server(execute)` on a server tool in the API.
 */
import { bashTool } from "./bash";
import { destructiveCommandReason } from "./destructive-commands";
import { editFileTool } from "./edit-file";
import { findFilesTool } from "./find-files";
import { readFileTool } from "./read-file";
import { searchCodeTool } from "./search-code";
import { webFetchTool } from "./web-fetch";
import { webSearchTool } from "./web-search";
import { writeFileTool } from "./write-file";

export {
  bashTool,
  destructiveCommandReason,
  editFileTool,
  findFilesTool,
  readFileTool,
  searchCodeTool,
  webFetchTool,
  webSearchTool,
  writeFileTool,
};

/** Run in the desktop app, on the user's files. */
export const CLIENT_TOOLS = [
  readFileTool,
  writeFileTool,
  editFileTool,
  findFilesTool,
  searchCodeTool,
  bashTool,
] as const;

/**
 * The same tool without the approval step, for the chat's full access mode.
 * Apply it last: to a definition passed to `chat()` as is, or to the result
 * of `.client()` / `.server()`. Calling `.client()` on its result brings the
 * approval back, since that reads the original config.
 * The server and the app must agree: the server decides when a run pauses
 * for approval, and the app asks again for calls it takes over.
 */
export const withoutApproval = <TTool extends { needsApproval?: boolean }>(
  tool: TTool,
): TTool => ({ ...tool, needsApproval: false });

/** Run on the API server. */
export const SERVER_TOOLS = [webSearchTool, webFetchTool] as const;
