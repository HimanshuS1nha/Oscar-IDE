import { FolderIcon, FolderOpenIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

import { useFormatForDisplay } from "@tanstack/react-hotkeys";
import { Fragment } from "react";

import { getPlatform } from "@/helpers/get-platform";
import { useResolveHotkey } from "@/hooks/use-hotkey-label";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { baseName } from "@/lib/paths";

/** Recent folders listed under the button. */
const MAX_RECENT_SHOWN = 5;

const ExplorerEmptyState = () => {
  const openFolder = useSelectedFolder((state) => state.openFolder);
  const isOpeningFolder = useSelectedFolder((state) => state.isOpeningFolder);
  const recentFolders = useSelectedFolder((state) => state.recentFolders);
  const openRecentFolder = useSelectedFolder(
    (state) => state.openRecentFolder,
  );
  const isMac = getPlatform() === "darwin";
  const format = useFormatForDisplay();
  const hotkey = useResolveHotkey()({ appHotkey: "file.openFolder" });
  // One label per key. (A rebound shortcut could be a sequence: its steps' keys in order.)
  const keys = hotkey ? [format(hotkey, { parts: true })].flat(2) : [];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/15 blur-xl" />
        <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted/60 text-muted-foreground shadow-xs">
          <FolderOpenIcon className="size-7" strokeWidth={1.5} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium text-foreground">No folder open</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Open a project folder to browse and edit its files here.
        </p>
      </div>

      <Button
        className="w-full"
        onClick={openFolder}
        disabled={isOpeningFolder}
      >
        {isOpeningFolder ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <FolderOpenIcon />
        )}
        {isOpeningFolder ? "Opening…" : "Open Folder"}
      </Button>

      {keys.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          or press
          <KbdGroup>
            {keys.map((key, index) => (
              <Fragment key={index}>
                {index > 0 && !isMac && <span>+</span>}
                <Kbd>{key}</Kbd>
              </Fragment>
            ))}
          </KbdGroup>
        </p>
      )}

      {recentFolders.length > 0 && (
        <div className="flex w-full flex-col gap-1 text-left">
          <h3 className="px-2 text-xs font-medium text-muted-foreground">
            Recent
          </h3>
          <ul className="flex flex-col">
            {recentFolders.slice(0, MAX_RECENT_SHOWN).map((folder) => (
              <li key={folder}>
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"
                  title={folder}
                  disabled={isOpeningFolder}
                  onClick={() => void openRecentFolder(folder)}
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-foreground">
                    {baseName(folder)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ExplorerEmptyState;
