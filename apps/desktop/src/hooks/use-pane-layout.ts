import { create } from "zustand";

type UsePaneLayoutType = {
  sidebarWidth: number;
  /** False after the sidebar was dragged closed (snapped). */
  isSidebarVisible: boolean;
  terminalHeight: number;
  setSidebarWidth: (width: number) => void;
  setSidebarVisible: (visible: boolean) => void;
  setTerminalHeight: (height: number) => void;
};

/**
 * Pane sizes for the editor view. The view unmounts on pages like Settings,
 * so the sizes live here to be restored when it mounts again.
 */
export const usePaneLayout = create<UsePaneLayoutType>()((set) => ({
  sidebarWidth: 240,
  isSidebarVisible: true,
  terminalHeight: 260,
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setSidebarVisible: (isSidebarVisible) => set({ isSidebarVisible }),
  setTerminalHeight: (terminalHeight) => set({ terminalHeight }),
}));
