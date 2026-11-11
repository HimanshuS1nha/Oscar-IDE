import type { editor } from "monaco-editor";

import type {
  FileContents,
  TextEncoding,
  WriteFileResult,
} from "../../electron/shared/file-tree";
import { useCodeEditor } from "@/hooks/use-code-editor";
import { useDirtyFiles } from "@/hooks/use-dirty-files";
import { useExplorerTree } from "@/hooks/use-explorer-tree";
import {
  editsFile,
  isFileTab,
  tabKey,
  useOpenedFiles,
  type OpenedFile,
} from "@/hooks/use-opened-files";
import { useSettings } from "@/hooks/use-settings";
import { monaco } from "@/lib/monaco";
import { fileModelPath } from "@/lib/monaco-models";
import { baseName, isSameOrInside, rebasePath } from "@/lib/paths";
import { queryClient } from "@/lib/query-client";
import { fileQuery } from "@/queries/file-query";

/**
 * Ties each open file's Monaco model (the text being edited) to the file on
 * disk: tracks unsaved edits, applies changes made outside the app, and saves.
 */

type TextFile = Extract<FileContents, { kind: "text" }>;

/** What the editor last loaded from, or saved to, disk. */
type DiskState = Pick<TextFile, "content" | "encoding" | "mtimeMs">;

const diskStates = new Map<string, DiskState>();
/** Model `alternativeVersionId` matching the disk; undoing back to it makes the file clean again. */
const savedVersions = new Map<string, number>();
/** Saves in flight, so a repeated Ctrl+S waits for the first instead of writing twice. */
const pendingSaves = new Map<string, Promise<boolean>>();

/** Set while disk contents are pushed into a model, so that edit doesn't count as the user's. */
let isApplyingDiskChange = false;

const savedListeners = new Set<(path: string) => void>();

/** Called with each file's path after its text was written to disk. Returns an unsubscribe function. */
export const onDidSaveFile = (listener: (path: string) => void) => {
  savedListeners.add(listener);
  return () => {
    savedListeners.delete(listener);
  };
};

type Formatter = (model: editor.ITextModel) => Promise<void>;
let backgroundFormatter: Formatter | null = null;

/**
 * Sets how format-on-save formats a file that isn't in the focused editor
 * (Monaco's Format Document only works on an editor). Set by the language
 * server (lib/lsp). Returns a function that unsets it.
 */
export const setBackgroundFormatter = (formatter: Formatter) => {
  backgroundFormatter = formatter;
  return () => {
    if (backgroundFormatter === formatter) backgroundFormatter = null;
  };
};

/**
 * With `formatOnSave`, formats the file with its language's formatter
 * before it's written. A formatter that fails doesn't stop the save.
 */
const formatBeforeSave = async (model: editor.ITextModel) => {
  if (!useSettings.getState().settings.editor.formatOnSave) return;
  try {
    const { editor: codeEditor } = useCodeEditor.getState();
    if (codeEditor?.getModel() === model) {
      const action = codeEditor.getAction("editor.action.formatDocument");
      if (action?.isSupported()) await action.run();
      return;
    }
    await backgroundFormatter?.(model);
  } catch (error) {
    console.error("Format on save failed", error);
  }
};

const getModel = (path: string) =>
  monaco.editor.getModel(monaco.Uri.parse(fileModelPath(path)));

export const isDirty = (path: string) =>
  !!useDirtyFiles.getState().dirtyPaths[path];

const updateDirty = (path: string, model: editor.ITextModel) => {
  const dirty = model.getAlternativeVersionId() !== savedVersions.get(path);
  useDirtyFiles.getState().setDirty(path, dirty);
  // Editing a preview tab keeps it, so the next preview can't discard the edits.
  if (dirty) useOpenedFiles.getState().makePermanent(path);
};

const markSaved = (
  path: string,
  model: editor.ITextModel,
  versionId: number,
) => {
  savedVersions.set(path, versionId);
  updateDirty(path, model);
};

// A model is created the first time a file's tab or unstaged diff is shown.
const onModelCreated = monaco.editor.onDidCreateModel((model) => {
  const uri = model.uri.toString();
  const file = useOpenedFiles
    .getState()
    .openedFiles.find((f) => editsFile(f) && fileModelPath(f.path) === uri);
  if (!file) return;

  const path = file.path;
  savedVersions.set(path, model.getAlternativeVersionId());

  const onChange = model.onDidChangeContent(() => {
    if (!isApplyingDiskChange) updateDirty(path, model);
  });
  model.onWillDispose(() => {
    onChange.dispose();
    savedVersions.delete(path);
    diskStates.delete(path);
    useDirtyFiles.getState().setDirty(path, false);
  });
});
import.meta.hot?.dispose(() => onModelCreated.dispose());

