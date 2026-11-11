import { create } from "zustand";

type UseCommandPalette = {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  toggle: () => void;
};

/** Whether the command palette (quick open) is showing. */
export const useCommandPalette = create<UseCommandPalette>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
