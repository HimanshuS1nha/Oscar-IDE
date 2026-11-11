import type { editor } from "monaco-editor";

import type { TextEncoding } from "../../electron/shared/file-tree";
import { editsFile, useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { isDirty, saveFile } from "@/lib/file-documents";
import { formatBytes } from "@/helpers/format-bytes";
import { ipcErrorMessage } from "@/lib/ipc-error";
import { monaco } from "@/lib/monaco";
import { isSameOrInside, joinRelative } from "@/lib/paths";
import { applyToModel } from "@/lib/replace-in-files";

/**
 * What the AI's file tools share: resolving the paths the model writes, and
 * reading and writing files the way the user sees them. A file open in the
 * editor is read and changed through its editor model, so the model sees
 * unsaved edits and the user can undo its changes.
 */

/** A path the model gave, resolved inside the opened folder. */
export type WorkspacePath = {
  /** Native absolute path, as the editor and main process use. */
  absolute: string;
  /** From the opened folder, with `/`; what the model is shown. Empty for the folder itself. */
  relative: string;
};

const isAbsolute = (path: string) => /^([\\/]|[a-zA-Z]:[\\/])/.test(path);

/** The opened folder. Throws (which the model sees) if none is open. */
export const openedFolder = () => {
  const root = useSelectedFolder.getState().selectedFolderPath;
  if (!root) {
    throw new Error(
      "No folder is open. Ask the user to open one with File > Open Folder.",
    );
  }
  return root;
};

/**
 * Resolves a relative or absolute path, removing `.` and `..`. Throws for
 * anything outside the opened folder (the main process refuses it as well).
 */
export const resolveWorkspacePath = (input: string): WorkspacePath => {
  const root = openedFolder().replace(/[\\/]+$/, "");
  const outside = new Error(`"${input}" is outside the opened folder.`);

  let rest = input.trim();
  if (isAbsolute(rest)) {
    if (!isSameOrInside(rest, root)) throw outside;
    rest = rest.slice(root.length);
  }

  const segments: string[] = [];
  for (const segment of rest.split(/[\\/]/)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.pop() === undefined) throw outside;
    } else {
      segments.push(segment);
    }
  }
  const relative = segments.join("/");
  return { absolute: relative ? joinRelative(root, relative) : root, relative };
};

/** The model of a file open in an editor tab, if it is. */
const openModel = (path: string) => {
  const isOpen = useOpenedFiles
    .getState()
    .openedFiles.some((file) => editsFile(file) && file.path === path);
  return isOpen ? monaco.editor.getModel(monaco.Uri.file(path)) : null;
};

/** A file's text as the user sees it, and where it came from. */
export type CurrentText =
  | { source: "editor"; text: string; model: editor.ITextModel }
  | {
      source: "disk";
      text: string;
      encoding: TextEncoding;
      mtimeMs: number;
    };

/**
 * Reads a text file: the editor's text if it's open (with unsaved edits),
 * else the file on disk. Resolves to null if it doesn't exist; throws for
 * folders, binary files and files too large to read.
 */
export const readCurrentText = async (
  path: WorkspacePath,
): Promise<CurrentText | null> => {
  const model = openModel(path.absolute);
  if (model) return { source: "editor", text: model.getValue(), model };

  let file;
  try {
    file = await window.electron.file.readFile(path.absolute);
  } catch (error) {
    const message = ipcErrorMessage(error);
    if (message.includes("ENOENT")) return null;
    if (message.includes("is not a file")) {
      throw new Error(`"${path.relative}" is a folder, not a file.`);
    }
    throw new Error(message);
  }

  if (file.kind === "binary") {
    throw new Error(`"${path.relative}" is a binary file.`);
  }
  if (file.kind === "too-large") {
    throw new Error(
      `"${path.relative}" is too large to read (${formatBytes(file.size)}).`,
    );
  }
  return {
    source: "disk",
    text: file.content,
    encoding: file.encoding,
    mtimeMs: file.mtimeMs,
  };
};

/**
 * Replaces a file's text. A file open in the editor changes there, as one
 * undoable edit, and is saved unless it had unsaved edits of the user's
 * (which would be saved with it); other files are written to disk. Resolves
 * to whether the new text is on disk.
 */
export const writeCurrentText = async (
  path: WorkspacePath,
  current: CurrentText,
  text: string,
) => {
  if (current.source === "editor") {
    if (current.model.isDisposed()) {
      throw new Error(
        `"${path.relative}" was closed while it was being changed.`,
      );
    }
    const hadUserEdits = isDirty(path.absolute);
    applyToModel(current.model, text);
    if (hadUserEdits) return false;
    return (await saveFile(path.absolute)) && !isDirty(path.absolute);
  }

  const result = await window.electron.file.writeFile({
    path: path.absolute,
    content: text,
    encoding: current.encoding,
    // Asks the user before overwriting changes made since it was read.
    expectedMtimeMs: current.mtimeMs,
  });
  if (result.status === "cancelled") {
    throw new Error(
      `"${path.relative}" changed on disk and the user chose not to overwrite it. Read it again.`,
    );
  }
  if (result.status === "failed") throw new Error(result.message);
  return true;
};

/**
 * Creates a file, and any missing folders, with `text`. Throws if something
 * already exists there.
 */
export const createFileWithText = async (path: WorkspacePath, text: string) => {
  if (!path.relative) throw new Error("A file path is needed.");
  let created: string;
  try {
    created = await window.electron.file.createFile(
      openedFolder(),
      path.relative,
    );
  } catch (error) {
    throw new Error(ipcErrorMessage(error));
  }
  if (!text) return;

  const result = await window.electron.file.writeFile({
    path: created,
    content: text,
    encoding: "utf-8",
  });
  if (result.status === "failed") throw new Error(result.message);
};

/** Throws if the run was stopped, so a stopped chat doesn't carry on. */
export const throwIfAborted = (signal: AbortSignal | undefined) => {
  if (signal?.aborted) throw new Error("Stopped by the user.");
};
