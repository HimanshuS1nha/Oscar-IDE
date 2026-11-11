import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useExplorerTree } from "@/hooks/use-explorer-tree";
import { useOpenedFiles } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import {
  DIRECTORY_QUERY_ROOT,
  directoryQuery,
} from "@/queries/directory-query";
import { FILE_QUERY_ROOT, fileQuery } from "@/queries/file-query";
import { WORKSPACE_FILES_QUERY_ROOT } from "@/queries/workspace-files-query";

/**
 * Keeps cached directory listings and file contents in step with the filesystem.
 * Mounted once at the app root so changes aren't missed while the explorer is hidden.
 */
export const useFileTreeSync = () => {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      window.electron.file.onTreeChange((changedDirs) => {
        // Quick open's file list: refetched now if the palette is open, else when it next opens.
        queryClient.invalidateQueries({ queryKey: WORKSPACE_FILES_QUERY_ROOT });
        for (const dir of changedDirs) {
          // Unloaded directories have no cache entry, so this is a no-op for them.
          queryClient.invalidateQueries({
            queryKey: directoryQuery(dir).queryKey,
            exact: true,
          });
        }
      }),
    [queryClient],
  );

  useEffect(
    () =>
      window.electron.file.onContentsChange((changedFiles) => {
        // Not exact: an image preview's query sits under its file's key.
        for (const file of changedFiles) {
          queryClient.invalidateQueries({ queryKey: fileQuery(file).queryKey });
        }
      }),
    [queryClient],
  );

  // A different folder starts with a fresh tree and no open files.
  useEffect(
    () =>
      useSelectedFolder.subscribe((state, previous) => {
        if (state.selectedFolderPath === previous.selectedFolderPath) return;
        queryClient.removeQueries({ queryKey: DIRECTORY_QUERY_ROOT });
        queryClient.removeQueries({ queryKey: FILE_QUERY_ROOT });
        queryClient.removeQueries({ queryKey: WORKSPACE_FILES_QUERY_ROOT });
        useExplorerTree.getState().reset();
        useOpenedFiles.getState().reset();
      }),
    [queryClient],
  );
};
