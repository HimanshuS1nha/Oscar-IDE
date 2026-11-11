import { useEffect, useRef } from "react";
import { CircleIcon, XIcon } from "lucide-react";
import { FileIcon } from "@react-symbols/icons/utils";

import { cn } from "@/lib/utils";

import { useDirtyFiles } from "@/hooks/use-dirty-files";
import {
  editsFile,
  tabKey,
  useOpenedFiles,
  type OpenedFile,
} from "@/hooks/use-opened-files";
import { closeFile } from "@/lib/file-documents";
import { tabLabel, tabTitle } from "@/lib/tab-label";

const parentFolderName = (filePath: string) => {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 2] ?? "";
};

type TabProps = {
  file: OpenedFile;
  isActive: boolean;
  /** Shown when another open tab has the same file name. */
  description?: string;
};

const Tab = ({ file, isActive, description }: TabProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const setFileInFocus = useOpenedFiles((state) => state.setFileInFocus);
  const addFile = useOpenedFiles((state) => state.addFile);
  // A file's tab and its unstaged diff edit the same text, so both show it.
  const isDirty = useDirtyFiles(
    (state) => editsFile(file) && !!state.dirtyPaths[file.path],
  );
  const label = tabLabel(file);
  // Asks to save first if the file has unsaved edits.
  const close = () => void closeFile(file);

  useEffect(() => {
    if (isActive) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [isActive]);

  return (
    <div
      ref={ref}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      title={tabTitle(file)}
      onClick={() => setFileInFocus(file)}
      // Double click keeps a preview tab open.
      onDoubleClick={() => addFile({ ...file, isPermanent: true })}
      // Middle click closes, as in browsers and VS Code.
      onAuxClick={(event) => {
        if (event.button === 1) close();
      }}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault(); // no autoscroll cursor
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setFileInFocus(file);
        }
      }}
      className={cn(
        "group/tab relative flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r pr-1.5 pl-3 text-[13px] outline-none select-none",
        "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        isActive
          ? "bg-background text-foreground"
          : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {isActive && (
        <span
          className="absolute inset-x-0 top-0 h-px bg-primary"
          aria-hidden
        />
      )}

      <FileIcon fileName={file.name} autoAssign className="size-4 shrink-0" />

      <span className={cn("max-w-48 truncate", !file.isPermanent && "italic")}>
        {label}
      </span>

      {description && (
        <span className="max-w-32 truncate text-xs text-muted-foreground">
          {description}
        </span>
      )}

      {/* Unsaved files show a dot in place of the close button until hovered, as in VS Code. */}
      <button
        type="button"
        aria-label={`Close ${label}${isDirty ? " (unsaved changes)" : ""}`}
        title={isDirty ? "Close (unsaved changes)" : "Close"}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          close();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          "group/close ml-1 flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
          isActive || isDirty
            ? "opacity-100"
            : "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
        )}
      >
        {isDirty && (
          <CircleIcon
            className="size-2.5 fill-current group-hover/close:hidden"
            aria-hidden
          />
        )}
        <XIcon
          className={cn(
            "size-3.5",
            isDirty && "hidden group-hover/close:block",
          )}
        />
      </button>
    </div>
  );
};

const OpenedFilesTabs = () => {
  const openedFiles = useOpenedFiles((state) => state.openedFiles);
  const activeKey = useOpenedFiles(
    (state) => state.fileInFocus && tabKey(state.fileInFocus),
  );

  if (openedFiles.length === 0) return null;

  // A file and its diff have different labels, so only same-named files clash.
  const labelCounts = new Map<string, number>();
  for (const file of openedFiles) {
    const label = tabLabel(file);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  return (
    <div
      role="tablist"
      aria-label="Open files"
      // The scrollbar is hidden, so let a plain mouse wheel scroll sideways.
      onWheel={(event) => {
        if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
      }}
      className="flex h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
    >
      {openedFiles.map((file) => (
        <Tab
          key={tabKey(file)}
          file={file}
          isActive={tabKey(file) === activeKey}
          description={
            (labelCounts.get(tabLabel(file)) ?? 0) > 1
              ? parentFolderName(file.path)
              : undefined
          }
        />
      ))}
    </div>
  );
};

export default OpenedFilesTabs;
