import {
  BrowserWindow,
  dialog,
  shell,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  DeleteEntryRequest,
  DeleteEntryResult,
  TextEncoding,
  UnsavedChangesChoice,
  WriteFileRequest,
  WriteFileResult,
} from "../shared/file-tree";
import { FileExplorer } from "./file-explorer";

/** Parents dialogs to the calling window so they are modal (a sheet on macOS). */
export const showMessageBox = (
  event: IpcMainInvokeEvent,
  options: MessageBoxOptions,
) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window
    ? dialog.showMessageBox(window, options)
    : dialog.showMessageBox(options);
};

let lastDialogDir: string | undefined;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const showSaveError = async (
  event: IpcMainInvokeEvent,
  filePath: string,
  error: unknown,
): Promise<WriteFileResult> => {
  const message = errorMessage(error);
  await showMessageBox(event, {
    type: "error",
    title: "Save Failed",
    message: `Couldn't save "${path.basename(filePath)}".`,
    detail: message,
    buttons: ["OK"],
  });
  return { status: "failed", message };
};

/** True if the file changed on disk after `expectedMtimeMs` and now holds something other than `content`. */
const changedOnDisk = async (
  target: string,
  expectedMtimeMs: number,
  content: string,
) => {
  let mtimeMs: number;
  try {
    mtimeMs = (await fs.stat(target)).mtimeMs;
  } catch {
    return false; // Deleted since: saving simply recreates it.
  }
  if (mtimeMs === expectedMtimeMs) return false;

  // Touched but identical (or already holding our edits): nothing to lose.
  return (await FileExplorer.readTextIfExists(target)) !== content;
};

export class FileOperations {
  /** Returns the chosen folder's absolute path, or null if cancelled. */
  static async openFolder(event: IpcMainInvokeEvent): Promise<string | null> {
    const options: OpenDialogOptions = {
      buttonLabel: "Open",
      title: "Open Folder",
      defaultPath: lastDialogDir,
      properties: ["openDirectory", "createDirectory"],
    };

    // Parent the dialog to the calling window so it is modal and stays on top
    // (a sheet on macOS) instead of opening as a free-floating window.
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) return null;

