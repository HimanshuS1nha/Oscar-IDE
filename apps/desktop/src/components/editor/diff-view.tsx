import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  Columns2Icon,
  FileTextIcon,
  Rows2Icon,
  type LucideIcon,
} from "lucide-react";
import type * as Monaco from "monaco-editor";
import { useEffect, useRef, useState } from "react";

import EditorMessage from "@/components/editor/editor-message";
import { Button } from "@/components/ui/button";

import { formatBytes } from "@/helpers/format-bytes";
import { useCodeEditor } from "@/hooks/use-code-editor";
import { useChangeCount, useDiffLayout } from "@/hooks/use-diff-editor";
import { useOpenedFiles, type OpenedFile } from "@/hooks/use-opened-files";
import { useSettings } from "@/hooks/use-settings";
import { editorOptions } from "@/lib/editor-options";
import { hasDocument, syncFromDisk } from "@/lib/file-documents";
// Starts language server features (lib/lsp) with the first editor.
import "@/lib/lsp";
import { monaco } from "@/lib/monaco";
import { retainFileModel } from "@/lib/monaco-models";
import { MONACO_THEME, defineMonacoTheme } from "@/lib/monaco-theme";
import { baseName } from "@/lib/paths";
import { shortHash } from "@/lib/git-actions";
import { fileQuery } from "@/queries/file-query";
import { gitDiffQuery } from "@/queries/git-query";

type DiffTab = OpenedFile & { diff: NonNullable<OpenedFile["diff"]> };

/** The editor settings, minus the minimap, which would only repeat the overview ruler. */
const diffEditorOptions = (
  settings: Parameters<typeof editorOptions>[0],
): Monaco.editor.IDiffEditorOptions => ({
  ...editorOptions(settings),
  minimap: { enabled: false },
});

let nextModelId = 1;

/**
 * A URI for a read-only side of a diff. Its path keeps the file's extension,
 * so Monaco picks the language from it; the scheme and id keep it apart from
 * the file's own model and from other diffs of the same file.
 */
const diffModelUri = (path: string, side: "original" | "modified") =>
  monaco.Uri.file(path).with({
    scheme: "git-diff",
    query: `${side}-${nextModelId++}`,
  });

/**
 * Monaco's diff editor. Created directly rather than through
 * @monaco-editor/react, whose DiffEditor disposes the models before the
 * editor on unmount, which Monaco reports as an error.
 *
 * The left side is always read-only. With `editable`, the right side is the
 * file's own model (shared with its tab, see lib/file-documents), seeded with
 * `modified` if no tab has loaded it yet; edits there are the file's unsaved
 * edits and save like any other. Otherwise the right side is a read-only copy
 * of `modified`, replaced whenever it changes.
 */
export const MonacoDiffEditor = ({
  path,
  original,
  modified,
  editable,
  onEditorChange,
}: {
  path: string;
  original: string;
  modified: string;
  editable: boolean;
  onEditorChange: (editor: Monaco.editor.IStandaloneDiffEditor | null) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] =
    useState<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const sideBySide = useDiffLayout((state) => state.sideBySide);
  // Read when the editor is created, to seed a new file model; later changes
  // arrive through the effect below.
  const latestModified = useRef(modified);
  latestModified.current = modified;

  useEffect(() => {
    defineMonacoTheme(monaco);
    const diffEditor = monaco.editor.createDiffEditor(containerRef.current!, {
      ...diffEditorOptions(useSettings.getState().settings),
      theme: MONACO_THEME,
      readOnly: !editable,
      originalEditable: false,
      renderSideBySide: useDiffLayout.getState().sideBySide,
      // The toolbar's layout toggle decides, even in a narrow window.
      useInlineViewWhenSpaceIsLimited: false,
    });

    const originalModel = monaco.editor.createModel(
      "",
      undefined,
      diffModelUri(path, "original"),
    );
    let modifiedModel: Monaco.editor.ITextModel;
    let releaseModified: () => void;
    if (editable) {
      // Held until the editor is disposed, so closing the tab can't dispose it first.
      const release = retainFileModel(path);
      const uri = monaco.Uri.file(path);
      modifiedModel =
        monaco.editor.getModel(uri) ??
        monaco.editor.createModel(latestModified.current, undefined, uri);
      releaseModified = release;
    } else {
      modifiedModel = monaco.editor.createModel(
        "",
        undefined,
        diffModelUri(path, "modified"),
      );
      releaseModified = () => modifiedModel.dispose();
    }
    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    setEditor(diffEditor);

    // Edit → Copy and Find act on the right side.
    const modifiedEditor = diffEditor.getModifiedEditor();
    useCodeEditor.getState().setEditor(modifiedEditor);

    return () => {
      useCodeEditor.getState().clearEditor(modifiedEditor);
      setEditor(null);
      // The editor must let go of its models before they are disposed.
      diffEditor.dispose();
      originalModel.dispose();
      releaseModified();
    };
  }, [path, editable]);

  useEffect(() => onEditorChange(editor), [editor, onEditorChange]);

  // Refreshed contents replace the text in place, keeping the scroll position.
  // An editable right side is the file's model, which lib/file-documents
  // keeps in step with the disk without losing unsaved edits.
  useEffect(() => {
    const model = editor?.getModel();
    if (!model) return;
    if (model.original.getValue() !== original) {
      model.original.setValue(original);
    }
    if (!editable && model.modified.getValue() !== modified) {
      model.modified.setValue(modified);
    }
  }, [editor, original, modified, editable]);

  useEffect(() => {
    editor?.updateOptions({ renderSideBySide: sideBySide });
  }, [editor, sideBySide]);

  const settings = useSettings((state) => state.settings);
  useEffect(() => {
    editor?.updateOptions(diffEditorOptions(settings));
  }, [editor, settings]);

  return <div ref={containerRef} className="min-h-0 flex-1" />;
};

