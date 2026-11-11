import { useEffect } from "react";

import { baseName } from "@/lib/paths";
import { isFileTab, useOpenedFiles, type OpenedFile } from "@/hooks/use-opened-files";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import type { SessionTabs } from "../../electron/shared/session";

/** Reopens the last folder and its tabs. */
const restore = async () => {
  try {
    const session = await window.electron.session.restore();
    // Something was opened while this loaded: keep it.
    if (!session || useSelectedFolder.getState().selectedFolderPath) return;

    // Opening a folder closes every tab, so set the folder first.
    useSelectedFolder.getState().setSelectedFolderPath(session.folder);
    const openedFiles: OpenedFile[] = session.tabs.map((tab) => ({
      name: baseName(tab.path),
      path: tab.path,
      isPermanent: tab.isPermanent,
    }));
    useOpenedFiles.setState({
      openedFiles,
      fileInFocus:
        openedFiles.find((file) => file.path === session.focusedPath) ?? null,
    });
  } catch (error) {
    console.error("Failed to restore the last session", error);
  } finally {
    void useSelectedFolder.getState().refreshRecentFolders();
  }
};

/** Sends the open tabs to the main process whenever they change. */
const saveTabs = () => {
  let lastSent = "";
  return useOpenedFiles.subscribe((state) => {
    // Git diffs aren't reopened.
    const tabs = state.openedFiles.filter(isFileTab);
    const focused = state.fileInFocus;
    const session: SessionTabs = {
      tabs: tabs.map(({ path, isPermanent }) => ({ path, isPermanent })),
      focusedPath: focused && isFileTab(focused) ? focused.path : null,
    };
    const serialized = JSON.stringify(session);
    if (serialized === lastSent) return;
    lastSent = serialized;
    window.electron.session.saveTabs(session);
  });
};

// Once per app load, even though StrictMode mounts effects twice.
let restored: Promise<void> | null = null;

/**
 * Reopens the last folder and its tabs on launch, then keeps the tabs saved.
 * Mounted once at the app root, after `useFileTreeSync` (which closes every
 * tab when the folder changes).
 */
export const useSession = () => {
  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};
    restored ??= restore();
    void restored.then(() => {
      if (isMounted) unsubscribe = saveTabs();
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);
};
