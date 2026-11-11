import { FileIcon } from "@react-symbols/icons/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  EllipsisIcon,
  LoaderCircleIcon,
  PackageOpenIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { tabKey, useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import {
  applyStash,
  dropStash,
  openStashDialog,
  openStashFileDiff,
  stashChanges,
  useGitUi,
} from "@/lib/git-actions";
import { baseName } from "@/lib/paths";
import { formatDate, formatRelative } from "@/lib/relative-time";
import { gitStashFilesQuery, gitStashesQuery } from "@/queries/git-query";
import type {
  GitStash,
  GitStashFile,
} from "../../../electron/shared/git";

const STATUS_STYLE: Record<
  GitStashFile["status"],
  { letter: string; className: string }
> = {
  modified: { letter: "M", className: "text-amber-400" },
  "type-changed": { letter: "T", className: "text-amber-400" },
  added: { letter: "A", className: "text-emerald-400" },
  deleted: { letter: "D", className: "text-red-400" },
  renamed: { letter: "R", className: "text-sky-400" },
  copied: { letter: "C", className: "text-sky-400" },
};

const RowAction = ({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
  >
    <Icon className="size-3.5" />
  </button>
);

const actionsClassName =
  "hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex";

/* ---------------------------------- Dialog --------------------------------- */

/** Asks for an optional stash message, as VS Code's input box does. */
export const StashDialog = () => {
  const dialog = useGitUi((state) => state.stashDialog);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);

  const close = () => useGitUi.setState({ stashDialog: null });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    close();
    void stashChanges(message, includeUntracked);
  };

  return (
    <Dialog
      open={!!dialog}
      onOpenChange={(open) => {
        if (open) return;
        close();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) return;
        // Each time it opens, it starts empty.
        setMessage("");
        setIncludeUntracked(dialog?.includeUntracked ?? false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Stash Changes</DialogTitle>
            <DialogDescription>
              Saves your changes and reverts the working tree to the last
              commit. Apply or pop the stash later to bring them back.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Stash message"
            placeholder="Message (optional)"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <label className="flex items-center gap-2.5 text-sm select-none">
            <Switch
              size="sm"
              checked={includeUntracked}
              onCheckedChange={setIncludeUntracked}
            />
            Include untracked files
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">
              <ArchiveIcon />
              Stash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------------------------- Menu ----------------------------------- */

/** The Source Control header's "…" menu: stashing, and line blame. */
export const GitMoreMenu = ({ hasChanges }: { hasChanges: boolean }) => {
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const { data: stashes = [] } = useQuery(gitStashesQuery(folder));
  const running = useGitUi((state) => state.running);
  const blameEnabled = useGitUi((state) => state.blameEnabled);
  const latest = stashes[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            title="More Actions"
            aria-label="More Actions"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Stash</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!!running || !hasChanges}
            onClick={() => openStashDialog(false)}
          >
            <ArchiveIcon />
            Stash…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!!running || !hasChanges}
            onClick={() => openStashDialog(true)}
          >
            <ArchiveIcon />
            Stash (Include Untracked)…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!!running || !latest}
            onClick={() => latest && void applyStash(latest, false)}
          >
            <ArchiveRestoreIcon />
            Apply Latest Stash
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!!running || !latest}
            onClick={() => latest && void applyStash(latest, true)}
          >
            <PackageOpenIcon />
            Pop Latest Stash
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={blameEnabled}
          onCheckedChange={(checked) =>
            useGitUi.setState({ blameEnabled: checked })
          }
        >
          Show Line Blame
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/* ---------------------------------- List ----------------------------------- */

const dirName = (relativePath: string) => {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
};

const StashFileRow = ({
  stash,
  file,
}: {
  stash: GitStash;
  file: GitStashFile;
}) => {
  const rowTabKey = tabKey({
    path: file.path,
    diff: { staged: false, commit: file.source },
  });
  const isFocused = useOpenedFiles(
    (state) => !!state.fileInFocus && tabKey(state.fileInFocus) === rowTabKey,
  );
  const name = baseName(file.path);
  const folder = dirName(file.relativePath);
  const style = STATUS_STYLE[file.status];

  return (
    <button
      type="button"
      className={cn(
        "flex h-6 w-full items-center gap-1.5 pr-2 pl-11 text-left text-[13px] outline-none select-none hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        isFocused && "bg-accent text-accent-foreground hover:bg-accent",
      )}
      title={`${file.relativePath}${file.untracked ? " • Untracked" : ""}`}
      onClick={() => openStashFileDiff(stash, file, false)}
      onDoubleClick={() => openStashFileDiff(stash, file, true)}
    >
      <FileIcon fileName={name} autoAssign className="size-4 shrink-0" />
      <span
        className={cn(
          "shrink-0",
          file.status === "deleted" && "text-muted-foreground line-through",
        )}
      >
        {name}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {folder}
      </span>
      <span
        className={cn(
          "w-3 shrink-0 text-center font-mono text-xs font-semibold",
          file.untracked ? "text-emerald-400" : style.className,
        )}
      >
        {file.untracked ? "U" : style.letter}
      </span>
    </button>
  );
};

const StashFiles = ({ stash }: { stash: GitStash }) => {
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const { data, error, isPending } = useQuery(
    gitStashFilesQuery(folder, stash.hash),
  );
  const message = (text: string) => (
    <p className="flex h-6 items-center truncate pl-11 text-xs text-muted-foreground">
      {text}
    </p>
  );
  if (isPending) return message("Loading changes…");
  if (error) return message(`Couldn't load the changes: ${error.message}`);
  if (data.length === 0) return message("No file changes");
  return (
    <div role="group">
      {data.map((file) => (
        <StashFileRow key={file.path} stash={stash} file={file} />
      ))}
    </div>
  );
};

const StashRow = ({ stash }: { stash: GitStash }) => {
  const [isOpen, setIsOpen] = useState(false);
  const running = useGitUi((state) => state.running);
  const ref = `stash@{${stash.index}}`;

  return (
    <div>
      <div className="group flex h-6 items-center gap-1 pr-2 hover:bg-muted/60">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-4 text-left text-[13px] outline-none select-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
          title={`${ref}: ${stash.message}${stash.branch ? `\nOn ${stash.branch}` : ""}\n${formatDate(stash.date)}`}
        >
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-100",
              isOpen && "rotate-90",
            )}
          />
          <ArchiveIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{stash.message}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelative(stash.date)}
          </span>
        </button>
        <div className={actionsClassName}>
          <RowAction
            icon={ArchiveRestoreIcon}
            label="Apply Stash"
            disabled={!!running}
            onClick={() => void applyStash(stash, false)}
          />
          <RowAction
            icon={PackageOpenIcon}
            label="Pop Stash"
            disabled={!!running}
            onClick={() => void applyStash(stash, true)}
          />
          <RowAction
            icon={Trash2Icon}
            label="Drop Stash"
            disabled={!!running}
            onClick={() => void dropStash(stash)}
          />
        </div>
      </div>
      {isOpen && <StashFiles stash={stash} />}
    </div>
  );
};

/** The repository's stashes, below the changes. Hidden while there are none. */
export const StashGroup = () => {
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const { data: stashes = [] } = useQuery(gitStashesQuery(folder));
  const running = useGitUi((state) => state.running);
  const [isOpen, setIsOpen] = useState(true);
  if (stashes.length === 0) return null;

  return (
    <div role="group" aria-label="Stashes" className="mt-1">
      <div className="flex h-6 items-center gap-1 pr-2 hover:bg-muted/60">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-1 text-left text-[11px] font-semibold tracking-wide uppercase outline-none select-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-100",
              isOpen && "rotate-90",
            )}
          />
          <span className="truncate">Stashes</span>
          {running === "stash" && (
            <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
          )}
        </button>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
          {stashes.length}
        </span>
      </div>
      {isOpen &&
        stashes.map((stash) => <StashRow key={stash.hash} stash={stash} />)}
    </div>
  );
};
