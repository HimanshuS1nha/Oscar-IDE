import { FileDiffIcon, FilePlusIcon, Undo2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";

import { summarizeChanges, type TurnFile } from "@/lib/ai/change-summary";
import {
  changeKey,
  openTurnChange,
  undoTurnChanges,
  useTurnChanges,
} from "@/lib/ai/turn-changes";
import { cn } from "@/lib/utils";

const LineCounts = ({ file }: { file: TurnFile }) => (
  <span className="shrink-0 font-mono tabular-nums">
    <span className="text-green-600 dark:text-green-500">+{file.added}</span>{" "}
    <span className="text-destructive">−{file.removed}</span>
  </span>
);

/**
 * What one turn of the chat changed in the opened folder, under its reply:
 * each file with its lines added and removed, opening a diff, and one undo
 * for them all. Nothing shows for a turn that changed no files.
 */
const TurnChanges = ({ toolCallIds }: { toolCallIds: string[] }) => {
  const recorded = useTurnChanges(
    useShallow((state) => toolCallIds.map((id) => state.changes[id])),
  );
  const files = useMemo(
    () => summarizeChanges(recorded.filter((change) => !!change)),
    [recorded],
  );
  // Named by its first tool call, which stays the same as the turn goes on.
  const turnId = toolCallIds[0] ?? "";
  const undone = useTurnChanges(
    useShallow((state) =>
      files.map((file) => !!state.undone[changeKey(turnId, file.path)]),
    ),
  );
  const [isUndoing, setIsUndoing] = useState(false);

  if (files.length === 0) return null;

  const allUndone = undone.every(Boolean);
  const undo = async (targets: TurnFile[]) => {
    setIsUndoing(true);
    try {
      const skipped = await undoTurnChanges(turnId, targets);
      if (skipped.length > 0) {
        toast.error(
          `Couldn't undo ${skipped.length === 1 ? "a change" : `${skipped.length} changes`}: ${skipped.join(" ")}`,
        );
      }
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="rounded-md border text-xs">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <span
          className="min-w-0 flex-1 truncate font-medium"
          title="Changes made by the AI's file tools in this reply. Changes made by commands it ran aren't listed."
        >
          Changed {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <Button
          size="xs"
          variant="outline"
          disabled={allUndone || isUndoing}
          title="Put every file back how it was before this reply. Files it created go to the trash."
          onClick={() => void undo(files)}
        >
          <Undo2Icon />
          {allUndone ? "Undone" : "Undo All"}
        </Button>
      </div>
      <ul>
        {files.map((file, index) => {
          const Icon = file.before === null ? FilePlusIcon : FileDiffIcon;
          return (
            <li
              key={file.path}
              className={cn(
                "group flex items-center gap-1 px-1 py-0.5",
                undone[index] && "opacity-50",
              )}
            >
              <Button
                variant="ghost"
                size="xs"
                className="min-w-0 flex-1 justify-start gap-1.5 font-normal"
                title={`Show what changed in ${file.relativePath}`}
                onClick={() => openTurnChange(turnId, file)}
              >
                <Icon className="text-muted-foreground" />
                <span
                  className={cn("truncate", undone[index] && "line-through")}
                >
                  {file.relativePath}
                </span>
              </Button>
              <LineCounts file={file} />
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
                title={`Undo the change to ${file.relativePath}`}
                aria-label={`Undo the change to ${file.relativePath}`}
                disabled={undone[index] || isUndoing}
                onClick={() => void undo([file])}
              >
                <Undo2Icon />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default TurnChanges;
