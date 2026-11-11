import { create } from "zustand";

import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsPatch,
  type SettingsSection,
} from "../../electron/shared/settings";

type UseSettingsType = {
  settings: Settings;
  /** Applies a change right away and saves it. */
  update: (patch: SettingsPatch) => void;
  /** Changes one setting. */
  set: <S extends SettingsSection, K extends keyof Settings[S]>(
    section: S,
    key: K,
    value: Settings[S][K],
  ) => void;
  /** Puts a section (or every setting but the shortcuts) back to the defaults. */
  reset: (section?: SettingsSection) => void;
};

/** Each change gets a number, so a slow reply can't undo a newer change. */
let latestChange = 0;

/**
 * The user's settings (see `electron/shared/settings`). Changes apply here at
 * once and are saved by the main process, which also tells this window when
 * `settings.json` is edited by hand or by another window.
 */
export const useSettings = create<UseSettingsType>()((set, get) => ({
  settings: window.electron.settings.initial ?? DEFAULT_SETTINGS,

  update: (patch) => {
    const change = ++latestChange;
    set({ settings: applySettingsPatch(get().settings, patch) });
    window.electron.settings
      .update(patch)
      .then((saved) => {
        // The main process may have corrected a value.
        if (change === latestChange) set({ settings: saved });
      })
      .catch((error) => console.error("Failed to save settings", error));
  },

  set: (section, key, value) =>
    get().update({ [section]: { [key]: value } } as SettingsPatch),

  reset: (section) => {
    const sections = section
      ? [section]
      : (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter(
          (key): key is SettingsSection => key !== "keybindings",
        );
    get().update(
      Object.fromEntries(
        sections.map((key) => [key, DEFAULT_SETTINGS[key]]),
      ) as SettingsPatch,
    );
  },
}));

const stopListening = window.electron.settings.onChange((settings) => {
  latestChange++; // Outranks any reply still on its way.
  useSettings.setState({ settings });
});

// Vite reloads this module on edits; drop the old listener.
import.meta.hot?.dispose(stopListening);