    const folderPath = result.filePaths[0];
    lastDialogDir = path.dirname(folderPath);
    await FileExplorer.openWorkspace(event.sender, folderPath);
    return folderPath;
  }

  /**
   * Returns the chosen file's absolute path, or null if cancelled. The window
   * may then read and save it, even if it's outside the opened folder.
   */
  static async openFile(event: IpcMainInvokeEvent): Promise<string | null> {
    const options: OpenDialogOptions = {
      buttonLabel: "Open",
      title: "Open File",
      defaultPath: FileExplorer.workspaceRoot(event.sender.id) ?? lastDialogDir,
      properties: ["openFile"],
    };
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = path.resolve(result.filePaths[0]);
    lastDialogDir = path.dirname(filePath);
    FileExplorer.allowFile(event.sender.id, filePath);
    return filePath;
  }

  /**
   * Saves a file inside the opened folder. If it was changed outside the app
   * since the editor loaded it, asks before overwriting.
   */
  static async writeFile(
    event: IpcMainInvokeEvent,
    request: WriteFileRequest,
  ): Promise<WriteFileResult> {
    try {
      const target = FileExplorer.resolveInWorkspace(event, request.path);

      if (
        request.expectedMtimeMs !== undefined &&
        (await changedOnDisk(target, request.expectedMtimeMs, request.content))
      ) {
        const { response } = await showMessageBox(event, {
          type: "warning",
          title: "File Changed on Disk",
          message: `"${path.basename(target)}" has changed on disk.`,
          detail:
            "It was modified outside the editor after you opened it. Overwrite it with your version?",
          buttons: ["Overwrite", "Cancel"],
          defaultId: 1,
          cancelId: 1,
        });
        if (response !== 0) return { status: "cancelled" };
      }

      const written = await FileExplorer.writeText(
        target,
        request.content,
        request.encoding,
      );
      return { status: "saved", path: target, ...written };
    } catch (error) {
      return showSaveError(event, request.path, error);
    }
  }

  /** Asks where to save `content`, then writes it there. */
  static async saveFileAs(
    event: IpcMainInvokeEvent,
    request: { sourcePath: string; content: string; encoding: TextEncoding },
  ): Promise<WriteFileResult> {
    const options: SaveDialogOptions = {
      title: "Save As",
      defaultPath: request.sourcePath,
      properties: ["createDirectory", "showOverwriteConfirmation"],
    };
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) return { status: "cancelled" };

    const target = path.resolve(result.filePath);
    lastDialogDir = path.dirname(target);
    try {
      // The user picked this path, so it may be opened even outside the folder.
      FileExplorer.allowFile(event.sender.id, target);
      const written = await FileExplorer.writeText(
        target,
        request.content,
        request.encoding,
      );
      return { status: "saved", path: target, ...written };
    } catch (error) {
      return showSaveError(event, target, error);
    }
  }

  /**
   * Confirms, then moves a file or folder to the trash. If the trash isn't
   * available (e.g. some Linux setups or network drives), offers to delete it
   * permanently instead.
   */
  static async deleteEntry(
    event: IpcMainInvokeEvent,
    request: DeleteEntryRequest,
  ): Promise<DeleteEntryResult> {
    let target: string;
    try {
      target = FileExplorer.resolveExistingEntry(event, request.path);
    } catch (error) {
      return { status: "failed", message: errorMessage(error) };
    }

    const name = path.basename(target);
    const isFolder = request.type === "directory";
    const unsaved =
      request.unsavedFileCount === 0
        ? ""
        : request.unsavedFileCount === 1
          ? "\n\nAn open file has unsaved changes that will be lost."
          : `\n\n${request.unsavedFileCount} open files have unsaved changes that will be lost.`;

    const { response } = await showMessageBox(event, {
      type: "warning",
      title: isFolder ? "Delete Folder" : "Delete File",
      message: isFolder
        ? `Are you sure you want to delete "${name}" and its contents?`
        : `Are you sure you want to delete "${name}"?`,
      detail: `You can restore it from the Trash.${unsaved}`,
      buttons: ["Move to Trash", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return { status: "cancelled" };

    try {
      await shell.trashItem(target);
      return { status: "deleted", movedToTrash: true };
    } catch (trashError) {
      const { response: permanently } = await showMessageBox(event, {
        type: "warning",
        title: isFolder ? "Delete Folder" : "Delete File",
        message: `Couldn't move "${name}" to the Trash. Delete it permanently?`,
        detail: `${errorMessage(trashError)}\n\nThis can't be undone.`,
        buttons: ["Delete Permanently", "Cancel"],
        defaultId: 1,
        cancelId: 1,
      });
      if (permanently !== 0) return { status: "cancelled" };
    }

    try {
      await fs.rm(target, { recursive: true, force: true });
      return { status: "deleted", movedToTrash: false };
    } catch (error) {
      const message = errorMessage(error);
      await showMessageBox(event, {
        type: "error",
        title: "Delete Failed",
        message: `Couldn't delete "${name}".`,
        detail: message,
        buttons: ["OK"],
      });
      return { status: "failed", message };
    }
  }

  /** "Do you want to save the changes you made to …?" for one or more files. */
  static async confirmUnsavedChanges(
    event: IpcMainInvokeEvent,
    fileNames: string[],
  ): Promise<UnsavedChangesChoice> {
    const single = fileNames.length === 1;
    const { response } = await showMessageBox(event, {
      type: "warning",
      title: "Unsaved Changes",
      message: single
        ? `Do you want to save the changes you made to "${fileNames[0]}"?`
        : `Do you want to save the changes to the following ${fileNames.length} files?`,
      detail: `${single ? "" : `${fileNames.join("\n")}\n\n`}Your changes will be lost if you don't save them.`,
      buttons: [single ? "Save" : "Save All", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
    });
    return (["save", "discard", "cancel"] as const)[response] ?? "cancel";
  }
}
