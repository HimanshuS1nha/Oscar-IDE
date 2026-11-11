import {
  useAppHotkeys,
  useHotkeys,
  type UseHotkeyDefinition,
} from "@tanstack/react-hotkeys";

import { mainMenuItems, type MainMenuItem } from "@/constants/main-menu-items";
import { useCodeEditor } from "@/hooks/use-code-editor";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useShowWorkspace } from "@/hooks/use-show-workspace";

type ShortcutItem = MainMenuItem & {
  appHotkey: NonNullable<MainMenuItem["appHotkey"]>;
  action: () => void;
};

/** Menu entries with a shortcut, so each key does what its menu entry does. */
const shortcutItems = mainMenuItems
  .flatMap((group) => group.children ?? [])
  .filter((item): item is ShortcutItem => !!item.appHotkey && !!item.action);

/**
 * Registers the app-wide shortcuts declared in `constants/app-hotkeys.ts`.
 * Mounted once at the app root.
 */
export const useHotKeys = () => {
  const hotkeys = useAppHotkeys();
  const showWorkspace = useShowWorkspace();
  const hasEditor = useCodeEditor((state) => state.editor !== null);

  const definitions: UseHotkeyDefinition[] = shortcutItems.map((item) => ({
    hotkey: hotkeys[item.appHotkey],
    // As from the menu: leave pages like Settings for the editor view first.
    callback: () =>
      item.anyPage ? item.action() : void showWorkspace().then(item.action),
    options: { enabled: !item.needsEditor || hasEditor },
  }));

  definitions.push({
    hotkey: hotkeys["view.commandPalette"],
    callback: () => useCommandPalette.getState().toggle(),
  });

  useHotkeys(definitions);
};
