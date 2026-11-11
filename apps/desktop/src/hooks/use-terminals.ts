import { create } from "zustand";

import {
  createTerminalSession,
  disposeTerminalSession,
  focusTerminalSession,
} from "@/lib/terminal-sessions";

export type TerminalTab = {
  id: number;
  /** The shell's name, or the title the shell set (e.g. "user@host: ~/src"). */
  title: string;
  cwd: string;
};

type UseTerminalsType = {
  terminals: TerminalTab[];
  activeId: number | null;
  isPanelOpen: boolean;
  isCreating: boolean;
  /** Starts a shell in a new tab, opens the panel and focuses it. */
  createTerminal: () => Promise<void>;
  /** Kills the shell. Closing the last one hides the panel. */
  closeTerminal: (id: number) => void;
  setActive: (id: number) => void;
  setTitle: (id: number, title: string) => void;
  /** Shows the panel (starting a shell if there is none) or hides it. */
  togglePanel: () => void;
  hidePanel: () => void;
  /** The shell exited by itself, e.g. after `exit`. */
  handleExit: (id: number) => void;
};

const remove = (state: UseTerminalsType, id: number) => {
  const index = state.terminals.findIndex((terminal) => terminal.id === id);
  if (index === -1) return {};
  const terminals = state.terminals.filter((terminal) => terminal.id !== id);
  // Activate the neighbour, as closing an editor tab does.
  const neighbour = terminals[Math.min(index, terminals.length - 1)];
  return {
    terminals,
    activeId: state.activeId === id ? (neighbour?.id ?? null) : state.activeId,
    isPanelOpen: terminals.length > 0 && state.isPanelOpen,
  };
};

export const useTerminals = create<UseTerminalsType>((set, get) => ({
  terminals: [],
  activeId: null,
  isPanelOpen: false,
  isCreating: false,

  createTerminal: async () => {
    if (get().isCreating) return;
    set({ isCreating: true, isPanelOpen: true });
    try {
      const info = await createTerminalSession({
        onTitleChange: (id, title) => get().setTitle(id, title),
        onExit: (id) => get().handleExit(id),
      });
      set((state) => ({
        terminals: [
          ...state.terminals,
          { id: info.id, title: info.shellName, cwd: info.cwd },
        ],
        activeId: info.id,
        isPanelOpen: true,
      }));
      focusTerminalSession(info.id);
    } catch (error) {
      console.error("Failed to start a terminal", error);
      if (get().terminals.length === 0) set({ isPanelOpen: false });
    } finally {
      set({ isCreating: false });
    }
  },

  closeTerminal: (id) => {
    disposeTerminalSession(id);
    void window.electron.terminal.kill(id);
    set((state) => remove(state, id));
  },

  setActive: (id) => {
    set({ activeId: id });
    focusTerminalSession(id);
  },

  setTitle: (id, title) =>
    set((state) => ({
      terminals: state.terminals.map((terminal) =>
        terminal.id === id ? { ...terminal, title } : terminal,
      ),
    })),

  togglePanel: () => {
    const { isPanelOpen, terminals, activeId, createTerminal } = get();
    if (isPanelOpen) {
      set({ isPanelOpen: false });
    } else if (terminals.length === 0) {
      void createTerminal();
    } else {
      set({ isPanelOpen: true });
      if (activeId !== null) focusTerminalSession(activeId);
    }
  },

  hidePanel: () => set({ isPanelOpen: false }),

  handleExit: (id) => {
    disposeTerminalSession(id);
    set((state) => remove(state, id));
  },
}));
