import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ChevronRightIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";

import { NewEntryInput } from "@/components/new-entry-input";
import { RenameEntryInput } from "@/components/rename-entry-input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getPlatform } from "@/helpers/get-platform";
import { useExplorerTree } from "@/hooks/use-explorer-tree";
import { useOpenedFiles } from "@/hooks/use-opened-files";
import { useTreeRows, type TreeRow } from "@/hooks/use-tree-rows";
import { deleteEntry } from "@/lib/explorer-actions";
import type { DirectoryEntry } from "@/types";

/** Every row is this tall (`h-6`), which lets the list skip measuring them. */
const ROW_HEIGHT_PX = 24;
/** Rows rendered beyond each edge of the view, so fast scrolling doesn't show gaps. */
const OVERSCAN_ROWS = 12;
const INDENT_PX = 12;
const BASE_PADDING_PX = 8;

const rowClassName =
  "flex h-6 w-full items-center gap-1.5 pr-2 text-left text-[13px] outline-none select-none hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:ring-1 data-popup-open:ring-inset data-popup-open:ring-ring";

const indent = (depth: number) => ({
  paddingLeft: BASE_PADDING_PX + depth * INDENT_PX,
});

const isMac = () => getPlatform() === "darwin";

/** Right-click menu for one tree entry. */
const EntryContextMenu = ({ entry }: { entry: DirectoryEntry }) => {
  // Actions that open an inline input must keep the focus the input takes;
  // otherwise the menu hands focus back to the row and the input closes at once.
  const keepFocus = useRef(false);
  const startCreation = useExplorerTree((state) => state.startCreation);
  const startRename = useExplorerTree((state) => state.startRename);

  const focusingAction = (action: () => void) => () => {
    keepFocus.current = true;
    action();
  };

  return (
    <ContextMenuContent
      className="min-w-48"
      finalFocus={() => {
        const restore = !keepFocus.current;
        keepFocus.current = false;
        return restore;
      }}
    >
      {entry.type === "directory" && (
        <>
          <ContextMenuItem
            onClick={focusingAction(() => void startCreation("file", entry.path))}
          >
            <FilePlusIcon />
            New File...
          </ContextMenuItem>
          <ContextMenuItem
            onClick={focusingAction(
              () => void startCreation("directory", entry.path),
            )}
          >
            <FolderPlusIcon />
            New Folder...
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem
        onClick={focusingAction(() =>
          startRename({ path: entry.path, type: entry.type }),
        )}
      >
        <PencilIcon />
        Rename...
        <ContextMenuShortcut>{isMac() ? "↵" : "F2"}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        onClick={() => void deleteEntry(entry)}
      >
        <Trash2Icon />
        Delete
        <ContextMenuShortcut>{isMac() ? "⌘⌫" : "Delete"}</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
};

/** A tree row that opens `EntryContextMenu` on right click. */
const EntryRow = ({
  entry,
  className,
  style,
  onClick,
  onDoubleClick,
  ariaProps,
  children,
}: {
  entry: DirectoryEntry;
  className: string;
  style: CSSProperties;
  onClick: () => void;
  onDoubleClick?: () => void;
  ariaProps: Record<`aria-${string}`, string | boolean | undefined>;
  children: ReactNode;
}) => {
  const select = useExplorerTree((state) => state.select);
  const startRename = useExplorerTree((state) => state.startRename);

  const onKeyDown = (event: KeyboardEvent) => {
    const target = { path: entry.path, type: entry.type };
    const mac = isMac();
    // Enter on macOS (as in Finder) would also activate the button, so it's F2 elsewhere.
    if ((!mac && event.key === "F2") || (mac && event.key === "Enter")) {
      event.preventDefault();
      startRename(target);
    } else if (
      (!mac && event.key === "Delete") ||
      (mac && event.metaKey && event.key === "Backspace")
    ) {
      event.preventDefault();
      void deleteEntry(entry);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<button type="button" />}
        className={className}
        style={style}
        title={entry.path}
        {...ariaProps}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        // Right-clicking selects the entry, so New File etc. target it.
        onContextMenu={() => select({ path: entry.path, type: entry.type })}
      >
        {children}
      </ContextMenuTrigger>
      <EntryContextMenu entry={entry} />
    </ContextMenu>
  );
};

const FileTreeNode = ({
  entry,
  depth,
  siblings,
}: {
  entry: DirectoryEntry;
  depth: number;
  /** The listing `entry` is part of, for rename duplicate checks. */
  siblings: DirectoryEntry[];
}) => {
  const isExpanded = useExplorerTree((state) => !!state.expandedPaths[entry.path]);
  const toggleExpanded = useExplorerTree((state) => state.toggleExpanded);
  const select = useExplorerTree((state) => state.select);
  const isSelected = useExplorerTree(
    (state) => state.selectedEntry?.path === entry.path,
  );
  const pendingRename = useExplorerTree((state) =>
    state.pendingRename?.path === entry.path ? state.pendingRename : null,
  );
  const isFocused = useOpenedFiles(
    (state) => state.fileInFocus?.path === entry.path,
  );
  const addFile = useOpenedFiles((state) => state.addFile);

  const renameInput = pendingRename && (
    <RenameEntryInput
      key={pendingRename.id}
      pending={pendingRename}
      entry={entry}
      siblings={siblings}
      isExpanded={isExpanded}
      paddingLeft={indent(depth).paddingLeft}
    />
  );

  if (renameInput) return renameInput;

  if (entry.type === "directory") {
    return (
      <EntryRow
        entry={entry}
        className={cn(rowClassName, isSelected && "bg-muted/60")}
        style={indent(depth)}
        ariaProps={{ "aria-expanded": isExpanded, "aria-selected": isSelected }}
        onClick={() => {
          select({ path: entry.path, type: "directory" });
          toggleExpanded(entry.path);
        }}
      >
        <ChevronRightIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-100",
            isExpanded && "rotate-90",
          )}
        />
        <FolderIcon folderName={entry.name} className="size-4 shrink-0" />
        <span className="truncate">{entry.name}</span>
      </EntryRow>
    );
  }

  const open = (isPermanent: boolean) => {
    select({ path: entry.path, type: "file" });
    addFile({ name: entry.name, path: entry.path, isPermanent });
  };

  return (
    <EntryRow
      entry={entry}
      className={cn(
        rowClassName,
        isFocused && "bg-accent text-accent-foreground hover:bg-accent",
      )}
      style={indent(depth)}
      ariaProps={{ "aria-current": isFocused ? "true" : undefined }}
      // Single click previews, double click keeps the tab open.
      onClick={() => open(false)}
      onDoubleClick={() => open(true)}
    >
      {/* Lines file icons up with folder icons, which sit after a chevron. */}
      <span className="size-4 shrink-0" />
      <FileIcon fileName={entry.name} autoAssign className="size-4 shrink-0" />
      <span className="truncate">{entry.name}</span>
    </EntryRow>
  );
};

const TreeRowContent = ({ row }: { row: TreeRow }) => {
  switch (row.kind) {
    case "entry":
      return (
        <FileTreeNode
          entry={row.entry}
          depth={row.depth}
          siblings={row.siblings}
        />
      );
    case "create":
      return (
        <NewEntryInput
          key={row.pending.id}
          pending={row.pending}
          siblings={row.siblings}
          paddingLeft={indent(row.depth).paddingLeft}
        />
      );
    case "loading":
      return (
        <div className="flex h-6 items-center pr-2" style={indent(row.depth)}>
          <Skeleton className="h-3 w-24" />
        </div>
      );
    case "error":
      return (
        <p
          className="flex h-6 items-center pr-2 text-xs text-destructive"
          style={indent(row.depth)}
          title={row.message}
        >
          Couldn't read this folder
        </p>
      );
    case "empty":
      return (
        <p className="flex h-6 items-center px-3 text-xs text-muted-foreground">
          This folder is empty.
        </p>
      );
  }
};

/**
 * The opened folder's tree. Only the rows in view are rendered, so folders
 * with many thousands of entries stay fast to expand and scroll.
 */
export const FileTree = ({ root }: { root: string }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useTreeRows(root);
  const renamingPath = useExplorerTree((state) => state.pendingRename?.path);
  // The row holding keyboard focus.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  // Kept rendered while out of view: a name input would lose its focus (and
  // close) if it unmounted, and a focused row would drop keyboard focus.
  const keptIndexes = rows.flatMap((row, index) =>
    row.kind === "create" ||
    (row.kind === "entry" && row.entry.path === renamingPath) ||
    row.key === focusedKey
      ? [index]
      : [],
  );
  const keptKey = keptIndexes.join(",");
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      const extra = keptIndexes.filter((index) => !indexes.includes(index));
      return extra.length > 0
        ? [...indexes, ...extra].sort((a, b) => a - b)
        : indexes;
    },
    // `keptKey` stands for `keptIndexes`, which is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keptKey],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    getItemKey: (index) => rows[index].key,
    overscan: OVERSCAN_ROWS,
    paddingEnd: 16,
    rangeExtractor,
  });

  const onFocus = (event: FocusEvent) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-row-key]",
    );
    setFocusedKey(row?.dataset.rowKey ?? null);
  };

  const onBlur = (event: FocusEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusedKey(null);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div
        role="tree"
        aria-label="Files"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          return (
            <div
              key={item.key}
              data-row-key={row.key}
              className={cn(
                "absolute top-0 left-0 w-full",
                // An input's error message hangs over the rows below it.
                (row.kind === "create" ||
                  (row.kind === "entry" && row.entry.path === renamingPath)) &&
                  "z-10",
              )}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <TreeRowContent row={row} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FileTreeNode;
