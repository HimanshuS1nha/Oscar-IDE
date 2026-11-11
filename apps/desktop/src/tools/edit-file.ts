import { editFileTool } from "@oscar/ai/tools";

import { recordFileChange } from "@/lib/ai/turn-changes";
import {
  readCurrentText,
  resolveWorkspacePath,
  throwIfAborted,
  writeCurrentText,
} from "@/tools/workspace";

const countOccurrences = (text: string, search: string) => {
  let count = 0;
  for (
    let index = text.indexOf(search);
    index !== -1;
    index = text.indexOf(search, index + search.length)
  ) {
    count++;
  }
  return count;
};

/** Models write `\n`; a file with Windows line breaks needs `\r\n` to match. */
const toFileLineBreaks = (text: string, fileText: string) =>
  fileText.includes("\r\n") ? text.replace(/\r?\n/g, "\r\n") : text;

/**
 * The text after an `edit_file` call, and how many places it changed. Throws
 * (which the model sees) if `oldString` isn't found exactly once, unless
 * `replaceAll`. Used by the tool and by the preview shown for approval.
 */
export const applyEdit = (
  text: string,
  {
    oldString,
    newString,
    replaceAll,
  }: { oldString: string; newString: string; replaceAll?: boolean },
  relativePath: string,
) => {
  let search = oldString;
  let replacement = newString;
  let count = countOccurrences(text, search);
  if (count === 0) {
    search = toFileLineBreaks(oldString, text);
    replacement = toFileLineBreaks(newString, text);
    count = search === oldString ? 0 : countOccurrences(text, search);
  }

  if (count === 0) {
    throw new Error(
      `oldString wasn't found in "${relativePath}". It must match exactly, including whitespace. Read the file again.`,
    );
  }
  if (count > 1 && !replaceAll) {
    throw new Error(
      `oldString appears ${count} times in "${relativePath}". Include more surrounding lines to make it unique, or set replaceAll.`,
    );
  }

  // split/join rather than replaceAll, which would treat `$&` in the text specially.
  const next = replaceAll
    ? text.split(search).join(replacement)
    : text.replace(search, () => replacement);
  return { text: next, count };
};

export const editFile = editFileTool.client(async (input, context) => {
  const target = resolveWorkspacePath(input.path);
  const current = await readCurrentText(target);
  if (!current) throw new Error(`"${target.relative}" doesn't exist.`);
  throwIfAborted(context?.abortSignal);

  const { text, count } = applyEdit(current.text, input, target.relative);
  const saved = await writeCurrentText(target, current, text);
  recordFileChange(context?.toolCallId, {
    path: target.absolute,
    relativePath: target.relative,
    before: current.text,
    after: text,
  });
  return { path: target.relative, replacements: count, saved };
});
