import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronsDownUpIcon,
  FilePlusIcon,
  FolderPlusIcon,
  RotateCwIcon,
} from "lucide-react";

import { FileTree } from "@/components/file-tree-node";
import ExplorerEmptyState from "@/components/sidebars/explorer-empty-state";
import { Button } from "@/components/ui/button";

import { useExplorerTree } from "@/hooks/use-explorer-tree";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { baseName } from "@/lib/paths";
import { DIRECTORY_QUERY_ROOT } from "@/queries/directory-query";

const FileExplorerSidebar = () => {
  const queryClient = useQueryClient();
  const collapseAll = useExplorerTree((state) => state.collapseAll);
  const startCreation = useExplorerTree((state) => state.startCreation);
  const selectedFolderPath = useSelectedFolder(
    (state) => state.selectedFolderPath,
  );

  if (!selectedFolderPath) {
    return <ExplorerEmptyState />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 pl-3 pr-1">
        <h2
          className="truncate text-xs font-semibold tracking-wide uppercase"
          title={selectedFolderPath}
        >
          {baseName(selectedFolderPath)}
        </h2>

        <div className="flex shrink-0 items-center">
          {/* Don't blur an open name input on press: it would commit before the new one opens. */}
          <Button
            variant="ghost"
            size="icon-xs"
            title="New File..."
            aria-label="New File"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void startCreation("file")}
          >
            <FilePlusIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="New Folder..."
            aria-label="New Folder"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void startCreation("directory")}
          >
            <FolderPlusIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Refresh Explorer"
            aria-label="Refresh Explorer"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: DIRECTORY_QUERY_ROOT })
            }
          >
            <RotateCwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Collapse Folders"
            aria-label="Collapse Folders"
            onClick={collapseAll}
          >
            <ChevronsDownUpIcon />
          </Button>
        </div>
      </div>

      <FileTree root={selectedFolderPath} />
    </div>
  );
};

export default FileExplorerSidebar;
