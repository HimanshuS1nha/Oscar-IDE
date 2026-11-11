import type * as Monaco from "monaco-editor";

import { useEditorReveal } from "@/hooks/use-editor-reveal";
import { useExplorerTree } from "@/hooks/use-explorer-tree";
import { useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { syncFromDisk } from "@/lib/file-documents";
import { monaco } from "@/lib/monaco";
import { baseName, isSameOrInside } from "@/lib/paths";
import { queryClient } from "@/lib/query-client";
import { fileQuery } from "@/queries/file-query";

/*
 * Files the language server points at: definitions and references in files
 * that may not be open, and edits (renames, quick fixes) to them.
 */

/**
 * Scheme of read-only copies of files that aren't open, so Monaco's peek
 * views and definition previews can show them. Monaco can only show text
 * it has a model for, and a `file:` model must belong to a tab (see
 * lib/file-documents), so these use their own scheme. Opening one (double
 * click in a peek view, Go to Definition) opens the real file in a tab.
 */
export const PREVIEW_SCHEME = "lsp-preview";

/** Previews kept around; the least recently used one not on screen goes first. */
const MAX_PREVIEWS = 40;
const previews = new Map<string, Monaco.editor.ITextModel>();

const root = () => useSelectedFolder.getState().selectedFolderPath;

/**
 * The native path of a `file:` (or preview) URI, spelled like the paths the
 * explorer uses. Windows drive letters come back lowercase from URIs.
 */
export const toFilePath = (uri: Monaco.Uri | string) => {
  const parsed = typeof uri === "string" ? monaco.Uri.parse(uri) : uri;
  let path = monaco.Uri.from({ scheme: "file", path: parsed.path }).fsPath;
  const folder = root();
  if (/^[a-z]:/.test(path) && folder && /^[A-Z]:/.test(folder)) {
    path = path[0].toUpperCase() + path.slice(1);
  }
  return path;
};

/**
 * Makes a file the server mentioned readable by the window. Files in the
 * opened folder (or picked with Open File) already are; others must be
 * declaration or source files in `node_modules` or the bundled TypeScript.
 */
const allowRead = async (path: string) => {
  const folder = root();
  if (folder && isSameOrInside(path, folder)) return true;
  return window.electron.languageServer.allowFile(path);
};

const readText = async (path: string) => {
  if (!(await allowRead(path))) return null;
  try {
    const contents = await queryClient.fetchQuery(fileQuery(path));
    return contents.kind === "text" ? contents : null;
  } catch {
    return null;
  }
};

const fileModel = (path: string) =>
  monaco.editor.getModel(monaco.Uri.file(path));

const trimPreviews = () => {
  for (const [key, model] of previews) {
    if (previews.size <= MAX_PREVIEWS) return;
    if (model.isAttachedToEditor()) continue;
    previews.delete(key);
    model.dispose();
  }
};

/**
 * A URI Monaco can show for `uri`: the file's own model if a tab has it
 * open, otherwise a read-only preview copy. Falls back to the `file:` URI
 * if the file can't be read.
 */
const showableUri = async (uri: string): Promise<Monaco.Uri> => {
  const path = toFilePath(uri);
  const model = fileModel(path);
  if (model) return model.uri;

  const fileUri = monaco.Uri.file(path);
  const contents = await readText(path);
  if (!contents) return fileUri;

  const previewUri = fileUri.with({ scheme: PREVIEW_SCHEME });
  const key = previewUri.toString();
  let preview = previews.get(key);
  if (preview && !preview.isDisposed()) {
    // Most recently used goes last.
    previews.delete(key);
    if (preview.getValue() !== contents.content) preview.setValue(contents.content);
  } else {
    // No language given: Monaco picks it from the extension.
    preview =
      monaco.editor.getModel(previewUri) ??
      monaco.editor.createModel(contents.content, undefined, previewUri);
  }
  previews.set(key, preview);
  trimPreviews();
  return preview.uri;
};

/** `showableUri` for each distinct URI, read in parallel. */
export const showableUris = async (uris: string[]) => {
  const unique = [...new Set(uris)];
  const resolved = await Promise.all(unique.map(showableUri));
  return new Map(unique.map((uri, index) => [uri, resolved[index]]));
};

export const disposePreviews = () => {
  for (const model of previews.values()) model.dispose();
  previews.clear();
};

/** Opens `path` in a permanent tab (as VS Code does for code navigation) and selects `range`. */
export const openFileAt = async (
  path: string,
  selection?: Monaco.IRange | Monaco.IPosition,
) => {
  if (!(await allowRead(path))) return false;

  useOpenedFiles
    .getState()
    .addFile({ name: baseName(path), path, isPermanent: true });
  const folder = root();
  if (folder && isSameOrInside(path, folder)) {
    useExplorerTree.getState().select({ path, type: "file" });
  }

  if (selection) {
    const isRange = "startLineNumber" in selection;
    const line = isRange ? selection.startLineNumber : selection.lineNumber;
    const column = isRange ? selection.startColumn : selection.column;
    const length =
      isRange && selection.endLineNumber === selection.startLineNumber
        ? selection.endColumn - selection.startColumn
        : 0;
    useEditorReveal
      .getState()
      .reveal({ path, line, column, length, focus: true });
  }
  return true;
};

/**
 * The model of a file a workspace edit changes. A file without one is
 * opened in a background tab, so the edit shows as an unsaved change the
 * user can review, save or undo, as with any other edit.
 */
export const editableModel = async (
  uri: string,
): Promise<Monaco.editor.ITextModel> => {
  const path = toFilePath(uri);
  const existing = fileModel(path);
  if (existing) return existing;

  const contents = await readText(path);
  if (!contents) throw new Error(`Can't edit ${path}: it can't be read`);

  const opened = useOpenedFiles.getState();
  const focused = opened.fileInFocus;
  // The tab must exist before the model: lib/file-documents only tracks
  // models that belong to a tab.
  opened.addFile({ name: baseName(path), path, isPermanent: true });
  if (focused) useOpenedFiles.getState().setFileInFocus(focused);

  const model =
    fileModel(path) ??
    monaco.editor.createModel(contents.content, undefined, monaco.Uri.file(path));
  // Records the disk state (encoding, mtime) so saving it works as usual.
  syncFromDisk(contents);
  return model;
};

/** Makes Go to Definition and links in hovers open files in tabs. */
export const registerOpeners = (): Monaco.IDisposable[] => [
  monaco.editor.registerEditorOpener({
    openCodeEditor: (_source, resource, selectionOrPosition) => {
      if (resource.scheme !== "file" && resource.scheme !== PREVIEW_SCHEME) {
        return false;
      }
      return openFileAt(toFilePath(resource), selectionOrPosition);
    },
  }),
  monaco.editor.registerLinkOpener({
    // Hovers link to declarations as `file:///path#L12,5`.
    open: (resource) => {
      if (resource.scheme !== "file") return false;
      const match = /^L(\d+)(?:,(\d+))?/.exec(resource.fragment);
      const position = match
        ? { lineNumber: Number(match[1]), column: Number(match[2] ?? 1) }
        : undefined;
      return openFileAt(toFilePath(resource.with({ fragment: "" })), position);
    },
  }),
];
