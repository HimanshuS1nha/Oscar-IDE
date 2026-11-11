import { FileIcon } from "@react-symbols/icons/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  CloudUploadIcon,
  FileTextIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  LoaderCircleIcon,
  MinusIcon,
  PlusIcon,
  RotateCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import { Allotment, LayoutPriority, type AllotmentHandle } from "allotment";
import { useEffect, useRef, useState, type ReactNode } from "react";

import GitGraph, { GraphHeaderActions } from "@/components/sidebars/git-graph";
import { GitMoreMenu, StashGroup } from "@/components/sidebars/git-stashes";
import NoFolderState from "@/components/sidebars/no-folder-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { tabKey, useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useSettings } from "@/hooks/use-settings";
import { suggestCommitMessage } from "@/lib/ai/commit-message";
import {
  commitChanges,
  discardChanges,
  initRepository,
  openChange,
  openChangeDiff,
  pull,
  push,
  stageChanges,
  unstageChanges,
  useGitUi,
} from "@/lib/git-actions";
import { baseName } from "@/lib/paths";
import { queryClient } from "@/lib/query-client";
import { GIT_QUERY_ROOT, gitStatusQuery } from "@/queries/git-query";
import type {
  GitChange,
  GitChangeStatus,
  GitStatus,
} from "../../../electron/shared/git";

type Repo = Extract<GitStatus, { kind: "repo" }>;
type GroupKind = "conflicted" | "staged" | "unstaged";

const STATUS_STYLE: Record<
  GitChangeStatus,
  { letter: string; label: string; className: string }
> = {
  modified: { letter: "M", label: "Modified", className: "text-amber-400" },
  "type-changed": {
    letter: "T",
    label: "Type Changed",
    className: "text-amber-400",
  },
  added: { letter: "A", label: "Added", className: "text-emerald-400" },
  untracked: { letter: "U", label: "Untracked", className: "text-emerald-400" },
  deleted: { letter: "D", label: "Deleted", className: "text-red-400" },
  renamed: { letter: "R", label: "Renamed", className: "text-sky-400" },
  copied: { letter: "C", label: "Copied", className: "text-sky-400" },
  conflicted: { letter: "!", label: "Conflict", className: "text-rose-500" },
};

/** Folder part of a relative path, or "" at the top level. */
const dirName = (relativePath: string) => {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
};

const RowAction = ({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
  >
    <Icon className="size-3.5" />
  </button>
);

/** Hover actions, kept visible while a row or its buttons have focus. */
const actionsClassName =
  "hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex";

const ChangeRow = ({
  change,
  kind,
}: {
  change: GitChange;
  kind: GroupKind;
}) => {
  // Conflicts open the file to resolve its markers; other changes open a diff.
  const isConflict = kind === "conflicted";
  const open = (permanent: boolean) =>
    isConflict
      ? openChange(change, permanent)
      : openChangeDiff(change, kind === "staged", permanent);
  const rowTabKey = tabKey({
    path: change.path,
    diff: isConflict ? undefined : { staged: kind === "staged" },
  });
  const isFocused = useOpenedFiles(
    (state) => !!state.fileInFocus && tabKey(state.fileInFocus) === rowTabKey,
  );
  const name = baseName(change.path);
  const folder = dirName(change.relativePath);
  const style = STATUS_STYLE[change.status];
  const isDeleted = change.status === "deleted";
  const fromName = change.originalPath && baseName(change.originalPath);

  return (
    <div
      className={cn(
        "group flex h-6 items-center gap-1 pr-2 hover:bg-muted/60",
        isFocused && "bg-accent text-accent-foreground hover:bg-accent",
      )}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-6 text-left text-[13px] outline-none select-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        title={`${change.relativePath} • ${style.label}${
          fromName ? ` (from ${fromName})` : ""
        }`}
        // Single click previews, double click keeps the tab open (as in the explorer).
        onClick={() => open(false)}
        onDoubleClick={() => open(true)}
      >
        <FileIcon fileName={name} autoAssign className="size-4 shrink-0" />
        <span
          className={cn(
            "shrink-0",
            isDeleted && "text-muted-foreground line-through",
          )}
        >
          {name}
        </span>
        {folder && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {folder}
          </span>
        )}
      </button>

      <div className={actionsClassName}>
        {!isDeleted && (
          <RowAction
            icon={FileTextIcon}
            label="Open File"
            onClick={() => openChange(change, true)}
          />
        )}
        {kind === "unstaged" && (
          <RowAction
            icon={Undo2Icon}
            label="Discard Changes"
            onClick={() => void discardChanges([change])}
          />
        )}
        {kind === "staged" ? (
          <RowAction
            icon={MinusIcon}
            label="Unstage Changes"
            onClick={() => void unstageChanges([change])}
          />
        ) : (
          <RowAction
            icon={PlusIcon}
            label={kind === "conflicted" ? "Mark as Resolved" : "Stage Changes"}
            onClick={() => void stageChanges([change])}
          />
        )}
      </div>

      <span
        className={cn(
          "w-3 shrink-0 text-center font-mono text-xs font-semibold",
          style.className,
        )}
        title={style.label}
      >
        {style.letter}
      </span>
    </div>
  );
};

