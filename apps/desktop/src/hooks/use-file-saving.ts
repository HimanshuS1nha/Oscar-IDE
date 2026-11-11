import { useEffect } from "react";

import { useDirtyFiles } from "@/hooks/use-dirty-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { confirmCloseAll } from "@/lib/file-documents";

/**
 * Unsaved-changes prompts: closing the window or opening another folder asks
 * to save edited files first. Mounted once at the app root. (The save
 * shortcuts are in `useHotKeys`.)
 */
export const useFileSaving = () => {
  // Tell the main process, which holds back window closes while edits are unsaved.
  useEffect(() => {
    let hadChanges = false;
    const report = (dirtyPaths: Record<string, true>) => {
      const hasChanges = Object.keys(dirtyPaths).length > 0;
      if (hasChanges === hadChanges) return;
      hadChanges = hasChanges;
      void window.electron.window.setHasUnsavedChanges(hasChanges);
    };

    report(useDirtyFiles.getState().dirtyPaths);
    const unsubscribe = useDirtyFiles.subscribe((state) =>
      report(state.dirtyPaths),
    );
    return () => {
      unsubscribe();
      void window.electron.window.setHasUnsavedChanges(false);
    };
  }, []);

  useEffect(() => {
    let isPrompting = false;
    return window.electron.window.onCloseRequested(async () => {
      if (isPrompting) return;
      isPrompting = true;
      try {
        if (await confirmCloseAll()) await window.electron.window.forceClose();
      } finally {
        isPrompting = false;
      }
    });
  }, []);

  useEffect(() => {
    useSelectedFolder.setState({ confirmLeave: confirmCloseAll });
    return () => useSelectedFolder.setState({ confirmLeave: async () => true });
  }, []);
};
