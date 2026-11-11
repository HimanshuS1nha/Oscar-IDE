import Editor from "@monaco-editor/react";
import { useQuery } from "@tanstack/react-query";
import type * as Monaco from "monaco-editor";
import { useEffect, useMemo, useState } from "react";

import ConflictBar from "@/components/editor/conflict-bar";
import EditorMessage from "@/components/editor/editor-message";
import ImagePreview from "@/components/editor/image-preview";
import { useLineBlame } from "@/components/editor/line-blame";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/helpers/format-bytes";

import { useCodeEditor } from "@/hooks/use-code-editor";
import { useEditorReveal } from "@/hooks/use-editor-reveal";
import { useSettings } from "@/hooks/use-settings";

import { hasDocument, syncFromDisk } from "@/lib/file-documents";
// Starts language server features (lib/lsp) with the first editor.
import "@/lib/lsp";
// Inline suggestions and "Add Selection to Chat".
import "@/lib/ai/editor-features";
import { fileModelPath } from "@/lib/monaco-models";
import { editorOptions } from "@/lib/editor-options";
import {
  LARGE_FILE_EDITOR_OPTIONS,
  isLargeModel,
  isLargeText,
} from "@/lib/large-files";
import { monaco } from "@/lib/monaco";
import { MONACO_THEME, defineMonacoTheme } from "@/lib/monaco-theme";

import { allowLargeFile, fileQuery } from "@/queries/file-query";

import { imageMimeType } from "../../../electron/shared/file-tree";

/** Selects and scrolls to `useEditorReveal`'s target once its file is showing. */
const useRevealTarget = (
  editor: Monaco.editor.IStandaloneCodeEditor | null,
) => {
  useEffect(() => {
    if (!editor) return;

    const apply = () => {
      const { target, done } = useEditorReveal.getState();
      const model = editor.getModel();
      if (!target || model?.uri.toString() !== fileModelPath(target.path)) {
        return;
      }
      // Results come from disk; unsaved edits may have moved the text.
      const range = model.validateRange({
        startLineNumber: target.line,
        startColumn: target.column,
        endLineNumber: target.line,
        endColumn: target.column + target.length,
      });
      editor.setSelection(range);
      editor.revealRangeInCenterIfOutsideViewport(range);
      if (target.focus) editor.focus();
      done(target.id);
    };

    apply();
    const unsubscribe = useEditorReveal.subscribe(apply);
    const modelListener = editor.onDidChangeModel(apply);
    return () => {
      unsubscribe();
      modelListener.dispose();
    };
  }, [editor]);
};

const MonacoEditor = ({
  path,
  initialContent,
}: {
  path: string;
  initialContent: string;
}) => {
  const [editor, setEditor] =
    useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  // Decided when the file opens: its model if it has one, else the text it starts with.
  const isLarge = useMemo(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(fileModelPath(path)));
    return model ? isLargeModel(model) : isLargeText(initialContent);
    // The initial content only matters for a new model, so only `path` counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useRevealTarget(editor);
  // Blaming sends the whole text to Git after every pause in typing.
  useLineBlame(isLarge ? null : editor, path);
  const settings = useSettings((state) => state.settings);
  // The component passes changed options on to the editor.
  const options = useMemo(
    () =>
      isLarge
        ? { ...editorOptions(settings), ...LARGE_FILE_EDITOR_OPTIONS }
        : editorOptions(settings),
    [settings, isLarge],
  );

  // Lets menus and other UI outside the editor act on it (see lib/editor-actions).
  useEffect(() => {
    if (!editor) return;
    useCodeEditor.getState().setEditor(editor);
    return () => useCodeEditor.getState().clearEditor(editor);
  }, [editor]);

  return (
    <div className="flex h-full flex-col">
      <ConflictBar editor={editor} path={path} />
      {isLarge && (
        <p className="border-b bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          This is a large file, so language features, Git blame, the minimap,
          folding and word wrap are off.
        </p>
      )}
      <div className="min-h-0 flex-1">
        <Editor
          onMount={setEditor}
          // One model per file: Monaco picks the language from the extension and
          // keeps each tab's text, undo history, scroll and cursor when switching.
          path={fileModelPath(path)}
          // Models live as long as their tab, not the editor: the editor unmounts
          // while a new file loads, and lib/monaco-models disposes closed tabs' models.
          keepCurrentModel
          // Only seeds a new model. Later disk changes go through `syncFromDisk`,
          // which keeps unsaved edits instead of overwriting them like `value` would.
          defaultValue={initialContent}
          theme={MONACO_THEME}
          beforeMount={defineMonacoTheme}
          loading={null}
          height="100%"
          options={options}
        />
      </div>
    </div>
  );
};

/** Edits one text file in Monaco. Saving lives in lib/file-documents. */
const TextEditor = ({ path }: { path: string }) => {
  const { data, error, isPending, isFetching, refetch } = useQuery(
    fileQuery(path),
  );

  useEffect(() => {
    if (data?.kind === "text") syncFromDisk(data);
  }, [data]);

  if (isPending) return <div className="min-h-0 flex-1" />;

  if (error) {
    // Deleted or unreadable on disk, but its text is still open: keep editing,
    // and saving writes it back.
    if (hasDocument(path)) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <p
            className="border-b bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
            title={error.message}
          >
            This file was deleted or can't be read from disk. Save to write it
            back.
          </p>
          <div className="min-h-0 flex-1">
            <MonacoEditor path={path} initialContent="" />
          </div>
        </div>
      );
    }
    return (
      <EditorMessage title="Couldn't open this file" detail={error.message} />
    );
  }

  if (data.kind === "binary") {
    return (
      <EditorMessage
        title="This file is binary and can't be shown as text"
        detail={formatBytes(data.size)}
      />
    );
  }

  if (data.kind === "too-large") {
    return (
      <EditorMessage
        title="This file is too large to open"
        detail={`${formatBytes(data.size)} (limit ${formatBytes(data.limit)})`}
        action={
          data.canOpenAnyway && (
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => {
                allowLargeFile(path);
                void refetch();
              }}
            >
              Open Anyway
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <MonacoEditor path={data.path} initialContent={data.content} />
    </div>
  );
};

/** Shows one file: images as a preview, anything else as text. */
const CodeEditor = ({ path }: { path: string }) =>
  imageMimeType(path) ? (
    <ImagePreview key={path} path={path} />
  ) : (
    <TextEditor path={path} />
  );

export default CodeEditor;
