import { FileIcon } from "@react-symbols/icons/utils";
import {
  CaseSensitiveIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  EllipsisIcon,
  ListXIcon,
  LoaderCircleIcon,
  RegexIcon,
  ReplaceAllIcon,
  ReplaceIcon,
  RotateCwIcon,
  SearchIcon,
  WholeWordIcon,
  type LucideIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";

import NoFolderState from "@/components/sidebars/no-folder-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useEditorReveal } from "@/hooks/use-editor-reveal";
import { useOpenedFiles } from "@/hooks/use-opened-files";
import { useSearch } from "@/hooks/use-search";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { baseName } from "@/lib/paths";
import { replaceAllResults, replaceInFiles } from "@/lib/replace-in-files";
import {
  replaceInText,
  type SearchFileResult,
  type SearchMatch,
} from "../../../electron/shared/search";

const fieldClassName =
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/30 px-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/30";

const rowClassName =
  "flex h-6 w-full items-center gap-1.5 pr-2 text-left text-[13px] outline-none select-none hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

/** A small icon button shown on a result row while it is hovered or focused. */
const rowActionClassName =
  "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** Replacing is blocked while results are out of date or a replace is running. */
const useCanReplace = () =>
  useSearch((state) => state.status.kind === "done" && !state.isReplacing);

const pluralize = (count: number, word: string) =>
  `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

/** Folder part of a relative path, or "" at the top level. */
const dirName = (relativePath: string) => {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
};

const OptionToggle = ({
  icon: Icon,
  label,
  pressed,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    onClick={onToggle}
    className={cn(
      "flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
      pressed &&
        "bg-primary/20 text-primary ring-1 ring-primary/60 ring-inset hover:bg-primary/25 hover:text-primary",
    )}
  >
    <Icon className="size-3.5" />
  </button>
);

const SearchFields = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearch((state) => state.query);
  const include = useSearch((state) => state.include);
  const exclude = useSearch((state) => state.exclude);
  const matchCase = useSearch((state) => state.matchCase);
  const wholeWord = useSearch((state) => state.wholeWord);
  const isRegex = useSearch((state) => state.isRegex);
  const showDetails = useSearch((state) => state.showDetails);
  const isInvalid = useSearch((state) => state.status.kind === "error");
  const focusRequest = useSearch((state) => state.focusRequest);
  const showReplace = useSearch((state) => state.showReplace);
  const replacement = useSearch((state) => state.replacement);
  const hasResults = useSearch((state) => state.files.length > 0);
  const canReplace = useCanReplace();
  const {
    setQuery,
    setInclude,
    setExclude,
    toggle,
    toggleDetails,
    toggleReplace,
    setReplacement,
    runReplace,
  } = useSearch.getState();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  const replaceAll = () => void runReplace(replaceAllResults);

  return (
    <div className="flex flex-col gap-1.5 px-2 pb-2">
      <div className="flex gap-1">
        <button
          type="button"
          title="Toggle Replace"
          aria-label="Toggle Replace"
          aria-expanded={showReplace}
          onClick={toggleReplace}
          className="flex w-4 shrink-0 items-start justify-center rounded-sm pt-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 transition-transform duration-100",
              showReplace && "rotate-90",
            )}
          />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="relative">
            <input
              ref={inputRef}
              className={cn(fieldClassName, "pr-[4.5rem]")}
              placeholder="Search"
              aria-label="Search"
              aria-invalid={isInvalid}
              spellCheck={false}
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              <OptionToggle
                icon={CaseSensitiveIcon}
                label="Match Case"
                pressed={matchCase}
                onToggle={() => toggle("matchCase")}
              />
              <OptionToggle
                icon={WholeWordIcon}
                label="Match Whole Word"
                pressed={wholeWord}
                onToggle={() => toggle("wholeWord")}
              />
              <OptionToggle
                icon={RegexIcon}
                label="Use Regular Expression"
                pressed={isRegex}
                onToggle={() => toggle("isRegex")}
              />
            </div>
          </div>

          {showReplace && (
            <div className="flex items-center gap-1">
              <input
                className={fieldClassName}
                placeholder="Replace"
                aria-label="Replace"
                spellCheck={false}
                autoComplete="off"
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                onKeyDown={(event) => {
                  // Ctrl/⌘+Alt+Enter replaces all, as in VS Code.
                  const mod =
                    window.electron.platform === "darwin"
                      ? event.metaKey
                      : event.ctrlKey;
                  if (event.key === "Enter" && mod && event.altKey) {
                    event.preventDefault();
                    if (canReplace && hasResults) replaceAll();
                  }
                }}
              />
              <button
                type="button"
                title="Replace All"
                aria-label="Replace All"
                disabled={!canReplace || !hasResults}
                onClick={replaceAll}
                className={cn(rowActionClassName, "size-7")}
              >
                <ReplaceAllIcon className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          title="Toggle Search Details"
          aria-label="Toggle Search Details"
          aria-expanded={showDetails}
          onClick={toggleDetails}
          className={cn(
            "flex h-4 w-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
            showDetails && "text-foreground",
          )}
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      </div>

      {showDetails && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              files to include
            </span>
            <input
              className={fieldClassName}
              placeholder="e.g. *.ts, src/**"
              spellCheck={false}
              autoComplete="off"
              value={include}
              onChange={(event) => setInclude(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              files to exclude
            </span>
            <input
              className={fieldClassName}
              placeholder="e.g. dist, *.test.ts"
              spellCheck={false}
              autoComplete="off"
              value={exclude}
              onChange={(event) => setExclude(event.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
};

const Summary = () => {
  const status = useSearch((state) => state.status);
  const files = useSearch((state) => state.files);
  const hasFilters = useSearch(
    (state) => !!(state.include.trim() || state.exclude.trim()),
  );
  const matchCount = files.reduce((sum, f) => sum + f.matches.length, 0);

  let content: ReactNode = null;
  if (status.kind === "error") {
    content = <span className="text-destructive">{status.message}</span>;
  } else if (status.kind === "searching" && files.length === 0) {
    content = (
      <span className="flex items-center gap-1.5">
        <LoaderCircleIcon className="size-3 animate-spin" />
        Searching…
      </span>
    );
  } else if (status.kind === "done" && files.length === 0) {
    content = hasFilters
      ? "No results found. Check your include and exclude patterns."
      : "No results found.";
  } else if (files.length > 0) {
    content = (
      <span className="flex items-center gap-1.5">
        {status.kind === "searching" && (
          <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
        )}
        {pluralize(matchCount, "result")} in {pluralize(files.length, "file")}
      </span>
    );
  }

  if (!content) return null;

  return (
    <div className="flex flex-col gap-1 px-3 pb-1.5 text-xs leading-relaxed text-muted-foreground">
      {content}
      {status.kind === "done" && status.limitHit && (
        <span className="text-amber-500/90">
          Showing the first {matchCount.toLocaleString()} results. Narrow your
          search to see the rest.
        </span>
      )}
    </div>
  );
};

/**
 * What the match becomes, worked out on its preview line. A regex that needs
 * context cut from the preview (e.g. a lookbehind) falls back to the raw
 * replacement text.
 */
const useReplacementPreview = (match: SearchMatch) => {
  const showReplace = useSearch((state) => state.showReplace);
  const replacement = useSearch((state) => state.replacement);
  const query = useSearch((state) => state.query);
  const isRegex = useSearch((state) => state.isRegex);
  const matchCase = useSearch((state) => state.matchCase);
  const wholeWord = useSearch((state) => state.wholeWord);

  return useMemo(() => {
    if (!showReplace) return null;
    if (!isRegex) return replacement;
    try {
      const { preview, matchStart, matchEnd } = match;
      const result = replaceInText(
        preview,
        { query, isRegex, matchCase, wholeWord },
        replacement,
        [{ line: 1, column: matchStart + 1 }],
      );
      if (result.count !== 1) return replacement;
      const length =
        result.text.length - (preview.length - (matchEnd - matchStart));
      return result.text.slice(matchStart, matchStart + length);
    } catch {
      return replacement;
    }
  }, [showReplace, replacement, query, isRegex, matchCase, wholeWord, match]);
};

const MatchPreview = ({ match }: { match: SearchMatch }) => {
  const replacement = useReplacementPreview(match);
  const matched = match.preview.slice(match.matchStart, match.matchEnd);

  return (
    <span className="truncate font-mono text-xs">
      {match.preview.slice(0, match.matchStart)}
      {replacement === null ? (
        <mark className="rounded-[3px] bg-primary/30 px-px text-foreground ring-1 ring-primary/40">
          {matched}
        </mark>
      ) : (
        <>
          <del className="rounded-[3px] bg-destructive/25 px-px text-foreground line-through decoration-destructive/70">
            {matched}
          </del>
          {replacement && (
            <ins className="rounded-[3px] bg-emerald-500/25 px-px text-foreground no-underline">
              {replacement}
            </ins>
          )}
        </>
      )}
      {match.preview.slice(match.matchEnd)}
    </span>
  );
};

const MatchRow = ({
  file,
  match,
}: {
  file: SearchFileResult;
  match: SearchMatch;
}) => {
  const open = (isPermanent: boolean) => {
    useOpenedFiles.getState().addFile({
      name: baseName(file.path),
      path: file.path,
      isPermanent,
    });
    useEditorReveal.getState().reveal({
      path: file.path,
      line: match.line,
      column: match.column,
      length: match.length,
      focus: isPermanent,
    });
  };

  const showReplace = useSearch((state) => state.showReplace);
  const canReplace = useCanReplace();
  const replace = () =>
    void useSearch.getState().runReplace(() =>
      replaceInFiles([
        {
          path: file.path,
          matches: [{ line: match.line, column: match.column }],
        },
      ]),
    );

  return (
    <div className="group/row relative">
      <button
        type="button"
        className={cn(
          rowClassName,
          "pl-10 text-muted-foreground hover:text-foreground focus-visible:text-foreground",
          showReplace && "group-hover/row:pr-8 group-focus-within/row:pr-8",
        )}
        title={`Line ${match.line}, column ${match.column}`}
        // Single click previews, double click keeps the tab open (as in the explorer).
        onClick={() => open(false)}
        onDoubleClick={() => open(true)}
      >
        <MatchPreview match={match} />
      </button>
      {showReplace && (
        <div className="absolute inset-y-0 right-2 hidden items-center group-hover/row:flex group-focus-within/row:flex">
          <button
            type="button"
            title="Replace"
            aria-label="Replace"
            disabled={!canReplace}
            onClick={replace}
            className={rowActionClassName}
          >
            <ReplaceIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

const FileResult = memo(({ file }: { file: SearchFileResult }) => {
  const isCollapsed = useSearch((state) => !!state.collapsedPaths[file.path]);
  const toggleCollapsed = useSearch((state) => state.toggleCollapsed);
  const showReplace = useSearch((state) => state.showReplace);
  const canReplace = useCanReplace();
  const name = baseName(file.path);
  const folder = dirName(file.relativePath);
  const replaceInFile = () =>
    void useSearch
      .getState()
      .runReplace(() => replaceInFiles([{ path: file.path }]));

  return (
    <div role="group">
      <div className="group/row relative">
        <button
          type="button"
          className={cn(
            rowClassName,
            "pl-2",
            showReplace && "group-hover/row:pr-8 group-focus-within/row:pr-8",
          )}
          title={file.relativePath}
          aria-expanded={!isCollapsed}
          onClick={() => toggleCollapsed(file.path)}
        >
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-100",
              !isCollapsed && "rotate-90",
            )}
          />
          <FileIcon fileName={name} autoAssign className="size-4 shrink-0" />
          <span className="shrink-0">{name}</span>
          {folder && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {folder}
            </span>
          )}
          <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
            {file.matches.length}
          </span>
        </button>
        {showReplace && (
          <div className="absolute inset-y-0 right-2 hidden items-center group-hover/row:flex group-focus-within/row:flex">
            <button
              type="button"
              title="Replace All in File"
              aria-label={`Replace All in ${name}`}
              disabled={!canReplace}
              onClick={replaceInFile}
              className={rowActionClassName}
            >
              <ReplaceAllIcon className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {!isCollapsed &&
        file.matches.map((match) => (
          <MatchRow
            key={`${match.line}:${match.column}`}
            file={file}
            match={match}
          />
        ))}
    </div>
  );
});

const SearchSidebar = () => {
  const selectedFolderPath = useSelectedFolder(
    (state) => state.selectedFolderPath,
  );
  const files = useSearch((state) => state.files);
  const hasQuery = useSearch((state) => !!state.query);
  const allCollapsed = useSearch(
    (state) =>
      state.files.length > 0 &&
      state.files.every((f) => state.collapsedPaths[f.path]),
  );
  const { run, clear, toggleCollapseAll } = useSearch.getState();

  return (
    <div className="flex flex-col pb-4">
      <div className="sticky top-0 z-10 bg-background">
        <div className="flex h-9 items-center justify-between gap-2 pl-3 pr-1">
          <h2 className="text-xs font-semibold tracking-wide uppercase">
            Search
          </h2>

          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Refresh"
              aria-label="Refresh"
              disabled={!hasQuery || !selectedFolderPath}
              onClick={() => void run()}
            >
              <RotateCwIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Clear Search Results"
              aria-label="Clear Search Results"
              disabled={!hasQuery}
              onClick={clear}
            >
              <ListXIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title={allCollapsed ? "Expand All" : "Collapse All"}
              aria-label={allCollapsed ? "Expand All" : "Collapse All"}
              disabled={files.length === 0}
              onClick={toggleCollapseAll}
            >
              {allCollapsed ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
            </Button>
          </div>
        </div>

        {selectedFolderPath && (
          <>
            <SearchFields />
            <Summary />
          </>
        )}
      </div>

      {!selectedFolderPath ? (
        <NoFolderState
          icon={SearchIcon}
          title="Nothing to search"
          description="Open a folder to search across its files."
        />
      ) : (
        <div role="tree" aria-label="Search results">
          {files.map((file) => (
            <FileResult key={file.path} file={file} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchSidebar;
