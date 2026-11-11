import { create } from "zustand";

type UseDirtyFiles = {
  /** Open files whose editor text differs from what was last loaded or saved. */
  dirtyPaths: Record<string, true>;
  setDirty: (path: string, isDirty: boolean) => void;
};

export const useDirtyFiles = create<UseDirtyFiles>((set) => ({
  dirtyPaths: {},
  setDirty: (path, isDirty) =>
    set((state) => {
      // Runs on every keystroke: return the same state so nothing re-renders.
      if (!!state.dirtyPaths[path] === isDirty) return state;
      const dirtyPaths = { ...state.dirtyPaths };
      if (isDirty) dirtyPaths[path] = true;
      else delete dirtyPaths[path];
      return { dirtyPaths };
    }),
}));