const GROUP_TITLES: Record<GroupKind, string> = {
  conflicted: "Merge Changes",
  staged: "Staged Changes",
  unstaged: "Changes",
};

const ChangeGroup = ({
  kind,
  changes,
}: {
  kind: GroupKind;
  changes: GitChange[];
}) => {
  const [isOpen, setIsOpen] = useState(true);
  if (changes.length === 0) return null;

  return (
    <div role="group" aria-label={GROUP_TITLES[kind]}>
      <div className="group flex h-6 items-center gap-1 pr-2 hover:bg-muted/60">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-1 text-left text-[11px] font-semibold tracking-wide uppercase outline-none select-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-100",
              isOpen && "rotate-90",
            )}
          />
          <span className="truncate">{GROUP_TITLES[kind]}</span>
        </button>

        <div className={actionsClassName}>
          {kind === "unstaged" && (
            <RowAction
              icon={Undo2Icon}
              label="Discard All Changes"
              onClick={() => void discardChanges(changes)}
            />
          )}
          {kind === "staged" ? (
            <RowAction
              icon={MinusIcon}
              label="Unstage All Changes"
              onClick={() => void unstageChanges(changes)}
            />
          ) : (
            <RowAction
              icon={PlusIcon}
              label={
                kind === "conflicted"
                  ? "Mark All as Resolved"
                  : "Stage All Changes"
              }
              onClick={() => void stageChanges(changes)}
            />
          )}
        </div>

        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
          {changes.length}
        </span>
      </div>

      {isOpen &&
        changes.map((change) => (
          <ChangeRow
            key={`${kind}:${change.path}`}
            change={change}
            kind={kind}
          />
        ))}
    </div>
  );
};

const BranchStatus = ({ repo }: { repo: Repo }) => {
  const label =
    repo.branch ??
    (repo.detachedAt ? `Detached at ${repo.detachedAt}` : "No branch");

  let sync: ReactNode = null;
  if (repo.upstream) {
    sync = (
      <span
        className="flex shrink-0 items-center gap-1.5 tabular-nums"
        title={`${repo.behind} to pull and ${repo.ahead} to push with ${repo.upstream}`}
      >
        <span className="flex items-center">
          <ArrowDownIcon className="size-3" />
          {repo.behind}
        </span>
        <span className="flex items-center">
          <ArrowUpIcon className="size-3" />
          {repo.ahead}
        </span>
      </span>
    );
  } else if (repo.branch && repo.hasRemotes) {
    sync = <span className="shrink-0">Not published</span>;
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2 text-xs text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1.5" title={label}>
        <GitBranchIcon className="size-3.5 shrink-0" />
        <span className="truncate text-foreground">{label}</span>
      </span>
      {sync}
    </div>
  );
};

const CommitBox = ({ repo }: { repo: Repo }) => {
  const commitMessage = useGitUi((state) => state.commitMessage);
  const setCommitMessage = useGitUi((state) => state.setCommitMessage);
  const running = useGitUi((state) => state.running);
  const suggesting = useGitUi((state) => state.suggestingMessage);
  const suggestions = useSettings((state) => state.settings.ai.commitMessages);

  const changeCount = repo.staged.length + repo.unstaged.length;
  const canCommit =
    !!commitMessage.trim() && changeCount > 0 && !running && !suggesting;
  const target = repo.branch ? ` on "${repo.branch}"` : "";

  return (
    <div className="flex flex-col gap-2 px-2 pb-3">
      <div className="relative">
        <textarea
          className={cn(
            "min-h-16 w-full resize-none rounded-md border border-input bg-input/30 px-2 py-1.5 text-[13px] leading-snug outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
            suggestions && "pr-8",
          )}
          rows={3}
          placeholder={
            suggesting ? "Writing a commit message…" : `Message (commit${target})`
          }
          aria-label="Commit message"
          spellCheck
          readOnly={suggesting}
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
        />
        {suggestions && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1 right-1 text-muted-foreground"
            disabled={changeCount === 0 && !suggesting}
            title={
              suggesting
                ? "Stop writing the commit message"
                : repo.staged.length > 0
                  ? "Suggest a commit message for the staged changes"
                  : "Suggest a commit message for all changes"
            }
            aria-label={
              suggesting ? "Stop suggesting" : "Suggest a commit message"
            }
            onClick={() => void suggestCommitMessage()}
          >
            {suggesting ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <SparklesIcon />
            )}
          </Button>
        )}
      </div>
      <Button
        size="sm"
        className="w-full"
        disabled={!canCommit}
        title={
          changeCount === 0
            ? "There are no changes to commit"
            : !commitMessage.trim()
              ? "Write a commit message first"
              : repo.staged.length === 0
                ? "Nothing is staged: you'll be asked to stage all changes"
                : undefined
        }
        onClick={() => void commitChanges()}
      >
        {running === "commit" ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <CheckIcon />
        )}
        Commit
      </Button>
    </div>
  );
};

