import { FileIcon } from "@react-symbols/icons/utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CodeIcon, LogInIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";

import { mainMenuItems, type MainMenuItem } from "@/constants/main-menu-items";
import { useCodeEditor } from "@/hooks/use-code-editor";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useExplorerTree } from "@/hooks/use-explorer-tree";
import { useHotkeyLabel } from "@/hooks/use-hotkey-label";
import {
  isFileTab,
  tabKey,
  useOpenedFiles,
} from "@/hooks/use-opened-files";
import { useRunAfterClose } from "@/hooks/use-run-after-close";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useShowWorkspace } from "@/hooks/use-show-workspace";
import { fuzzyScore, fuzzyScorePath, normalizeQuery } from "@/lib/fuzzy-match";
import { tabLabel } from "@/lib/tab-label";
import {
  baseName,
  isSameOrInside,
  joinRelative,
  parentPath,
} from "@/lib/paths";
import { workspaceFilesQuery } from "@/queries/workspace-files-query";

type PaletteCommand = MainMenuItem & { label: string; action: () => void };

/** Every main-menu entry that does something, as "File: Save" etc. */
const commands: PaletteCommand[] = mainMenuItems.flatMap((group) =>
  (group.children ?? []).flatMap((item) =>
    item.action
      ? [{ ...item, label: `${group.name}: ${item.name}`, action: item.action }]
      : [],
  ),
);

const pages = [
  { label: "Editor", to: "/", icon: CodeIcon },
  { label: "Settings", to: "/settings", icon: SettingsIcon },
  { label: "Sign In", to: "/sign-in", icon: LogInIcon },
] as const;

/** Folder files shown at most, best matches first. */
const MAX_FILE_RESULTS = 50;

/**
 * Keeps the items matching `query`, best first; with no query, keeps them all
 * in order.
 */
const rank = <T,>(
  items: readonly T[],
  query: string,
  score: (item: T) => number | null,
  limit = Infinity,
) => {
  if (!query) return items.slice(0, limit);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const value = score(item);
    if (value !== null) scored.push({ item, score: value });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
};

const openFileLabel = tabLabel;

/** Where a file lives, relative to the opened folder when it's inside it. */
const describeLocation = (path: string, root: string | null) => {
  const dir = parentPath(path);
  if (!root || !isSameOrInside(dir, root)) return dir;
  return dir === root ? "" : dir.slice(root.length + 1);
};

/**
 * The top bar's search box (Ctrl/⌘+P): opens a palette that finds files in
 * the opened folder (quick open), open tabs, commands and pages.
 */