/**
 * Called with every fresh read of a file. Without unsaved edits the editor
 * takes on the disk contents (as an undoable edit); with them, the edits are
 * kept and saving will warn that the file changed on disk.
 */
export const syncFromDisk = (file: TextFile) => {
  const { path } = file;
  const disk: DiskState = {
    content: file.content,
    encoding: file.encoding,
    mtimeMs: file.mtimeMs,
  };
  const model = getModel(path);

  if (!model) {
    diskStates.set(path, disk);
    return;
  }

  if (model.getValue() === file.content) {
    diskStates.set(path, disk);
    markSaved(path, model, model.getAlternativeVersionId());
    return;
  }

  if (isDirty(path)) {
    // Keep the version the edits are based on, so the save can detect the conflict.
    if (!diskStates.has(path)) diskStates.set(path, disk);
    return;
  }

  isApplyingDiskChange = true;
  try {
    model.pushStackElement();
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: file.content }],
      () => null,
    );
    model.pushStackElement();
  } finally {
    isApplyingDiskChange = false;
  }
  diskStates.set(path, disk);
  markSaved(path, model, model.getAlternativeVersionId());
};

/** Records a completed write as the file's disk state and refreshes the query cache. */
const recordWrite = (
  result: Extract<WriteFileResult, { status: "saved" }>,
  content: string,
  encoding: TextEncoding,
) => {
  const saved: TextFile = {
    kind: "text",
    path: result.path,
    size: result.size,
    encoding,
    content,
    mtimeMs: result.mtimeMs,
  };
  diskStates.set(result.path, saved);
  queryClient.setQueryData(fileQuery(result.path).queryKey, saved);
  return saved;
};

const writeFile = async (path: string): Promise<boolean> => {
  const model = getModel(path);
  if (!model) return true; // Never shown, so never edited.

  // Unchanged text only needs writing if the file is gone from disk.
  const isMissingOnDisk =
    queryClient.getQueryState(fileQuery(path).queryKey)?.status === "error";
  if (!isDirty(path) && !isMissingOnDisk) return true;

  await formatBeforeSave(model);
  if (model.isDisposed()) return false;

  const disk = diskStates.get(path);
  const content = model.getValue();
  const encoding = disk?.encoding ?? "utf-8";
  const versionId = model.getAlternativeVersionId();

  const result = await window.electron.file.writeFile({
    path,
    content,
    encoding,
    expectedMtimeMs: disk?.mtimeMs,
  });
  if (result.status !== "saved") return false;

  recordWrite(result, content, encoding);
  // Typing during the save leaves the file dirty, as it should.
  if (!model.isDisposed()) markSaved(path, model, versionId);
  notifySaved(result.path);
  return true;
};

const notifySaved = (path: string) => {
  for (const listener of savedListeners) listener(path);
};

/** Saves one file's edits. Resolves false if it wasn't saved (cancelled or failed). */
export const saveFile = (path: string): Promise<boolean> => {
  const pending = pendingSaves.get(path);
  if (pending) return pending;

  const save = writeFile(path).finally(() => pendingSaves.delete(path));
  pendingSaves.set(path, save);
  return save;
};

/**
 * Saves a file's current text under a new name and moves its tab there. The
 * original file keeps what is on disk; its unsaved edits move to the new one.
 */
export const saveFileAs = async (path: string): Promise<boolean> => {
  const disk = diskStates.get(path);
  const content = getModel(path)?.getValue() ?? disk?.content;
  if (content === undefined) return false;

  const encoding = disk?.encoding ?? "utf-8";
  const result = await window.electron.file.saveFileAs({
    sourcePath: path,
    content,
    encoding,
  });
  if (result.status !== "saved") return false;

  const saved = recordWrite(result, content, encoding);

  if (result.path === path) {
    const model = getModel(path);
    if (model) markSaved(path, model, model.getAlternativeVersionId());
    notifySaved(path);
    return true;
  }

  // Disposes the old tab's model (and its edits, which now live in the new file).
  useOpenedFiles.getState().replaceFile(path, {
    name: baseName(result.path),
    path: result.path,
    isPermanent: true,
  });
  // The new path may already be open in another tab with older text.
  syncFromDisk(saved);
  useExplorerTree.getState().select({ path: result.path, type: "file" });
  return true;
};

