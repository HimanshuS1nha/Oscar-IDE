import { app, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { RestoredSession } from "../shared/session";
import { showMessageBox } from "./file-operations";
import { FileExplorer } from "./file-explorer";

const MAX_RECENT_FOLDERS = 10;
const SAVE_DELAY_MS = 500;

const tabsSchema = z.object({
  tabs: z
    .array(z.object({ path: z.string(), isPermanent: z.boolean() }))
    .max(500),
  focusedPath: z.string().nullable(),
});

const stateSchema = z.object({
  recentFolders: z.array(z.string()),
  last: tabsSchema.extend({ folder: z.string() }).nullable(),
});

type SessionState = z.infer<typeof stateSchema>;

const statePath = () => path.join(app.getPath("userData"), "session.json");

let state: SessionState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const load = async (): Promise<SessionState> => {
  if (state) return state;
  try {
    const raw = await fs.readFile(statePath(), "utf-8");
    state = stateSchema.parse(JSON.parse(raw));
  } catch {
    // Missing or unreadable: start over rather than fail.
    state = { recentFolders: [], last: null };
  }
  return state;
};

const writeNow = async () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!state) return;
  const target = statePath();
  // Write a temporary file and rename it, so a crash can't leave half a file.
  const temporary = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify(state, null, 2));
  await fs.rename(temporary, target);
};

const scheduleWrite = () => {
  saveTimer ??= setTimeout(() => {
    writeNow().catch((error) => console.error("Failed to save session", error));
  }, SAVE_DELAY_MS);
};

const isDirectory = async (target: string) => {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
};

const isFile = async (target: string) => {
  try {
    return (await fs.stat(target)).isFile();
  } catch {
    return false;
  }
};

const isInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return (
    relative !== "" &&
    relative.split(path.sep)[0] !== ".." &&
    !path.isAbsolute(relative)
  );
};

/**
 * Remembers the last opened folder with its tabs, and the recently opened
 * folders, in `session.json` in the app's data folder.
 *
 * Only folders the user picked in the Open Folder dialog get in here, and only
 * these can be reopened without the dialog: the window can't name a folder
 * itself.
 */
export class Session {
  /** Records `folder` as opened: first among the recent folders, and the one to reopen on launch. */
  static async recordFolder(folder: string) {
    const current = await load();
    const resolved = path.resolve(folder);
    current.recentFolders = [
      resolved,
      ...current.recentFolders.filter((recent) => recent !== resolved),
    ].slice(0, MAX_RECENT_FOLDERS);
    if (current.last?.folder !== resolved) {
      current.last = { folder: resolved, tabs: [], focusedPath: null };
    }
    scheduleWrite();
  }

  /**
   * Reopens the last folder as the window's workspace and returns it with
   * its tabs that still exist, or null if there is none to reopen.
   */
  static async restore(
    event: IpcMainInvokeEvent,
  ): Promise<RestoredSession | null> {
    const { last } = await load();
    if (!last || !(await isDirectory(last.folder))) return null;

    await FileExplorer.openWorkspace(event.sender, last.folder);

    const checked = await Promise.all(
      last.tabs.map(async (tab) =>
        isInside(last.folder, tab.path) && (await isFile(tab.path))
          ? tab
          : null,
      ),
    );
    const tabs = checked.filter((tab) => tab !== null);
    const focusedPath = tabs.some((tab) => tab.path === last.focusedPath)
      ? last.focusedPath
      : (tabs.at(-1)?.path ?? null);

    return { folder: last.folder, tabs, focusedPath };
  }

  /** Stores the open tabs of the window's current folder. */
  static async saveTabs(event: IpcMainEvent, request: unknown) {
    const parsed = tabsSchema.safeParse(request);
    const folder = FileExplorer.workspaceRoot(event.sender.id);
    if (!parsed.success || !folder) return;

    const current = await load();
    // Tabs opened from outside the folder (Open File) aren't reopened.
    const tabs = parsed.data.tabs.filter((tab) => isInside(folder, tab.path));
    current.last = {
      folder,
      tabs,
      focusedPath: tabs.some((tab) => tab.path === parsed.data.focusedPath)
        ? parsed.data.focusedPath
        : null,
    };
    scheduleWrite();
  }

  static async recentFolders(): Promise<string[]> {
    return (await load()).recentFolders;
  }

  /**
   * Opens one of the recent folders as the window's workspace. Resolves to its
   * path, or null if it isn't a recent folder or no longer exists (it is then
   * dropped from the list, after telling the user).
   */
  static async openRecent(
    event: IpcMainInvokeEvent,
    folder: unknown,
  ): Promise<string | null> {
    const current = await load();
    if (typeof folder !== "string" || !current.recentFolders.includes(folder)) {
      return null;
    }

    if (!(await isDirectory(folder))) {
      current.recentFolders = current.recentFolders.filter((f) => f !== folder);
      scheduleWrite();
      await showMessageBox(event, {
        type: "error",
        title: "Folder Not Found",
        message: `"${path.basename(folder)}" no longer exists.`,
        detail: `${folder}\n\nIt was removed from the recent folders.`,
        buttons: ["OK"],
      });
      return null;
    }

    await FileExplorer.openWorkspace(event.sender, folder);
    await Session.recordFolder(folder);
    return folder;
  }

  /**
   * Writes a pending save right away. Synchronous, for `will-quit`, which
   * doesn't wait for promises.
   */
  static flushSync() {
    if (!saveTimer || !state) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      const target = statePath();
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(`${target}.tmp`, JSON.stringify(state, null, 2));
      renameSync(`${target}.tmp`, target);
    } catch (error) {
      console.error("Failed to save session", error);
    }
  }
}
