import type * as Monaco from "monaco-editor";
import { useEffect, useState } from "react";
import { create } from "zustand";

/** Side by side or inline, shared by every diff tab. */
export const useDiffLayout = create<{
  sideBySide: boolean;
  toggle: () => void;
}>((set) => ({
  sideBySide: true,
  toggle: () => set((state) => ({ sideBySide: !state.sideBySide })),
}));

/** Number of changed blocks, once Monaco has computed the diff. */
export const useChangeCount = (
  editor: Monaco.editor.IStandaloneDiffEditor | null,
) => {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) {
      setCount(null);
      return;
    }
    const update = () => setCount(editor.getLineChanges()?.length ?? null);
    update();
    const listener = editor.onDidUpdateDiff(update);
    return () => listener.dispose();
  }, [editor]);

  return count;
};