const CommandPalette = () => {
  const open = useCommandPalette((state) => state.isOpen);
  const setOpen = useCommandPalette((state) => state.setOpen);
  const [search, setSearch] = useState("");
  // Filtering thousands of paths can lag behind typing; the input never does.
  const query = normalizeQuery(useDeferredValue(search));
  const { runAfterClose, rootProps, popupProps } = useRunAfterClose();
  const showWorkspace = useShowWorkspace();
  const navigate = useNavigate();

  const openedFiles = useOpenedFiles((state) => state.openedFiles);
  const root = useSelectedFolder((state) => state.selectedFolderPath);
  const hasEditor = useCodeEditor((state) => state.editor !== null);
  const hotkeyLabel = useHotkeyLabel();
  const quickOpenLabel = hotkeyLabel({ appHotkey: "view.quickOpen" });
  const { data: workspaceFiles } = useQuery({
    ...workspaceFilesQuery(root),
    enabled: open && !!root,
  });

  /** Closes the palette, then runs `action` (see useRunAfterClose). */
  const choose = (action: () => void, movesFocus = false) => {
    runAfterClose(action, { movesFocus });
    setOpen(false);
  };

  const openFile = (path: string) =>
    choose(async () => {
      await showWorkspace();
      useOpenedFiles
        .getState()
        .addFile({ name: baseName(path), path, isPermanent: true });
      useExplorerTree.getState().select({ path, type: "file" });
    });

  const matchingOpenFiles = useMemo(
    () =>
      rank(openedFiles, query, (file) =>
        fuzzyScorePath(
          query,
          // Score the label too, so "working" finds a Working Tree diff.
          `${describeLocation(file.path, root)}/${openFileLabel(file)}`,
        ),
      ),
    [openedFiles, query, root],
  );

  // Only searched with a query: a whole folder is too many to list.
  const matchingFolderFiles = useMemo(() => {
    if (!query || !workspaceFiles?.root || workspaceFiles.root !== root) {
      return [];
    }
    const alreadyOpen = new Set(
      openedFiles.filter(isFileTab).map((file) => file.path),
    );
    const folderRoot = workspaceFiles.root;
    return rank(
      workspaceFiles.files,
      query,
      (relativePath) => fuzzyScorePath(query, relativePath),
      MAX_FILE_RESULTS + alreadyOpen.size,
    )
      .map((relativePath) => ({
        relativePath,
        path: joinRelative(folderRoot, relativePath),
      }))
      .filter((file) => !alreadyOpen.has(file.path))
      .slice(0, MAX_FILE_RESULTS);
  }, [query, workspaceFiles, root, openedFiles]);

  const matchingCommands = useMemo(
    () => rank(commands, query, (command) => fuzzyScore(query, command.label)),
    [query],
  );
  const matchingPages = useMemo(
    () =>
      rank(pages, query, (page) => fuzzyScore(query, `Go to ${page.label}`)),
    [query],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search or type commands"
        // Shrinks between the side groups on narrow windows instead of
        // overlapping them; the label and shortcut drop out as space runs out.
        className="app-no-drag mx-3 flex w-137.5 min-w-0 items-center justify-between gap-3 rounded-lg bg-input px-5 py-1.5 text-sm outline-none hover:bg-input/80 focus-visible:ring-3 focus-visible:ring-ring/50 max-lg:w-80 max-md:w-auto max-md:px-2"
      >
        <SearchIcon size={18} className="shrink-0" />
        <span className="truncate max-md:hidden">Search or type commands</span>
        {quickOpenLabel && (
          <Kbd className="max-lg:hidden">{quickOpenLabel}</Kbd>
        )}
      </button>

      <CommandDialog
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          // Each time it opens, it starts empty.
          if (isOpen) setSearch("");
        }}
        {...rootProps}
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen) setSearch("");
          rootProps.onOpenChangeComplete(isOpen);
        }}
        finalFocus={popupProps.finalFocus}
        title="Command Palette"
        description="Open a file, run a command or go to a page"
        // Drop down from the top bar, like VS Code's command center.
        className="top-12 sm:max-w-xl"
      >
        {/* Filtered here: cmdk's own filter is too slow for a whole folder of files. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={
              root
                ? "Search files by name, commands and pages…"
                : "Search open files, commands and pages…"
            }
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {matchingOpenFiles.length > 0 && (
              <CommandGroup heading="Open Files">
                {matchingOpenFiles.map((file) => {
                  const location = describeLocation(file.path, root);
                  return (
                    <CommandItem
                      key={tabKey(file)}
                      value={`tab:${tabKey(file)}`}
                      onSelect={() =>
                        choose(async () => {
                          await showWorkspace();
                          useOpenedFiles.getState().setFileInFocus(file);
                        })
                      }
                    >
                      <FileIcon fileName={file.name} autoAssign />
                      <span className="truncate">{openFileLabel(file)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {location}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {matchingFolderFiles.length > 0 && (
              <CommandGroup heading="Files">
                {matchingFolderFiles.map((file) => {
                  const name = baseName(file.relativePath);
                  const slash = file.relativePath.lastIndexOf("/");
                  return (
                    <CommandItem
                      key={file.path}
                      value={`file:${file.path}`}
                      onSelect={() => openFile(file.path)}
                    >
                      <FileIcon fileName={name} autoAssign />
                      <span className="truncate">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {slash === -1 ? "" : file.relativePath.slice(0, slash)}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {matchingCommands.length > 0 && (
              <CommandGroup heading="Commands">
                {matchingCommands.map((command) => (
                  <CommandItem
                    key={command.label}
                    value={`command:${command.label}`}
                    disabled={command.needsEditor && !hasEditor}
                    onSelect={() =>
                      choose(async () => {
                        if (!command.anyPage) await showWorkspace();
                        command.action();
                      }, command.movesFocus)
                    }
                  >
                    <span>{command.label}</span>
                    {hotkeyLabel(command) && (
                      <CommandShortcut>{hotkeyLabel(command)}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {matchingPages.length > 0 && (
              <CommandGroup heading="Go To">
                {matchingPages.map((page) => (
                  <CommandItem
                    key={page.to}
                    value={`page:${page.to}`}
                    onSelect={() =>
                      choose(() => void navigate({ to: page.to }))
                    }
                  >
                    <page.icon />
                    <span>{page.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {workspaceFiles?.limitHit && query && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                This folder has more than{" "}
                {workspaceFiles.files.length.toLocaleString()} files; only those
                are searched.
              </p>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
};

export default CommandPalette;
