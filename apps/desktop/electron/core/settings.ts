import {
  app,
  shell,
  webContents as allWebContents,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { IPC_CHANNEL } from "../shared/ipc-channel";
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  parseSettings,
  type Settings as SettingsData,
  type SettingsPatch,
} from "../shared/settings";

const FILE_NAME = "settings.json";
const SAVE_DELAY_MS = 300;
/** Editors often write a file in several steps; wait for them to finish. */
const RELOAD_DELAY_MS = 150;

const settingsPath = () => path.join(app.getPath("userData"), FILE_NAME);

const serialize = (settings: SettingsData) =>
  `${JSON.stringify(settings, null, 2)}\n`;

let current: SettingsData = DEFAULT_SETTINGS;
/** What the file holds as far as we know, to tell our own writes from the user's edits. */
let lastFileContents: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
let watcher: FSWatcher | null = null;
const listeners = new Set<(settings: SettingsData) => void>();

const notify = () => {
  for (const listener of listeners) listener(current);
};

/** Sends the settings to every window except `except` (which made the change). */
const broadcast = (except?: Electron.WebContents) => {
  for (const contents of allWebContents.getAllWebContents()) {
    if (contents === except || contents.isDestroyed()) continue;
    contents.send(IPC_CHANNEL.settings.changed, current);
  }
};

const writeNow = async () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const target = settingsPath();
  const contents = serialize(current);
  if (contents === lastFileContents) return;
  lastFileContents = contents;
  // Write a temporary file and rename it, so a crash can't leave half a file.
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(`${target}.tmp`, contents);
  await fs.rename(`${target}.tmp`, target);
};

const scheduleWrite = () => {
  saveTimer ??= setTimeout(() => {
    writeNow().catch((error) => console.error("Failed to save settings", error));
  }, SAVE_DELAY_MS);
};

/** Picks up edits made to the file by hand. A file that isn't valid JSON yet is ignored. */
const reloadFromDisk = async () => {
  reloadTimer = null;
  let raw: string;
  try {
    raw = await fs.readFile(settingsPath(), "utf-8");
  } catch {
    return; // Deleted: keep the current settings; the next change writes it again.
  }
  if (raw === lastFileContents) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // Probably half-edited. Wait for the next save.
  }
  lastFileContents = raw;
  current = parseSettings(parsed);
  notify();
  broadcast();
};

const startWatching = () => {
  if (watcher) return;
  const dir = path.dirname(settingsPath());
  try {
    mkdirSync(dir, { recursive: true });
    // Watch the folder rather than the file: saving by rename replaces the
    // file, which would end a watch on the file itself.
    watcher = watch(dir, (_event, fileName) => {
      if (fileName !== FILE_NAME) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => void reloadFromDisk(), RELOAD_DELAY_MS);
    });
    watcher.on("error", () => {
      watcher?.close();
      watcher = null;
    });
  } catch (error) {
    console.error("Can't watch the settings file", error);
  }
};

/**
 * The user's settings, kept in `settings.json` in the app's data folder.
 *
 * Loaded once at startup, before the first window, so windows start with them
 * (the preload script reads them synchronously). Changes from a window are
 * saved after a short delay and sent to the other windows; edits made to the
 * file by hand are picked up and sent to every window.
 */
export class Settings {
  /** Reads the file. Call before creating windows. */
  static loadSync() {
    try {
      const raw = readFileSync(settingsPath(), "utf-8");
      lastFileContents = raw;
      current = parseSettings(JSON.parse(raw));
    } catch {
      // Missing or unreadable: start from the defaults.
      current = DEFAULT_SETTINGS;
    }
    startWatching();
    return current;
  }

  static get current() {
    return current;
  }

  /** Calls `listener` after every change. Returns a function that stops it. */
  static onChange(listener: (settings: SettingsData) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /** For the preload script, which needs the settings before the page renders. */
  static getSync(event: IpcMainEvent) {
    event.returnValue = current;
  }

  /** Applies a window's change and resolves to the resulting settings. */
  static update(event: IpcMainInvokeEvent, patch: unknown): SettingsData {
    if (!patch || typeof patch !== "object") return current;
    current = applySettingsPatch(current, patch as SettingsPatch);
    scheduleWrite();
    notify();
    broadcast(event.sender);
    return current;
  }

  /** Writes the file if needed, then opens it in the system's editor. */
  static async openFile() {
    lastFileContents = null; // Make sure it exists, even if it was deleted.
    await writeNow();
    const error = await shell.openPath(settingsPath());
    if (error) throw new Error(error);
  }

  /** Writes a pending save right away. Synchronous, for `will-quit`. */
  static flushSync() {
    watcher?.close();
    watcher = null;
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      const target = settingsPath();
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(`${target}.tmp`, serialize(current));
      renameSync(`${target}.tmp`, target);
    } catch (error) {
      console.error("Failed to save settings", error);
    }
  }
}
