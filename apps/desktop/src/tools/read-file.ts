import { readFileTool } from "@oscar/ai/tools";

import { readCurrentText, resolveWorkspacePath } from "@/tools/workspace";

const DEFAULT_LIMIT = 2000;

/** Stop adding lines past this many characters, so a minified file can't flood the chat. */
const MAX_CHARS = 100_000;

/** Longer lines are cut; they're almost always minified or generated. */
const MAX_LINE_CHARS = 2000;

export const readFile = readFileTool.client(async ({ path, offset, limit }) => {
  const target = resolveWorkspacePath(path);
  const current = await readCurrentText(target);
  if (!current) throw new Error(`"${target.relative}" doesn't exist.`);

  const lines = current.text.split(/\r\n|\r|\n/);
  // A final line break ends the last line; it doesn't start another.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const totalLines = lines.length;
  const startLine = offset ?? 1;
  if (startLine > totalLines) {
    throw new Error(
      `"${target.relative}" has only ${totalLines} lines; offset ${startLine} is past its end.`,
    );
  }

  const last = Math.min(totalLines, startLine - 1 + (limit ?? DEFAULT_LIMIT));
  const read: string[] = [];
  let chars = 0;
  for (let index = startLine - 1; index < last; index++) {
    let line = lines[index];
    if (line.length > MAX_LINE_CHARS) {
      line = `${line.slice(0, MAX_LINE_CHARS)}… [line cut]`;
    }
    // Always return at least one line.
    if (read.length > 0 && chars + line.length > MAX_CHARS) break;
    read.push(line);
    chars += line.length + 1;
  }

  const endLine = startLine + read.length - 1;
  return {
    path: target.relative,
    content: read.join("\n"),
    startLine,
    endLine,
    totalLines,
    truncated: endLine < totalLines,
  };
});
