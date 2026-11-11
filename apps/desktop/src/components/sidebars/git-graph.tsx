import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { FileIcon } from "@react-symbols/icons/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CircleDotIcon,
  CloudIcon,
  CopyIcon,
  GitBranchIcon,
  GitForkIcon,
  LoaderCircleIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo, useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { tabKey, useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { openCommitFileDiff, shortHash, useGitUi } from "@/lib/git-actions";
import { layoutGraph, type GraphRow } from "@/lib/git-graph";
import { baseName } from "@/lib/paths";
import { formatDate, formatRelative } from "@/lib/relative-time";
import { gitCommitFilesQuery, gitLogQuery } from "@/queries/git-query";
import type {
  GitCommit,
  GitCommitFile,
  GitRef,
} from "../../../electron/shared/git";

const ROW_HEIGHT = 22;
const LANE_WIDTH = 12;
/** Wider graphs are cut off, so the messages stay readable. */
const MAX_LANES = 10;
const MIDDLE = ROW_HEIGHT / 2;

const laneColor = (color: number) => `var(--git-graph-${color})`;
const laneX = (column: number) => LANE_WIDTH / 2 + column * LANE_WIDTH;

const STATUS_STYLE: Record<
  GitCommitFile["status"],
  { letter: string; label: string; className: string }
> = {
  modified: { letter: "M", label: "Modified", className: "text-amber-400" },
  "type-changed": {
    letter: "T",
    label: "Type Changed",
    className: "text-amber-400",
  },
  added: { letter: "A", label: "Added", className: "text-emerald-400" },
  deleted: { letter: "D", label: "Deleted", className: "text-red-400" },
  renamed: { letter: "R", label: "Renamed", className: "text-sky-400" },
  copied: { letter: "C", label: "Copied", className: "text-sky-400" },
};

/* ---------------------------------- Graph --------------------------------- */

const segmentPath = ({
  fromColumn,
  fromY,
  toColumn,
  toY,
}: GraphRow["segments"][number]) => {
  const x1 = laneX(fromColumn);
  const x2 = laneX(toColumn);
  const y1 = fromY === "top" ? 0 : MIDDLE;
  const y2 = toY === "bottom" ? ROW_HEIGHT : MIDDLE;
  if (x1 === x2) return `M ${x1} ${y1} V ${y2}`;
  const yMid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${yMid}, ${x2} ${yMid}, ${x2} ${y2}`;
};

/** A commit's slice of the graph: its lines and its dot. */
const GraphCell = ({
  row,
  width,
  isHead,
  isMerge,
}: {
  row: GraphRow;
  width: number;
  isHead: boolean;
  isMerge: boolean;
}) => {
  const cx = laneX(row.column);
  const color = laneColor(row.color);
  return (
    <svg
      width={width * LANE_WIDTH}
      height={ROW_HEIGHT}
      className="ml-1 shrink-0 overflow-hidden"
      aria-hidden
    >
      {row.segments.map((segment, index) => (
        <path
          key={index}
          d={segmentPath(segment)}
          fill="none"
          stroke={laneColor(segment.color)}
          strokeWidth={1.5}
        />
      ))}
      {isHead ? (
        <>
          <circle cx={cx} cy={MIDDLE} r={5} fill="var(--background)" stroke={color} strokeWidth={2} />
          <circle cx={cx} cy={MIDDLE} r={2} fill={color} />
        </>
      ) : isMerge ? (
        <circle cx={cx} cy={MIDDLE} r={3.5} fill="var(--background)" stroke={color} strokeWidth={1.5} />
      ) : (
        <circle cx={cx} cy={MIDDLE} r={3.5} fill={color} stroke="var(--background)" strokeWidth={1} />
      )}
    </svg>
  );
};

/** Lanes passing by an expanded commit's file list. */
const LanesCell = ({
  lanes,
  width,
}: {
  lanes: (number | null)[];
  width: number;
}) => (
  <svg
    width={width * LANE_WIDTH}
    height={ROW_HEIGHT}
    className="ml-1 shrink-0 overflow-hidden"
    aria-hidden
  >
    {lanes.map((color, column) =>
      color === null ? null : (
        <path
          key={column}
          d={`M ${laneX(column)} 0 V ${ROW_HEIGHT}`}
          stroke={laneColor(color)}
          strokeWidth={1.5}
        />
      ),
    )}
  </svg>
);

/* ---------------------------------- Refs ---------------------------------- */

type Badge = { label: string; icons: LucideIcon[]; isHead: boolean };

/** Merges a local branch with its remote of the same name, as VS Code does: `main` ☁. */
const toBadges = (refs: GitRef[]): Badge[] => {
  const remotes = refs.filter((ref) => ref.kind === "remote");
  const merged = new Set<GitRef>();
  const badges: Badge[] = [];

  for (const ref of refs) {
    if (ref.kind === "remote" && merged.has(ref)) continue;
    if (ref.kind === "branch") {
      const remote = remotes.find(
        (r) => r.name.slice(r.name.indexOf("/") + 1) === ref.name,
      );
      if (remote) merged.add(remote);
      badges.push({
        label: ref.name,
        icons: remote ? [GitBranchIcon, CloudIcon] : [GitBranchIcon],
        isHead: ref.isHead,
      });
    } else {
      badges.push({
        label: ref.name,
        icons: [
          ref.kind === "remote"
            ? CloudIcon
            : ref.kind === "tag"
              ? TagIcon
              : CircleDotIcon,
        ],
        isHead: ref.isHead,
      });
    }
  }
  return badges;
};

const RefBadge = ({ badge, color }: { badge: Badge; color: number }) => (
  <span
    className={cn(
      "flex h-4 max-w-28 min-w-6 shrink items-center gap-1 rounded-full px-1.5 text-[11px] leading-none",
      badge.isHead ? "font-semibold" : "font-medium",
    )}
    style={{
      backgroundColor: laneColor(color),
      color: "var(--background)",
    }}
  >
    {badge.icons.map((Icon, index) => (
      <Icon key={index} className="size-3 shrink-0" strokeWidth={2.25} />
    ))}
    <span className="truncate">{badge.label}</span>
  </span>
);

/* --------------------------------- Hover ---------------------------------- */

const CommitDetails = ({ commit }: { commit: GitCommit }) => {
  const badges = toBadges(commit.refs);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="font-medium text-foreground">{commit.authorName}</span>
        {commit.authorEmail && <span>&lt;{commit.authorEmail}&gt;</span>}
      </div>
      <div className="text-muted-foreground">
        {formatRelative(commit.date)} ({formatDate(commit.date)})
      </div>
      <div className="font-medium break-words whitespace-pre-wrap text-foreground">
        {commit.subject}
      </div>
      {commit.body && (
        <div className="max-h-40 overflow-hidden break-words whitespace-pre-wrap text-muted-foreground">
          {commit.body}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
        <code className="font-mono text-muted-foreground">
          {shortHash(commit.hash)}
        </code>
        {badges.map((badge, index) => (
          <span
            key={`${index}:${badge.label}`}
            className="flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5"
          >
            {badge.icons.map((Icon, index) => (
              <Icon key={index} className="size-3" />
            ))}
            {badge.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/** VS Code-style hover card with the whole commit message. */
const CommitHover = ({
  commit,
  children,
}: {
  commit: GitCommit;
  children: ReactNode;
}) => (
  <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger delay={600} render={<div />}>
      {children}
    </TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side="right"
        align="start"
        sideOffset={8}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup className="w-80 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-lg outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0">
          <CommitDetails commit={commit} />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
);

/* ---------------------------------- Rows ---------------------------------- */

const dirName = (relativePath: string) => {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
};

const CommitFileRow = ({
  commit,
  file,
  row,
  width,
}: {
  commit: GitCommit;
  file: GitCommitFile;
  row: GraphRow;
  width: number;
}) => {
  const open = (permanent: boolean) =>
    openCommitFileDiff(commit, file, permanent);
  const rowTabKey = tabKey({
    path: file.path,
    diff: { staged: false, commit: { hash: commit.hash, parent: null } },
  });
  const isFocused = useOpenedFiles(
    (state) => !!state.fileInFocus && tabKey(state.fileInFocus) === rowTabKey,
  );
  const name = baseName(file.path);
  const folder = dirName(file.relativePath);
  const style = STATUS_STYLE[file.status];
  const fromName = file.originalPath && baseName(file.originalPath);

  return (
    <button
      type="button"
      role="treeitem"
      aria-level={2}
      className={cn(
        "flex h-[22px] w-full items-center gap-1.5 pr-2 text-left text-[13px] outline-none select-none hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        isFocused && "bg-accent text-accent-foreground hover:bg-accent",
      )}
      title={`${file.relativePath} • ${style.label}${fromName ? ` (from ${fromName})` : ""}`}
      onClick={() => open(false)}
      onDoubleClick={() => open(true)}
    >
      <LanesCell lanes={row.lanesBelow} width={width} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-3">
        <FileIcon fileName={name} autoAssign className="size-4 shrink-0" />
        <span
          className={cn(
            "shrink-0",
            file.status === "deleted" && "text-muted-foreground line-through",
          )}
        >
          {name}
        </span>
        {folder && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {folder}
          </span>
        )}
      </span>
      <span
        className={cn(
          "w-3 shrink-0 text-center font-mono text-xs font-semibold",
          style.className,
        )}
      >
        {style.letter}
      </span>
    </button>
  );
};

const CommitFiles = ({
  commit,
  row,
  width,
}: {
  commit: GitCommit;
  row: GraphRow;
  width: number;
}) => {
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const { data, error, isPending } = useQuery(
    gitCommitFilesQuery(folder, commit.hash),
  );

  const message = (text: string) => (
    <div className="flex h-[22px] items-center text-xs text-muted-foreground">
      <LanesCell lanes={row.lanesBelow} width={width} />
      <span className="truncate pl-3">{text}</span>
    </div>
  );

  if (isPending) return message("Loading changes…");
  if (error) return message(`Couldn't load the changes: ${error.message}`);
  if (data.length === 0) return message("No file changes");
  return (
    <div role="group">
      {data.map((file) => (
        <CommitFileRow
          key={file.path}
          commit={commit}
          file={file}
          row={row}
          width={width}
        />
      ))}
    </div>
  );
};

const CommitRow = memo(function CommitRow({
  commit,
  row,
  width,
  isExpanded,
  onToggle,
}: {
  commit: GitCommit;
  row: GraphRow;
  width: number;
  isExpanded: boolean;
  onToggle: (hash: string) => void;
}) {
  const badges = toBadges(commit.refs);
  const isHead = commit.refs.some((ref) => ref.isHead);
  const [copied, setCopied] = useState(false);

  const copyHash = async () => {
    await navigator.clipboard.writeText(commit.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <>
      <CommitHover commit={commit}>
        <div
          role="treeitem"
          aria-level={1}
          aria-expanded={isExpanded}
          tabIndex={0}
          className={cn(
            "group flex h-[22px] cursor-pointer items-center gap-1.5 pr-2 text-[13px] outline-none select-none hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
            isExpanded && "bg-muted/40",
          )}
          onClick={() => onToggle(commit.hash)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle(commit.hash);
            }
          }}
        >
          <GraphCell
            row={row}
            width={width}
            isHead={isHead}
            isMerge={commit.parents.length > 1}
          />
          {/* The subject keeps its room; badges shrink first. */}
          <span
            className={cn(
              "min-w-12 flex-auto truncate",
              isHead && "font-semibold",
            )}
          >
            {commit.subject || (
              <span className="text-muted-foreground italic">No message</span>
            )}
          </span>
          {badges.length > 0 && (
            <span className="flex max-w-[50%] min-w-0 shrink-[4] items-center justify-end gap-1">
              {badges.slice(0, 2).map((badge, index) => (
                <RefBadge
                  key={`${index}:${badge.label}`}
                  badge={badge}
                  color={row.color}
                />
              ))}
              {badges.length > 2 && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  +{badges.length - 2}
                </span>
              )}
            </span>
          )}
          {/* Only when the sidebar is wide enough; the hover card always has it. */}
          <span className="hidden max-w-[30%] shrink-0 truncate text-xs text-muted-foreground @xs:block">
            {commit.authorName}
          </span>
          <button
            type="button"
            title={copied ? "Copied" : "Copy Commit Hash"}
            aria-label="Copy Commit Hash"
            onClick={(event) => {
              event.stopPropagation();
              void copyHash();
            }}
            className="hidden size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none group-focus-within:flex group-hover:flex hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <CopyIcon className="size-3.5" />
          </button>
        </div>
      </CommitHover>
      {isExpanded && <CommitFiles commit={commit} row={row} width={width} />}
    </>
  );
});

