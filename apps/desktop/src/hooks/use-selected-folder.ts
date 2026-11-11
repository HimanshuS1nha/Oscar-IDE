import { create } from "zustand";

type UseSelectedFolderType = {
  selectedFolderPath: string | null;
  isOpeningFolder: boolean;
  /** Recently opened folders, most recent first. */
  recentFolders: string[];
  setSelectedFolderPath: (path: string | null) => void;
  /** Shows the native folder picker; keeps the current folder on cancel. */
  openFolder: () => Promise<void>;
  /** Opens one of `recentFolders` without the picker. */
  openRecentFolder: (path: string) => Promise<void>;
  /** Reloads `recentFolders` from the main process. */
  refreshRecentFolders: () => Promise<void>;
  /**
   * Asked before another folder replaces this one (which closes every tab).
   * Resolves false to stay. Set by the unsaved-changes guard.
   */
  confirmLeave: () => Promise<boolean>;
};

export const useSelectedFolder = create<UseSelectedFolderType>((set, get) => {
  /** Runs `open` unless a folder is already opening or the user stays. */
  const switchFolder = async (open: () => Promise<string | null>) => {
    if (get().isOpeningFolder) return;

    set({ isOpeningFolder: true });
    try {
      if (!(await get().confirmLeave())) return;
      const path = await open();
      if (path) set({ selectedFolderPath: path });
    } catch (error) {
      console.error("Failed to open folder", error);
    } finally {
      set({ isOpeningFolder: false });
      void get().refreshRecentFolders();
    }
  };

  return {
    selectedFolderPath: null,
    isOpeningFolder: false,
    recentFolders: [],
    setSelectedFolderPath: (path) => set({ selectedFolderPath: path }),
    confirmLeave: async () => true,
    openFolder: () => switchFolder(() => window.electron.file.openFolder()),
    openRecentFolder: async (path) => {
      if (path === get().selectedFolderPath) return;
      await switchFolder(() => window.electron.session.openRecent(path));
    },
    refreshRecentFolders: async () => {
      try {
        set({ recentFolders: await window.electron.session.recentFolders() });
      } catch (error) {
        console.error("Failed to load recent folders", error);
      }
    },
  };
});
