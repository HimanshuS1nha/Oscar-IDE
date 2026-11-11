import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BracesIcon,
  CloudUploadIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import {
  describeBlame,
  useCurrentBlame,
} from "@/components/editor/line-blame";
import { useCurrentTab } from "@/hooks/use-current-tab";
import { useEditorStatus, type EditorStatus } from "@/hooks/use-editor-status";
import { editsFile, useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useShowWorkspace } from "@/hooks/use-show-workspace";
import { useCodeEditor } from "@/hooks/use-code-editor";
import { push, shortHash, syncBranch, useGitUi } from "@/lib/git-actions";
import { useLanguageServers } from "@/lib/lsp/status";
import { formatDate } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { fileQuery } from "@/queries/file-query";
import { gitStatusQuery } from "@/queries/git-query";
import type { ServerLanguage } from "../../../electron/shared/language-server";

const itemClassName =
  "flex h-full shrink-0 items-center gap-1 px-2 whitespace-nowrap outline-none";

/** A status bar entry that does something when clicked. */
const StatusButton = ({ className, ...props }: ComponentProps<"button">) => (
  <button
    type="button"
    className={cn(
      itemClassName,
      "hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60",
      className,
    )}
    {...props}
  />
);

const StatusText = ({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) => (
  <span className={itemClassName} title={title}>
    {children}
  </span>
);

/** Branch and sync state of the opened folder's repository. */
const GitStatusItems = () => {
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const { data: status } = useQuery(gitStatusQuery(folder));
  const running = useGitUi((state) => state.running);
  const showWorkspace = useShowWorkspace();

  if (status?.kind !== "repo") return null;

  const branchLabel = status.branch ?? status.detachedAt ?? "HEAD";
  const showGit = async () => {
    await showWorkspace();
    useCurrentTab.getState().setCurrentTab("Git");
  };
  const isSyncing = running === "pull" || running === "push";

  let sync: ReactNode = null;
  if (status.branch && status.upstream) {
    const { ahead, behind } = status;
    const inSync = ahead === 0 && behind === 0;
    sync = (
      <StatusButton
        title={
          inSync
            ? `Up to date with ${status.upstream}`
            : `Sync with ${status.upstream}: ${behind} to pull, ${ahead} to push`
        }
        aria-label="Sync Changes"
        disabled={!!running || inSync}
        onClick={() => void syncBranch({ ahead, behind })}
      >
        {isSyncing ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
        {!inSync && (
          <span className="flex items-center gap-1 tabular-nums">
            {behind}
            <ArrowDownIcon className="-ml-0.5 size-3" />
            {ahead}
            <ArrowUpIcon className="-ml-0.5 size-3" />
          </span>
        )}
      </StatusButton>
    );
  } else if (status.branch && status.hasRemotes && status.hasCommits) {
    sync = (
      <StatusButton
        title="Publish Branch"
        aria-label="Publish Branch"
        disabled={!!running}
        onClick={() => void push()}
      >
        {isSyncing ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : (
          <CloudUploadIcon className="size-3.5" />
        )}
      </StatusButton>
    );
  }

  return (
    <>
      <StatusButton
        title={
          status.branch
            ? `Branch ${status.branch}`
            : `Detached at ${branchLabel}`
        }
        onClick={() => void showGit()}
      >
        <GitBranchIcon className="size-3.5" />
        <span className="max-w-48 truncate">{branchLabel}</span>
      </StatusButton>
      {sync}
    </>
  );
};

const describeCursor = (status: EditorStatus) => {
  const position = `Ln ${status.line}, Col ${status.column}`;
  if (status.cursorCount > 1) {
    return `${status.cursorCount} selections (${status.selectedChars} characters selected)`;
  }
  return status.selectedChars > 0
    ? `${position} (${status.selectedChars} selected)`
    : position;
};

/** The focused file's encoding, as the editor will save it. */
const useFocusedEncoding = () => {
  const file = useOpenedFiles((state) => state.fileInFocus);
  const path = file && editsFile(file) ? file.path : null;
  // Reads what the editor already loaded; never fetches by itself.
  const { data } = useQuery({ ...fileQuery(path ?? ""), enabled: false });
  if (!path || data?.kind !== "text") return null;
  return data.encoding === "utf-8-bom" ? "UTF-8 with BOM" : "UTF-8";
};

/** Cursor position and details of the file in the editor. */
const EditorStatusItems = () => {
  const status = useEditorStatus();
  const encoding = useFocusedEncoding();
  if (!status) return null;

  const goToLine = () => {
    const { editor } = useCodeEditor.getState();
    if (!editor) return;
    editor.focus();
    editor.trigger("status-bar", "editor.action.gotoLine", null);
  };

  return (
    <>
      <StatusButton title="Go to Line/Column" onClick={goToLine}>
        {describeCursor(status)}
      </StatusButton>
      <StatusText title="Indentation">
        {status.insertSpaces
          ? `Spaces: ${status.tabSize}`
          : `Tab Size: ${status.tabSize}`}
      </StatusText>
      {encoding && <StatusText title="Encoding">{encoding}</StatusText>}
      <StatusText title="End of Line Sequence">{status.eol}</StatusText>
      <StatusText title="Language">{status.languageName}</StatusText>
    </>
  );
};

/** Who last changed the cursor's line (see useLineBlame). */
const BlameItem = () => {
  const commit = useCurrentBlame((state) => state.commit);
  if (!commit) return null;
  const short = commit.uncommitted
    ? "You, uncommitted"
    : describeBlame(commit).split(" • ")[0];
  return (
    <StatusText
      title={
        commit.uncommitted
          ? "Uncommitted changes"
          : `${commit.summary}\n${commit.authorName} <${commit.authorEmail}>\n${formatDate(commit.date)} · ${shortHash(commit.hash)}`
      }
    >
      <GitCommitHorizontalIcon className="size-3.5" />
      <span className="max-w-56 truncate">{short}</span>
    </StatusText>
  );
};

/** Loaded on demand: the language server code comes with the editor. */
const restartServer = (language: ServerLanguage) =>
  void import("@/lib/lsp").then((lsp) => lsp.restartLanguageServer(language));

const SERVER_NAMES: Record<ServerLanguage, string> = {
  typescript: "TypeScript",
  python: "Python",
};

/** What a ready server runs, for its tooltip and label. */
const describeServer = (
  language: ServerLanguage,
  version: string | null,
  source: string | null,
) => {
  if (language === "typescript") {
    const where =
      source === "workspace"
        ? "this folder's TypeScript"
        : "the TypeScript bundled with Oscar";
    return {
      label: version ? `TS ${version}` : "TypeScript",
      description: version
        ? `TypeScript ${version}, from ${where}`
        : "TypeScript language server",
    };
  }
  const pyright = version ? `Pyright ${version}` : "Pyright";
  return {
    label: "Python",
    description: source
      ? `${pyright}, with the interpreter ${source}`
      : `${pyright}, with the python on your PATH`,
  };
};

/** A language server's state; clicking restarts it. */
const LanguageServerItem = ({ language }: { language: ServerLanguage }) => {
  const status = useLanguageServers((state) => state.status[language]);
  const name = SERVER_NAMES[language];
  const restart = () => restartServer(language);

  switch (status.state) {
    case "off":
      return null;
    case "starting":
      return (
        <StatusText title={`Starting the ${name} language server`}>
          <LoaderCircleIcon className="size-3.5 animate-spin" />
          {name}
        </StatusText>
      );
    case "failed":
      return (
        <StatusButton
          className="text-destructive"
          title={`The ${name} language server stopped: ${status.message}\nClick to restart it.`}
          onClick={restart}
        >
          <TriangleAlertIcon className="size-3.5" />
          {name}
        </StatusButton>
      );
    case "ready": {
      const { label, description } = describeServer(
        language,
        status.version,
        status.source,
      );
      return (
        <StatusButton
          title={`${status.progress ?? description}\nClick to restart the ${name} server.`}
          onClick={restart}
        >
          {status.progress ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <BracesIcon className="size-3.5" />
          )}
          {label}
        </StatusButton>
      );
    }
  }
};

/** The strip along the bottom of the window, as in VS Code. */
const StatusBar = () => (
  <footer
    aria-label="Status bar"
    className="flex h-6 shrink-0 items-stretch justify-between gap-2 overflow-hidden border-t bg-sidebar text-xs text-muted-foreground select-none"
  >
    <div className="flex min-w-0 items-stretch">
      <GitStatusItems />
      <BlameItem />
    </div>
    <div className="flex min-w-0 items-stretch overflow-hidden">
      <EditorStatusItems />
      <LanguageServerItem language="typescript" />
      <LanguageServerItem language="python" />
    </div>
  </footer>
);

export default StatusBar;
