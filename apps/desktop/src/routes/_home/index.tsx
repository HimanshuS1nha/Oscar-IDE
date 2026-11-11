import { createFileRoute } from "@tanstack/react-router";

import AiChangeView from "@/components/editor/ai-change-view";
import CodeEditor from "@/components/editor/code-editor";
import DiffView from "@/components/editor/diff-view";
import ProposalView from "@/components/editor/proposal-view";

import { tabKey, useOpenedFiles } from "@/hooks/use-opened-files";

import oscarLogo from "@/assets/oscar.png";

export const Route = createFileRoute("/_home/")({
  component: Index,
});

function Index() {
  const fileInFocus = useOpenedFiles((state) => state.fileInFocus);

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {fileInFocus?.proposal ? (
        <ProposalView
          key={tabKey(fileInFocus)}
          file={{ ...fileInFocus, proposal: fileInFocus.proposal }}
        />
      ) : fileInFocus?.aiChange ? (
        <AiChangeView
          key={tabKey(fileInFocus)}
          file={{ ...fileInFocus, aiChange: fileInFocus.aiChange }}
        />
      ) : fileInFocus?.diff ? (
        // Keyed so each diff tab gets its own editor and models.
        <DiffView
          key={tabKey(fileInFocus)}
          file={{ ...fileInFocus, diff: fileInFocus.diff }}
        />
      ) : fileInFocus ? (
        <CodeEditor path={fileInFocus.path} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
          <img
            src={oscarLogo}
            alt=""
            draggable={false}
            className="size-24 opacity-20 grayscale select-none"
          />
          Open a file from the explorer
        </div>
      )}
    </div>
  );
}
