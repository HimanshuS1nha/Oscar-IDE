import type * as Monaco from "monaco-editor";
import { create } from "zustand";

type UseCodeEditor = {
  /**
   * The mounted Monaco editor (in a diff, its right side), or null while no
   * text is showing.
   */
  editor: Monaco.editor.ICodeEditor | null;
  setEditor: (editor: Monaco.editor.ICodeEditor) => void;
  /**
   * Forgets `editor` if it is still the current one. The next editor can mount
   * before the previous one's cleanup runs, so this must not clear a newer one.
   */
  clearEditor: (editor: Monaco.editor.ICodeEditor) => void;
};

export const useCodeEditor = create<UseCodeEditor>((set) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),
  clearEditor: (editor) =>
    set((state) => (state.editor === editor ? { editor: null } : state)),
}));
