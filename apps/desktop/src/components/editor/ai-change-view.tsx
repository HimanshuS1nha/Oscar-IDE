import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  Columns2Icon,
  Rows2Icon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";
import type * as Monaco from "monaco-editor";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { MonacoDiffEditor, ToolbarButton } from "@/components/editor/diff-view";
import EditorMessage from "@/components/editor/editor-message";
import { Button } from "@/components/ui/button";

import { useChangeCount, useDiffLayout } from "@/hooks/use-diff-editor";
import type { OpenedFile } from "@/hooks/use-opened-files";
import { undoTurnChanges, useTurnChanges } from "@/lib/ai/turn-changes";

type AiChangeTab = OpenedFile & {
  aiChange: NonNullable<OpenedFile["aiChange"]>;
};

/**
 * What one turn of the AI chat changed in a file: the file before the turn
 * against the file the turn left, both read-only. Undo puts it back.
 */
const AiChangeView = ({ file }: { file: AiChangeTab }) => {
  const { key } = file.aiChange;
  const change = useTurnChanges((state) => state.diffs[key]);
  const isUndone = useTurnChanges((state) => !!state.undone[key]);
  const [isUndoing, setIsUndoing] = useState(false);
  const [editor, setEditor] =
    useState<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const changeCount = useChangeCount(editor);
  const sideBySide = useDiffLayout((state) => state.sideBySide);
  const toggleLayout = useDiffLayout((state) => state.toggle);

  if (!change) {
    return <EditorMessage title="This change is no longer available" />;
  }

  const undo = async () => {
    setIsUndoing(true);
    try {
      const [turnId] = key.split("\n");
      const [skipped] = await undoTurnChanges(turnId!, [change]);
      if (skipped) toast.error(`Couldn't undo: ${skipped}`);
    } finally {
      setIsUndoing(false);
    }
  };

  const canNavigate = !!editor && !!changeCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="toolbar"
        aria-label="Change made by AI"
        className="flex h-8 shrink-0 items-center gap-2 border-b bg-primary/5 px-3 text-xs text-muted-foreground"
      >
        <SparklesIcon className="size-3.5 shrink-0 text-primary" />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">
            {change.before === null ? "New file" : "Before"}
          </span>
          <ArrowRightIcon className="size-3 shrink-0" />
          <span className="truncate text-foreground">Changed by AI</span>
        </span>
        <span className="shrink-0">
          ·{" "}
          <span className="text-green-600 dark:text-green-500">
            +{change.added}
          </span>{" "}
          <span className="text-destructive">−{change.removed}</span>
          {isUndone && " · Undone"}
        </span>

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
          <Button
            size="xs"
            variant="outline"
            className="ml-1.5"
            disabled={isUndone || isUndoing}
            title={
              change.before === null
                ? "Move the file to the trash"
                : "Put the file back how it was before the AI changed it"
            }
            onClick={() => void undo()}
          >
            <Undo2Icon />
            {isUndone ? "Undone" : "Undo"}
          </Button>
        </div>
      </div>

      <MonacoDiffEditor
        path={change.path}
        original={change.before ?? ""}
        modified={change.after}
        editable={false}
        onEditorChange={setEditor}
      />
    </div>
  );
};

export default AiChangeView;
