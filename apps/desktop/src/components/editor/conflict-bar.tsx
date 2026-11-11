import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  GitMergeIcon,
  LoaderCircleIcon,
} from "lucide-react";
import type * as Monaco from "monaco-editor";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { saveFile } from "@/lib/file-documents";
import { markResolved } from "@/lib/git-actions";
import {
  acceptAllConflicts,
  conflictDecorations,
  goToConflict,
  parseConflicts,
  registerConflictCodeLens,
  type MergeConflict,
} from "@/lib/merge-conflicts";
import { gitStatusQuery } from "@/queries/git-query";

registerConflictCodeLens();

/** The editor's merge conflicts, kept current as it changes, with their colors drawn in. */
const useConflicts = (editor: Monaco.editor.IStandaloneCodeEditor | null) => {
  const [conflicts, setConflicts] = useState<MergeConflict[]>([]);

  useEffect(() => {
    if (!editor) return;
    const decorations = editor.createDecorationsCollection();
    const update = () => {
      const model = editor.getModel();
      const found = model ? parseConflicts(model) : [];
      decorations.set(conflictDecorations(found));
      setConflicts(found);
    };
    update();
    const disposables = [
      editor.onDidChangeModel(update),
      editor.onDidChangeModelContent(update),
    ];
    return () => {
      disposables.forEach((disposable) => disposable.dispose());
      decorations.clear();
    };
  }, [editor]);

  return conflicts;
};

const BarButton = ({
  label,
  onClick,
  children,
}: {
  label?: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    variant="ghost"
    size="xs"
    title={label}
    aria-label={label}
    onClick={onClick}
    className="h-6 px-2 text-xs"
  >
    {children}
  </Button>
);

/**
 * Shown above a file with merge conflicts: how many are left, a way to step
 * through them, accept-all actions, and Mark as Resolved once none are left.
 */
const ConflictBar = ({
  editor,
  path,
}: {
  editor: Monaco.editor.IStandaloneCodeEditor | null;
  path: string;
}) => {
  const conflicts = useConflicts(editor);
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const { data: status } = useQuery(gitStatusQuery(folder));
  const [isResolving, setIsResolving] = useState(false);

  // Git still lists it as conflicted until it's staged.
  const isConflicted =
    status?.kind === "repo" &&
    status.conflicted.some((change) => change.path === path);
  if (conflicts.length === 0 && !isConflicted) return null;

  const resolve = async () => {
    setIsResolving(true);
    try {
      if (await saveFile(path)) await markResolved(path);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Merge conflicts"
      className="flex h-8 shrink-0 items-center gap-1 border-b bg-[color-mix(in_oklch,var(--merge-incoming)_10%,transparent)] px-3 text-xs"
    >
      <GitMergeIcon className="size-3.5 shrink-0 text-muted-foreground" />
      {conflicts.length > 0 ? (
        <>
          <span className="mr-1 shrink-0 font-medium">
            {conflicts.length} merge{" "}
            {conflicts.length === 1 ? "conflict" : "conflicts"}
          </span>
          <BarButton
            label="Previous Conflict"
            onClick={() => goToConflict("previous")}
          >
            <ArrowUpIcon />
          </BarButton>
          <BarButton label="Next Conflict" onClick={() => goToConflict("next")}>
            <ArrowDownIcon />
          </BarButton>
          <div className="ml-auto flex min-w-0 items-center gap-0.5 overflow-hidden">
            <BarButton onClick={() => acceptAllConflicts("current")}>
              <span
                className="size-2 shrink-0 rounded-full bg-(--merge-current)"
                aria-hidden
              />
              Accept All Current
            </BarButton>
            <BarButton onClick={() => acceptAllConflicts("incoming")}>
              <span
                className="size-2 shrink-0 rounded-full bg-(--merge-incoming)"
                aria-hidden
              />
              Accept All Incoming
            </BarButton>
            <BarButton onClick={() => acceptAllConflicts("both")}>
              Accept All Both
            </BarButton>
          </div>
        </>
      ) : (
        <>
          <span className="truncate text-muted-foreground">
            No conflict markers left. Save and stage the file to mark it as
            resolved.
          </span>
          <Button
            size="xs"
            className="ml-auto h-6 shrink-0 px-2 text-xs"
            disabled={isResolving}
            onClick={() => void resolve()}
          >
            {isResolving ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <CheckIcon />
            )}
            Mark as Resolved
          </Button>
        </>
      )}
    </div>
  );
};

export default ConflictBar;
