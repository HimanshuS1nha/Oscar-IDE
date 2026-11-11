import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  Columns2Icon,
  RefreshCwIcon,
  Rows2Icon,
  SparklesIcon,
} from "lucide-react";
import type * as Monaco from "monaco-editor";
import { useEffect, useState } from "react";

import { MonacoDiffEditor, ToolbarButton } from "@/components/editor/diff-view";
import EditorMessage from "@/components/editor/editor-message";
import { Button } from "@/components/ui/button";

import { useChangeCount, useDiffLayout } from "@/hooks/use-diff-editor";
import type { OpenedFile } from "@/hooks/use-opened-files";
import {
  refreshProposal,
  respondToProposal,
  useProposedEdits,
} from "@/lib/ai/proposed-edits";

type ProposalTab = OpenedFile & {
  proposal: NonNullable<OpenedFile["proposal"]>;
};

/**
 * A change the AI proposes to a file, waiting for approval: the file as it
 * is now against the file after the change, both read-only. Approve and Deny
 * answer the call in the chat; the tab closes once it's answered.
 */
const ProposalView = ({ file }: { file: ProposalTab }) => {
  const { toolCallId } = file.proposal;
  const proposal = useProposedEdits((state) => state.proposals[toolCallId]);
  const [editor, setEditor] =
    useState<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const changeCount = useChangeCount(editor);
  const sideBySide = useDiffLayout((state) => state.sideBySide);
  const toggleLayout = useDiffLayout((state) => state.toggle);

  // The file may have changed since the proposal came in.
  useEffect(() => {
    void refreshProposal(toolCallId);
  }, [toolCallId]);

  const preview = proposal?.preview;
  const canNavigate = !!editor && !!changeCount;
  const canRespond = !!proposal && !proposal.isBusy;

  let body;
  if (!proposal) {
    body = <EditorMessage title="This change was already answered" />;
  } else if (preview?.status === "error") {
    body = (
      <EditorMessage
        title="This change can't be applied"
        detail={`${preview.message} Approving it will report this to the AI.`}
      />
    );
  } else if (preview?.status === "ready") {
    body = (
      <MonacoDiffEditor
        path={preview.path}
        original={preview.original}
        modified={preview.modified}
        editable={false}
        onEditorChange={setEditor}
      />
    );
  } else {
    body = <div className="min-h-0 flex-1" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="toolbar"
        aria-label="Proposed change"
        className="flex h-8 shrink-0 items-center gap-2 border-b bg-amber-500/5 px-3 text-xs text-muted-foreground"
      >
        <SparklesIcon className="size-3.5 shrink-0 text-amber-500" />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">
            {preview?.status === "ready" && preview.isNewFile
              ? "New file"
              : "Current"}
          </span>
          <ArrowRightIcon className="size-3 shrink-0" />
          <span className="truncate text-foreground">Proposed by AI</span>
        </span>
        {changeCount !== null && preview?.status === "ready" && (
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
            icon={RefreshCwIcon}
            label="Compare with the File Again"
            disabled={!proposal}
            onClick={() => void refreshProposal(toolCallId)}
          />
          <Button
            size="xs"
            variant="outline"
            className="ml-1.5"
            disabled={!canRespond}
            onClick={() => respondToProposal(toolCallId, false)}
          >
            Deny
          </Button>
          <Button
            size="xs"
            className="ml-1"
            disabled={!canRespond}
            onClick={() => respondToProposal(toolCallId, true)}
          >
            Approve
          </Button>
        </div>
      </div>

      {body}
    </div>
  );
};

export default ProposalView;
