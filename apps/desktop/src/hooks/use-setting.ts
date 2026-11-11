import { useSettings } from "@/hooks/use-settings";

import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsSection,
} from "../../electron/shared/settings";

/** One setting's value, with functions to change it and put back its default. */
export const useSetting = <
  S extends SettingsSection,
  K extends keyof Settings[S],
>(
  section: S,
  key: K,
) => {
  const value = useSettings((state) => state.settings[section][key]);
  const fallback = DEFAULT_SETTINGS[section][key];
  return {
    value,
    isDefault: value === fallback,
    setValue: (next: Settings[S][K]) =>
      useSettings.getState().set(section, key, next),
    reset: () => useSettings.getState().set(section, key, fallback),
  };
};
