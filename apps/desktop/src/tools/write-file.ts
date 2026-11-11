import { writeFileTool } from "@oscar/ai/tools";

import { recordFileChange } from "@/lib/ai/turn-changes";
import {
  createFileWithText,
  readCurrentText,
  resolveWorkspacePath,
  throwIfAborted,
  writeCurrentText,
} from "@/tools/workspace";

/** `content` with the line breaks of the file it replaces, if any. */
export const withFileLineBreaks = (content: string, currentText: string) =>
  currentText.includes("\r\n") ? content.replace(/\r?\n/g, "\r\n") : content;

export const writeFile = writeFileTool.client(
  async ({ path, content }, context) => {
    const target = resolveWorkspacePath(path);
    const current = await readCurrentText(target);
    throwIfAborted(context?.abortSignal);

    const change = { path: target.absolute, relativePath: target.relative };
    if (!current) {
      await createFileWithText(target, content);
      recordFileChange(context?.toolCallId, {
        ...change,
        before: null,
        after: content,
      });
      return { path: target.relative, created: true, saved: true };
    }

    // Keep the file's own line breaks.
    const text = withFileLineBreaks(content, current.text);
    const saved = await writeCurrentText(target, current, text);
    recordFileChange(context?.toolCallId, {
      ...change,
      before: current.text,
      after: text,
    });
    return { path: target.relative, created: false, saved };
  },
);