export const ToolbarButton = ({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Button
    variant="ghost"
    size="icon-xs"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  >
    <Icon />
  </Button>
);

/**
 * A Git diff of one file, with a toolbar above it. An unstaged diff's Working
 * Tree side edits the file itself, as in its own tab; a staged diff compares
 * HEAD with the index and is read-only.
 */
const DiffView = ({ file }: { file: DiffTab }) => {
  const { staged, originalPath, commit } = file.diff;
  const { data, error, isPending } = useQuery(
    gitDiffQuery({ path: file.path, staged, originalPath, commit }),
  );
  // Only an unstaged diff's right side is the file on disk.
  const showsDisk = !staged && !commit;
  // The file as the editor reads it (with its encoding), for the editable side.
  const fileContents = useQuery({
    ...fileQuery(file.path),
    enabled: showsDisk,
  });

  useEffect(() => {
    if (fileContents.data?.kind === "text") syncFromDisk(fileContents.data);
  }, [fileContents.data]);

  // A deleted file stays editable only while its text is still open elsewhere.
  const editable =
    showsDisk &&
    (fileContents.data?.kind === "text" ||
      (!!fileContents.error && hasDocument(file.path)));
  const [editor, setEditor] =
    useState<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const changeCount = useChangeCount(editor);
  const sideBySide = useDiffLayout((state) => state.sideBySide);
  const toggleLayout = useDiffLayout((state) => state.toggle);

  const renamedFrom = originalPath ? ` (${baseName(originalPath)})` : "";
  let originalLabel: string;
  let modifiedLabel: string;
  if (commit) {
    originalLabel = commit.parent
      ? `${shortHash(commit.parent)}${renamedFrom}`
      : commit.label
        ? "Empty (untracked file)"
        : "Empty (root commit)";
    modifiedLabel = commit.label ?? shortHash(commit.hash);
  } else if (staged) {
    originalLabel = `HEAD${renamedFrom}`;
    modifiedLabel = "Index";
  } else {
    originalLabel = "Index";
    modifiedLabel = "Working Tree";
  }
  const canNavigate = !!editor && !!changeCount;

  let body;
  if (isPending || (showsDisk && fileContents.isPending)) {
    body = <div className="min-h-0 flex-1" />;
  } else if (error) {
    body = (
      <EditorMessage title="Couldn't load the diff" detail={error.message} />
    );
  } else if (data.kind === "binary") {
    body = <EditorMessage title="Binary files can't be compared as text" />;
  } else if (data.kind === "too-large") {
    body = (
      <EditorMessage
        title="This file is too large to compare"
        detail={`${formatBytes(data.size)} (limit ${formatBytes(data.limit)})`}
      />
    );
  } else {
    body = (
      <MonacoDiffEditor
        path={file.path}
        original={data.original}
        modified={
          // Cached contents can exist even while the query is disabled.
          showsDisk && fileContents.data?.kind === "text"
            ? fileContents.data.content
            : data.modified
        }
        editable={editable}
        onEditorChange={setEditor}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="toolbar"
        aria-label="Diff"
        className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{originalLabel}</span>
          <ArrowRightIcon className="size-3 shrink-0" />
          <span className="truncate text-foreground">{modifiedLabel}</span>
        </span>
        {changeCount !== null && (
          <span className="shrink-0">
            ·{" "}
            {changeCount === 0
              ? "No changes"
              : `${changeCount} ${changeCount === 1 ? "change" : "changes"}`}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <ToolbarButton
            icon={ArrowUpIcon}
            label="Previous Change"
            disabled={!canNavigate}
            onClick={() => editor?.goToDiff("previous")}
          />
          <ToolbarButton
            icon={ArrowDownIcon}
            label="Next Change"
            disabled={!canNavigate}
            onClick={() => editor?.goToDiff("next")}
          />
          <ToolbarButton
            icon={sideBySide ? Rows2Icon : Columns2Icon}
            label={sideBySide ? "Show Inline" : "Show Side by Side"}
            onClick={toggleLayout}
          />
          <ToolbarButton
            icon={FileTextIcon}
            label="Open File"
            onClick={() =>
              useOpenedFiles.getState().addFile({
                name: file.name,
                path: file.path,
                isPermanent: true,
              })
            }
          />
        </div>
      </div>

      {body}
    </div>
  );
};

export default DiffView;