/** Shows the native file picker and opens the chosen file in a permanent tab. */
export const openFileFromDisk = async () => {
  const path = await window.electron.file.openFile();
  if (!path) return;

  // Files outside the opened folder aren't watched, so a cached copy may be stale.
  void queryClient.invalidateQueries({
    queryKey: fileQuery(path).queryKey,
    exact: true,
  });
  useOpenedFiles
    .getState()
    .addFile({ name: baseName(path), path, isPermanent: true });
  useExplorerTree.getState().select({ path, type: "file" });
};

const focusedTab = () => useOpenedFiles.getState().fileInFocus;

/** Saves the focused file, or the file an unstaged diff tab edits. */
export const saveFocusedFile = () => {
  const file = focusedTab();
  return file && editsFile(file) ? saveFile(file.path) : Promise.resolve(false);
};

/** Save As moves the tab to the new file, so it only applies to file tabs. */
export const saveFocusedFileAs = () => {
  const file = focusedTab();
  return file && isFileTab(file)
    ? saveFileAs(file.path)
    : Promise.resolve(false);
};

/**
 * Asks whether to save the files `tabs` edit (only those with edits, once
 * each). Resolves true once they're saved or discarded, false if the user
 * cancels or a save fails.
 */
const resolveUnsavedChanges = async (tabs: OpenedFile[]) => {
  const dirty = [
    ...new Map(
      tabs
        .filter((file) => editsFile(file) && isDirty(file.path))
        .map((file) => [file.path, file]),
    ).values(),
  ];
  if (dirty.length === 0) return true;

  const choice = await window.electron.file.confirmUnsavedChanges(
    dirty.map((file) => file.name),
  );
  if (choice === "cancel") return false;
  if (choice === "discard") return true;

  for (const file of dirty) {
    if (!(await saveFile(file.path))) return false;
  }
  return true;
};

/**
 * Closes a tab, first asking to save its file if it has unsaved edits and no
 * other tab (its file tab or unstaged diff) still edits it.
 */
export const closeFile = async (file: OpenedFile) => {
  const isLastEditor = !useOpenedFiles
    .getState()
    .openedFiles.some(
      (other) =>
        editsFile(other) &&
        other.path === file.path &&
        tabKey(other) !== tabKey(file),
    );
  if (isLastEditor && !(await resolveUnsavedChanges([file]))) return false;
  useOpenedFiles.getState().removeFile(file);
  return true;
};

/** Asks to save every open file with unsaved edits, e.g. before the window closes. */
export const confirmCloseAll = () =>
  resolveUnsavedChanges(useOpenedFiles.getState().openedFiles);

/**
 * After `from` was renamed to `to` on disk: repoints every tab at or inside it
 * and carries each one's text and unsaved state over to its new path. (Undo
 * history doesn't survive: Monaco models can't change their URI.)
 */
export const moveDocuments = (from: string, to: string) => {
  const moved = useOpenedFiles
    .getState()
    .openedFiles.filter(
      (file) => editsFile(file) && isSameOrInside(file.path, from),
    )
    // A file and its unstaged diff share one model.
    .filter(
      (file, index, files) =>
        files.findIndex((other) => other.path === file.path) === index,
    )
    .flatMap((file) => {
      const model = getModel(file.path);
      if (!model) return [];
      return [
        {
          path: rebasePath(file.path, from, to),
          content: model.getValue(),
          dirty: isDirty(file.path),
          disk: diskStates.get(file.path),
        },
      ];
    });

  // Disposes the old paths' models.
  useOpenedFiles.getState().renamePaths(from, to);

  for (const doc of moved) {
    if (doc.disk) diskStates.set(doc.path, doc.disk);
    const uri = monaco.Uri.parse(fileModelPath(doc.path));
    // No language given: Monaco picks it from the new extension.
    const model =
      monaco.editor.getModel(uri) ??
      monaco.editor.createModel(doc.content, undefined, uri);
    // The new model starts out clean; keep unsaved edits marked unsaved.
    if (doc.dirty) {
      savedVersions.set(doc.path, -1);
      updateDirty(doc.path, model);
    }
  }
};

/** True if the editor holds text for `path`, even if the file can't be read any more. */
export const hasDocument = (path: string) => !!getModel(path);
