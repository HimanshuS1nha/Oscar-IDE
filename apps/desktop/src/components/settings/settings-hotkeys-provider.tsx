import {
  HotkeysProvider,
  type CustomHotkeys,
  type HotkeysProviderOptions,
} from "@tanstack/react-hotkeys";
import { useCallback, type ReactNode } from "react";

import { appHotkeys, hotkeyPlatform } from "@/constants/app-hotkeys";
import { useSettings } from "@/hooks/use-settings";

const DEFAULT_OPTIONS: HotkeysProviderOptions = { platform: hotkeyPlatform() };

/**
 * The hotkeys provider, with the user's custom shortcuts from the settings.
 * Changes made through `useCustomHotkeys` are saved back to them, and edits
 * to `settings.json` reach the provider through the settings store.
 */
export const SettingsHotkeysProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const keybindings = useSettings((state) => state.settings.keybindings);
  const saveKeybindings = useCallback(
    (custom: CustomHotkeys) =>
      useSettings
        .getState()
        .update({ keybindings: custom as Record<string, string | null> }),
    [],
  );

  return (
    <HotkeysProvider
      appHotkeys={appHotkeys}
      customHotkeys={keybindings as CustomHotkeys}
      onCustomHotkeysChange={saveKeybindings}
      defaultOptions={DEFAULT_OPTIONS}
    >
      {children}
    </HotkeysProvider>
  );
};