/* --------------------------------- Section -------------------------------- */

/** Header button for the Graph section. */
export const GraphHeaderActions = () => {
  const allBranches = useGitUi((state) => state.graphAllBranches);
  const label = allBranches
    ? "Show Current Branch Only"
    : "Show All Branches";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={allBranches}
      onClick={(event) => {
        event.stopPropagation();
        useGitUi.setState({ graphAllBranches: !allBranches });
      }}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
        allBranches && "bg-muted text-foreground",
      )}
    >
      <GitForkIcon className="size-3.5" />
    </button>
  );
};

const LoadingRows = () => (
  <div className="flex flex-col gap-2 px-3 py-2">
    {[70, 55, 80, 45, 60].map((percent) => (
      <div key={percent} className="flex items-center gap-2">
        <Skeleton className="size-2.5 shrink-0 rounded-full" />
        <Skeleton className="h-3" style={{ width: `${percent}%` }} />
      </div>
    ))}
  </div>
);

/** Commit history with its branch graph, as in VS Code's Source Control Graph. */
const GitGraph = () => {
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const allBranches = useGitUi((state) => state.graphAllBranches);
  const {
    data,
    error,
    isPending,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(gitLogQuery(folder, allBranches));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const commits = useMemo(
    () => data?.pages.flatMap((page) => page.commits) ?? [],
    [data],
  );
  const rows = useMemo(() => layoutGraph(commits), [commits]);
  const width = Math.min(
    MAX_LANES,
    rows.reduce((widest, row) => Math.max(widest, row.width), 1),
  );

  const toggle = useMemo(
    () => (hash: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (!next.delete(hash)) next.add(hash);
        return next;
      }),
    [],
  );

  if (isPending) return <LoadingRows />;
  if (error) {
    return (
      <p className="px-3 py-2 text-xs break-words text-muted-foreground">
        Couldn't load the history: {error.message}
      </p>
    );
  }
  if (commits.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        No commits yet.
      </p>
    );
  }

  return (
    <div role="tree" aria-label="Commit Graph" className="@container pb-2">
      {commits.map((commit, index) => (
        <CommitRow
          key={commit.hash}
          commit={commit}
          row={rows[index]}
          width={width}
          isExpanded={expanded.has(commit.hash)}
          onToggle={toggle}
        />
      ))}
      {hasNextPage && (
        <button
          type="button"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
          className="flex h-[22px] w-full items-center gap-1.5 text-[13px] text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <LanesCell lanes={rows.at(-1)?.lanesBelow ?? []} width={width} />
          {isFetchingNextPage ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : null}
          Load More Commits
        </button>
      )}
    </div>
  );
};

export default GitGraph;
