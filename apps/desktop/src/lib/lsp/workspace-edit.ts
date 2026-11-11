import type * as Monaco from "monaco-editor";
import type * as Lsp from "vscode-languageserver-protocol";

import { toMonacoRange } from "@/lib/lsp/convert";
import { editableModel, toFilePath } from "@/lib/lsp/files";
import { baseName, parentPath } from "@/lib/paths";

type Changes = {
  /** Text edits per document URI, in the order the server listed them. */
  edits: Map<string, Lsp.TextEdit[]>;
  creates: Lsp.CreateFile[];
  /** Renames and deletes, which the editor doesn't apply. */
  unsupported: (Lsp.RenameFile | Lsp.DeleteFile)[];
};

/**
 * LSP 3.18 snippet edits as plain text: placeholders keep their default
 * text, tab stops disappear. (Only the editor at the cursor could run them
 * as snippets.)
 */
const toPlainEdit = (
  edit: Lsp.TextEdit | Lsp.AnnotatedTextEdit | Lsp.SnippetTextEdit,
): Lsp.TextEdit =>
  "snippet" in edit
    ? {
        range: edit.range,
        newText: edit.snippet.value
          .replace(/\$\{\d+:([^}]*)\}/g, "$1")
          .replace(/\$\{\d+\}|\$\d+/g, "")
          .replace(/\\([$}\\])/g, "$1"),
      }
    : edit;

const collect = (edit: Lsp.WorkspaceEdit): Changes => {
  const changes: Changes = { edits: new Map(), creates: [], unsupported: [] };
  const add = (uri: string, edits: Lsp.TextEdit[]) =>
    changes.edits.set(uri, [...(changes.edits.get(uri) ?? []), ...edits]);

  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if (!("kind" in change)) {
        add(change.textDocument.uri, change.edits.map(toPlainEdit));
      } else if (change.kind === "create") changes.creates.push(change);
      else changes.unsupported.push(change);
    }
  } else if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) add(uri, edits);
  }
  return changes;
};

const createFiles = async (creates: Lsp.CreateFile[]) => {
  for (const create of creates) {
    const path = toFilePath(create.uri);
    try {
      await window.electron.file.createFile(parentPath(path), baseName(path));
    } catch (error) {
      // Already there is fine unless the server needed it new.
      if (!create.options?.ignoreIfExists && !create.options?.overwrite) {
        throw error;
      }
    }
  }
};

const openModels = async (uris: string[]) => {
  const models = await Promise.all(uris.map(editableModel));
  return new Map(uris.map((uri, index) => [uri, models[index]]));
};

/**
 * The server's edit as Monaco's, for providers whose result Monaco applies
 * itself (rename). Files without a model are opened first, since Monaco
 * can only edit models it has.
 */
export const toMonacoWorkspaceEdit = async (
  edit: Lsp.WorkspaceEdit,
): Promise<Monaco.languages.WorkspaceEdit> => {
  const changes = collect(edit);
  if (changes.unsupported.length > 0) {
    throw new Error("This change renames or deletes files, which isn't supported yet.");
  }
  await createFiles(changes.creates);
  const models = await openModels([...changes.edits.keys()]);

  return {
    edits: [...changes.edits].flatMap(([uri, edits]) =>
      edits.map((textEdit) => ({
        resource: models.get(uri)!.uri,
        textEdit: { range: toMonacoRange(textEdit.range), text: textEdit.newText },
        versionId: undefined,
      })),
    ),
  };
};

/**
 * Applies the server's edit (a quick fix, a refactoring, `workspace/applyEdit`)
 * as one undoable step per file. Resolves false if nothing could be applied.
 */
export const applyWorkspaceEdit = async (
  edit: Lsp.WorkspaceEdit,
): Promise<boolean> => {
  const changes = collect(edit);
  if (changes.unsupported.length > 0) {
    console.warn("Skipped a workspace edit that renames or deletes files", edit);
    return false;
  }
  try {
    await createFiles(changes.creates);
    const models = await openModels([...changes.edits.keys()]);
    for (const [uri, edits] of changes.edits) {
      const model = models.get(uri)!;
      model.pushStackElement();
      model.pushEditOperations(
        [],
        edits.map((textEdit) => ({
          range: toMonacoRange(textEdit.range),
          text: textEdit.newText,
        })),
        () => null,
      );
      model.pushStackElement();
    }
    return true;
  } catch (error) {
    console.error("Couldn't apply the language server's edit", error);
    return false;
  }
};
