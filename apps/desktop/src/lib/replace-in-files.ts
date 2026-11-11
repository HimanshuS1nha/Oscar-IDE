import type { editor } from "monaco-editor";

import { useSearch } from "@/hooks/use-search";
import { isDirty, saveFile } from "@/lib/file-documents";
import { monaco } from "@/lib/monaco";
import {
  replaceInText,
  type ReplaceFileRequest,
  type SearchQuery,
} from "../../electron/shared/search";

/**
 * Replace for the Search sidebar. Files open in the editor are changed
 * through their Monaco model, so Undo reverts the replacement and unsaved
 * edits are kept; other files are rewritten on disk by the main process.
 */

/**
 * Applies `next` to `model` as one undoable edit, touching only the lines that
 * changed so cursors and scroll stay put.
 */
export const applyToModel = (model: editor.ITextModel, next: string) => {
  const before = model.getLinesContent();
  // Swap in the text as is, so the model keeps its own line breaks.
  const after = next.split(/\r\n|\r|\n/);

  const edits: editor.IIdentifiedSingleEditOperation[] =
    after.length === before.length
      ? before.flatMap((line, index) =>
          line === after[index]
            ? []
            : [
                {
                  range: new monaco.Range(
                    index + 1,
                    1,
                    index + 1,
                    line.length + 1,
                  ),
                  text: after[index],
                },
              ],
        )
      : [{ range: model.getFullModelRange(), text: next }];

  model.pushStackElement();
  model.pushEditOperations([], edits, () => null);
  model.pushStackElement();
};

/** Replaces in an open file's model. Returns the number replaced, or null if it isn't open. */
const replaceInModel = async (
  file: ReplaceFileRequest,
  query: SearchQuery,
  replacement: string,
) => {
  const model = monaco.editor.getModel(monaco.Uri.file(file.path));
  if (!model) return null;

  const wasDirty = isDirty(file.path);
  const result = replaceInText(
    model.getValue(),
    query,
    replacement,
    file.matches,
  );
  if (result.count === 0) return 0;

  applyToModel(model, result.text);
  // A file without other edits is saved, like files that aren't open;
  // one with unsaved edits stays unsaved, so nothing is saved unasked.
  if (!wasDirty) await saveFile(file.path);
  return result.count;
};

/**
 * Replaces the current search's matches with its replacement text in
 * `files`: every match in each, or only the listed `matches`. Resolves to the
 * number of matches replaced.
 */
export const replaceInFiles = async (files: ReplaceFileRequest[]) => {
  const state = useSearch.getState();
  const query: SearchQuery = {
    query: state.query,
    isRegex: state.isRegex,
    matchCase: state.matchCase,
    wholeWord: state.wholeWord,
  };
  const { replacement } = state;

  let count = 0;
  const onDisk: ReplaceFileRequest[] = [];
  for (const file of files) {
    const replaced = await replaceInModel(file, query, replacement);
    if (replaced === null) onDisk.push(file);
    else count += replaced;
  }

  if (onDisk.length > 0) {
    const result = await window.electron.search.replace({
      ...query,
      replacement,
      files: onDisk,
    });
    count += result.replaced.reduce((sum, file) => sum + file.count, 0);
  }

  // Saved and written files refresh the results through the file watcher;
  // search again now so they update without waiting for it.
  void useSearch.getState().run();
  return count;
};

/** Replace All: asks first, then replaces every match in the results. */
export const replaceAllResults = async () => {
  const { files, replacement } = useSearch.getState();
  const matchCount = files.reduce((sum, file) => sum + file.matches.length, 0);
  if (matchCount === 0) return 0;

  const confirmed = await window.electron.search.confirmReplace({
    matchCount,
    fileCount: files.length,
    replacement,
  });
  if (!confirmed) return 0;
  return replaceInFiles(files.map((file) => ({ path: file.path })));
};
