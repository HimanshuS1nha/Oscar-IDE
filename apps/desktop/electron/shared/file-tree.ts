export type DirectoryEntry = {
  type: "file" | "directory";
  name: string;
  /** Absolute path, in the OS's native format. */
  path: string;
};

/** Result of reading one file. Content is only included for text files under the size limit. */
export type FileContents =
  | {
      kind: "text";
      path: string;
      size: number;
      /** A UTF-8 byte order mark was stripped from `content` and must be re-added on save. */
      encoding: TextEncoding;
      content: string;
      /** Modification time when read, used to detect edits made outside the app. */
      mtimeMs: number;
    }
  | { kind: "binary"; path: string; size: number }
  | {
      kind: "too-large";
      path: string;
      size: number;
      limit: number;
      /** The file is under the hard limit, so it can be read with `allowLarge`. */
      canOpenAnyway: boolean;
    };

export type ReadFileOptions = {
  /** Reads text files up to the hard limit instead of the usual one ("Open Anyway"). */
  allowLarge?: boolean;
};

/** Result of reading an image to preview it. */
export type ImageContents =
  | {
      kind: "image";
      path: string;
      size: number;
      mimeType: string;
      data: Uint8Array;
    }
  | { kind: "too-large"; path: string; size: number; limit: number };

/** Images the editor previews, by lowercase extension. SVG is text and opens as such. */
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

/** The MIME type of an image the editor can preview, or null for other files. */
export const imageMimeType = (filePath: string) => {
  const extension = /\.[^./\\]+$/.exec(filePath)?.[0].toLowerCase();
  if (!extension || !Object.hasOwn(IMAGE_MIME_TYPES, extension)) return null;
  return IMAGE_MIME_TYPES[extension];
};

export type TextEncoding = "utf-8" | "utf-8-bom";

export type WriteFileRequest = {
  path: string;
  content: string;
  encoding: TextEncoding;
  /**
   * `mtimeMs` of the version the edits are based on. If the file changed on
   * disk since, the user is asked before it is overwritten. Omit to skip the check.
   */
  expectedMtimeMs?: number;
};

export type WriteFileResult =
  | { status: "saved"; path: string; size: number; mtimeMs: number }
  /** The user chose not to overwrite, or dismissed the Save As dialog. */
  | { status: "cancelled" }
  /** Writing failed; the main process already showed the error. */
  | { status: "failed"; message: string };

/** Answer to "Do you want to save the changes…?". */
export type UnsavedChangesChoice = "save" | "discard" | "cancel";

export type DeleteEntryRequest = {
  path: string;
  type: DirectoryEntry["type"];
  /** How many open files inside it have unsaved edits, to warn they'll be lost. */
  unsavedFileCount: number;
};

export type DeleteEntryResult =
  | { status: "deleted"; movedToTrash: boolean }
  | { status: "cancelled" }
  /** Deleting failed; the main process already showed the error. */
  | { status: "failed"; message: string };
