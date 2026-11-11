import { monaco } from "@/lib/monaco";

import { editsFile, useOpenedFiles } from "@/hooks/use-opened-files";

/** The model path (a `file://` URI) used for a file on disk. */
export const fileModelPath = (filePath: string) =>
  monaco.Uri.file(filePath).toString();

/** File models a mounted diff editor still shows, with how many hold each. */
const retained = new Map<string, number>();

const isEditedByATab = (path: string) =>
  useOpenedFiles
    .getState()
    .openedFiles.some((file) => editsFile(file) && file.path === path);

const disposeFileModel = (path: string) =>
  monaco.editor.getModel(monaco.Uri.file(path))?.dispose();

/**
 * Keeps a file's model alive while a diff editor shows it. Monaco's diff
 * editor reports an error if its model is disposed before the editor lets go
 * of it, and closing a tab disposes the model before React unmounts the
 * editor. The returned function releases the model, disposing it if no tab
 * edits the file any more; call it after disposing the diff editor.
 */
export const retainFileModel = (path: string) => {
  retained.set(path, (retained.get(path) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (retained.get(path) ?? 1) - 1;
    if (count > 0) {
      retained.set(path, count);
      return;
    }
    retained.delete(path);
    if (!isEditedByATab(path)) disposeFileModel(path);
  };
};

/**
 * Each file open for editing has one Monaco model (its text, undo history and
 * language), shared by its tab and its unstaged diff tab. Editors keep models
 * alive across tab switches, so dispose a model as soon as no tab edits its
 * file, including when a preview tab is replaced or the folder changes and
 * every tab closes.
 */
const disposeClosedFileModels = () =>
  useOpenedFiles.subscribe((state, previous) => {
    if (state.openedFiles === previous.openedFiles) return;

    const stillOpen = new Set(
      state.openedFiles.filter(editsFile).map((file) => file.path),
    );
    for (const file of previous.openedFiles.filter(editsFile)) {
      if (stillOpen.has(file.path) || retained.has(file.path)) continue;
      disposeFileModel(file.path);
    }
  });

// Runs once, the first time the editor code loads; models can't exist before then.
const unsubscribe = disposeClosedFileModels();
import.meta.hot?.dispose(unsubscribe);
