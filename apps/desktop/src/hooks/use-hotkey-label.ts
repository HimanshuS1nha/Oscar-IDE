import {
  useAppHotkeys,
  useFormatForDisplay,
  type AppHotkeyId,
  type Hotkey,
} from "@tanstack/react-hotkeys";

/** Either an app hotkey's id or a plain hotkey, such as one Monaco handles. */
export type HotkeySource = { appHotkey?: AppHotkeyId; editorHotkey?: Hotkey };

/** The current binding of `appHotkey` (or `editorHotkey`), or null if it has none. */
export const useResolveHotkey = () => {
  const hotkeys = useAppHotkeys();
  return ({ appHotkey, editorHotkey }: HotkeySource): Hotkey | null =>
    appHotkey ? hotkeys[appHotkey].hotkey : (editorHotkey ?? null);
};

/**
 * Returns a function giving a shortcut's label for the current platform,
 * "⇧ ⌘ S" on macOS and "Ctrl+Shift+S" elsewhere, or null if it has none.
 */
export const useHotkeyLabel = () => {
  const resolve = useResolveHotkey();
  const format = useFormatForDisplay();

  return (source: HotkeySource) => {
    const hotkey = resolve(source);
    return hotkey ? format(hotkey) : null;
  };
};