const RepoView = ({ repo }: { repo: Repo }) => {
  const hasChanges =
    repo.conflicted.length + repo.staged.length + repo.unstaged.length > 0;

  return (
    <>
      <BranchStatus repo={repo} />
      <CommitBox repo={repo} />

      {hasChanges ? (
        <div className="flex flex-col">
          <ChangeGroup kind="conflicted" changes={repo.conflicted} />
          <ChangeGroup kind="staged" changes={repo.staged} />
          <ChangeGroup kind="unstaged" changes={repo.unstaged} />
        </div>
      ) : (
        <p className="flex items-center gap-1.5 px-3 text-xs text-muted-foreground">
          <GitCommitHorizontalIcon className="size-3.5 shrink-0" />
          No changes. The working tree is clean.
        </p>
      )}
      {repo.hasCommits && <StashGroup />}
    </>
  );
};

const Notice = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-4 px-5 py-10 text-center">
    <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/60 text-muted-foreground">
      <Icon className="size-6" strokeWidth={1.5} />
    </div>
    <div className="flex flex-col gap-1.5">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <p className="text-xs leading-relaxed break-words text-muted-foreground">
        {description}
      </p>
    </div>
    {children}
  </div>
);

const LoadingRows = () => (
  <div className="flex flex-col gap-2 px-3 py-1">
    <Skeleton className="h-3 w-24" />
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-7 w-full" />
    <Skeleton className="h-3 w-32" />
    <Skeleton className="h-3 w-28" />
  </div>
);

const HeaderButton = ({
  icon: Icon,
  label,
  isRunning,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isRunning?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Button
    variant="ghost"
    size="icon-xs"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  >
    {isRunning ? <LoaderCircleIcon className="animate-spin" /> : <Icon />}
  </Button>
);

/** Height of a section header; a collapsed Graph section is just its header. */
const SECTION_HEADER_HEIGHT = 24;
const MIN_GRAPH_HEIGHT = 120;
const MIN_CHANGES_HEIGHT = 80;

/**
 * Changes on top and the commit Graph below, split like VS Code's Source
 * Control view: drag the divider to resize, click the header to collapse.
 */
const ChangesAndGraph = ({ changes }: { changes: ReactNode }) => {
  const graphOpen = useGitUi((state) => state.graphOpen);
  const graphHeight = useGitUi((state) => state.graphHeight);
  const allotment = useRef<AllotmentHandle>(null);
  const container = useRef<HTMLDivElement>(null);

  // Opening restores the Graph's last height (it was shrunk to its header).
  useEffect(() => {
    const total = container.current?.clientHeight ?? 0;
    if (!graphOpen || !total) return;
    const height = Math.max(
      MIN_GRAPH_HEIGHT,
      Math.min(useGitUi.getState().graphHeight, total - MIN_CHANGES_HEIGHT),
    );
    allotment.current?.resize([total - height, height]);
  }, [graphOpen]);

  const toggle = () => useGitUi.setState({ graphOpen: !graphOpen });

  return (
    <div ref={container} className="min-h-0 flex-1">
      <Allotment
        ref={allotment}
        vertical
        proportionalLayout={false}
        // The Graph header's top border is the divider.
        separator={false}
        onChange={(sizes) => {
          const height = sizes[1];
          if (graphOpen && height >= MIN_GRAPH_HEIGHT) {
            useGitUi.setState({ graphHeight: height });
          }
        }}
      >
        {/* Takes the extra height when the window grows; the Graph keeps its own. */}
        <Allotment.Pane
          minSize={MIN_CHANGES_HEIGHT}
          priority={LayoutPriority.High}
        >
          <div className="h-full overflow-y-auto pb-4">{changes}</div>
        </Allotment.Pane>
        <Allotment.Pane
          minSize={graphOpen ? MIN_GRAPH_HEIGHT : SECTION_HEADER_HEIGHT}
          maxSize={graphOpen ? Number.POSITIVE_INFINITY : SECTION_HEADER_HEIGHT}
          preferredSize={graphOpen ? graphHeight : SECTION_HEADER_HEIGHT}
        >
          <section
            aria-label="Graph"
            className="flex h-full flex-col border-t"
          >
            <div className="group flex h-6 shrink-0 items-center gap-1 pr-2 hover:bg-muted/60">
              <button
                type="button"
                aria-expanded={graphOpen}
                onClick={toggle}
                className="flex h-full min-w-0 flex-1 items-center gap-1 pl-1 text-left text-[11px] font-semibold tracking-wide uppercase outline-none select-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <ChevronRightIcon
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-100",
                    graphOpen && "rotate-90",
                  )}
                />
                <span className="truncate">Graph</span>
              </button>
              {graphOpen && (
                <div className={actionsClassName}>
                  <GraphHeaderActions />
                </div>
              )}
            </div>
            {graphOpen && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <GitGraph />
              </div>
            )}
          </section>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
};

