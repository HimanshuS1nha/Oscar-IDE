import { create } from "zustand";

export type RevealTarget = {
  path: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  length: number;
  /** Move keyboard focus into the editor too. */
  focus: boolean;
};

type UseEditorReveal = {
  /** Where the editor should select and scroll to once `path` is showing. */
  target: (RevealTarget & { id: number }) | null;
  reveal: (target: RevealTarget) => void;
  /** Called by the editor once it has shown target `id`. */
  done: (id: number) => void;
};

let nextId = 1;

export const useEditorReveal = create<UseEditorReveal>((set) => ({
  target: null,
  reveal: (target) => set({ target: { ...target, id: nextId++ } }),
  done: (id) =>
    set((state) => (state.target?.id === id ? { target: null } : state)),
}));
