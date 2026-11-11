import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type * as Monaco from "monaco-editor";
import { useEffect, useState } from "react";
import { create } from "zustand";

import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { shortHash, useGitUi } from "@/lib/git-actions";
import { monaco } from "@/lib/monaco";
import { formatDate, formatRelative } from "@/lib/relative-time";
import { gitBlameQuery } from "@/queries/git-query";
import type { GitBlameCommit } from "../../../electron/shared/git";

/** Waits for typing to pause before blaming the new text. */
const BLAME_DELAY_MS = 500;

/** The cursor line's blame, for the status bar. */
export const useCurrentBlame = create<{ commit: GitBlameCommit | null }>(
  () => ({ commit: null }),
);

/** "Ada Lovelace, 3 days ago • Fix crash on start" */
export const describeBlame = (commit: GitBlameCommit) =>
  commit.uncommitted
    ? "You • Uncommitted changes"
    : `${commit.authorName}, ${formatRelative(commit.date)} • ${commit.summary}`;

/** The widget's tooltip: the whole commit. */
const blameTitle = (commit: GitBlameCommit) =>
  commit.uncommitted
    ? "Uncommitted changes"
    : `${commit.authorName} <${commit.authorEmail}>\n${formatRelative(commit.date)} (${formatDate(commit.date)})\n\n${commit.summary}\n\n${shortHash(commit.hash)}`;

/** The editor's text version, once typing has paused. */
const useSettledVersion = (editor: Monaco.editor.ICodeEditor | null) => {
  const [version, setVersion] = useState<{
    model: Monaco.editor.ITextModel;
    id: number;
  } | null>(null);

  useEffect(() => {
    if (!editor) {
      setVersion(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      const model = editor.getModel();
      setVersion(model ? { model, id: model.getAlternativeVersionId() } : null);
    };
    settle();
    const disposables = [
      editor.onDidChangeModel(settle),
      editor.onDidChangeModelContent(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(settle, BLAME_DELAY_MS);
      }),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      disposables.forEach((disposable) => disposable.dispose());
    };
  }, [editor]);

  return version;
};

/**
 * Shows who last changed the cursor's line, faded after its text, as VS
 * Code's inline blame does; the status bar shows it too. Blames the editor's
 * text, so unsaved edits line up and show as uncommitted.
 */
export const useLineBlame = (
  /** Null while there's nothing to blame. */
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  path: string,
) => {
  const enabled = useGitUi((state) => state.blameEnabled);
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const version = useSettledVersion(editor);
  const { data, isPlaceholderData } = useQuery({
    ...gitBlameQuery(path, version?.id ?? 0, () => version!.model.getValue()),
    enabled: enabled && !!folder && !!version,
    placeholderData: keepPreviousData,
  });
  const [line, setLine] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const selection = editor.getSelection();
      // Like VS Code: only for a plain cursor, not a selection.
      setLine(
        selection && selection.isEmpty() ? selection.positionLineNumber : null,
      );
    };
    update();
    const disposables = [
      editor.onDidChangeCursorSelection(update),
      editor.onDidChangeModel(update),
    ];
    return () => disposables.forEach((disposable) => disposable.dispose());
  }, [editor]);

  // Stale while edits wait to be blamed: the lines may have moved.
  const isCurrent =
    enabled &&
    !isPlaceholderData &&
    !!version &&
    editor?.getModel()?.getAlternativeVersionId() === version.id;
  const commit =
    isCurrent && data?.kind === "blame" && line !== null
      ? (data.commits[data.lines[line - 1]] ?? null)
      : null;

  useEffect(() => {
    useCurrentBlame.setState({ commit });
    return () => useCurrentBlame.setState({ commit: null });
  }, [commit]);

  useEffect(() => {
    const model = editor?.getModel();
    if (!editor || !model || !commit || line === null) return;
    // A content widget rather than an `after` decoration, whose injected text
    // this Monaco build doesn't draw.
    const node = document.createElement("span");
    node.className = "git-blame-inline";
    node.textContent = describeBlame(commit);
    node.title = blameTitle(commit);
    // Widgets sit outside the text, so they don't get the editor's font by themselves.
    const font = editor.getOption(monaco.editor.EditorOption.fontInfo);
    node.style.fontFamily = font.fontFamily;
    node.style.fontSize = `${font.fontSize}px`;
    node.style.lineHeight = `${font.lineHeight}px`;
    const widget: Monaco.editor.IContentWidget = {
      getId: () => "oscar.lineBlame",
      getDomNode: () => node,
      getPosition: () => ({
        position: { lineNumber: line, column: model.getLineMaxColumn(line) },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      }),
    };
    editor.addContentWidget(widget);
    // Typing at the end of the line moves where the line ends.
    const listener = editor.onDidChangeModelContent(() =>
      editor.layoutContentWidget(widget),
    );
    return () => {
      listener.dispose();
      editor.removeContentWidget(widget);
    };
  }, [editor, commit, line]);
};