const GitSidebar = () => {
  const selectedFolderPath = useSelectedFolder(
    (state) => state.selectedFolderPath,
  );
  const { data, error, isPending } = useQuery(
    gitStatusQuery(selectedFolderPath),
  );
  // Status also refreshes in the background on every file change; only a
  // refresh the user asked for shows the spinner.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: GIT_QUERY_ROOT });
    } finally {
      setIsRefreshing(false);
    }
  };
  const running = useGitUi((state) => state.running);
  const repo = data?.kind === "repo" ? data : null;

  let body: ReactNode;
  if (!selectedFolderPath) {
    body = (
      <NoFolderState
        icon={GitBranchIcon}
        title="No folder open"
        description="Open a folder to see its Git changes and commit them."
      />
    );
  } else if (isPending) {
    body = <LoadingRows />;
  } else if (error) {
    body = (
      <Notice
        icon={TriangleAlertIcon}
        title="Couldn't read Git status"
        description={error.message}
      />
    );
  } else if (data.kind === "git-missing") {
    body = (
      <Notice
        icon={TriangleAlertIcon}
        title="Git isn't available"
        description="Install Git and make sure it's on your PATH, then refresh."
      />
    );
  } else if (data.kind === "no-repo") {
    body = (
      <Notice
        icon={GitBranchIcon}
        title="Not a Git repository"
        description="Initialize a repository in this folder to track changes and commit them."
      >
        <Button
          className="w-full"
          disabled={!!running}
          onClick={() => void initRepository()}
        >
          {running === "init" ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <GitBranchIcon />
          )}
          Initialize Repository
        </Button>
      </Notice>
    );
  } else {
    body = <RepoView repo={data} />;
  }

  const canPublish = !!repo?.branch && repo.hasRemotes && !repo.upstream;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-background pr-1 pl-3">
        <h2 className="truncate text-xs font-semibold tracking-wide uppercase">
          Source Control
        </h2>

        <div className="flex shrink-0 items-center">
          {repo && (
            <>
              <HeaderButton
                icon={ArrowDownToLineIcon}
                label={
                  repo.upstream
                    ? `Pull from ${repo.upstream}`
                    : "Pull (no upstream branch)"
                }
                isRunning={running === "pull"}
                disabled={!repo.upstream || !!running}
                onClick={() => void pull()}
              />
              <HeaderButton
                icon={canPublish ? CloudUploadIcon : ArrowUpFromLineIcon}
                label={
                  canPublish
                    ? "Publish Branch"
                    : repo.upstream
                      ? `Push to ${repo.upstream}`
                      : "Push (no remote)"
                }
                isRunning={running === "push"}
                disabled={(!repo.upstream && !canPublish) || !!running}
                onClick={() => void push()}
              />
            </>
          )}
          <HeaderButton
            icon={RotateCwIcon}
            label="Refresh"
            isRunning={isRefreshing}
            disabled={!selectedFolderPath || isRefreshing}
            onClick={() => void refresh()}
          />
          {repo?.hasCommits && (
            <GitMoreMenu
              hasChanges={repo.staged.length + repo.unstaged.length > 0}
            />
          )}
        </div>
      </div>

      {repo ? (
        <ChangesAndGraph changes={body} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">{body}</div>
      )}
    </div>
  );
};

export default GitSidebar;
