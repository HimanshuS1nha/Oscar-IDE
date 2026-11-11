import { app, BrowserWindow, nativeTheme } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { setupListeners } from "./core";
import { Session } from "./core/session";
import { BasicWindowControls } from "./core/basic-window-controls";
import { Settings } from "./core/settings";
import { LanguageServer } from "./core/language-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

setupListeners();

/** The page's --background in each theme, shown before the page paints. */
const WINDOW_BACKGROUND = { dark: "#0f172a", light: "#ffffff" };

const windowBackground = () =>
  nativeTheme.shouldUseDarkColors
    ? WINDOW_BACKGROUND.dark
    : WINDOW_BACKGROUND.light;

// Native dialogs, menus and the page's `prefers-color-scheme` follow the
// theme setting; "system" follows the OS.
const applyTheme = () => {
  nativeTheme.themeSource = Settings.current.appearance.theme;
  for (const window of BrowserWindow.getAllWindows()) {
    window.setBackgroundColor(windowBackground());
  }
};
Settings.onChange(applyTheme);

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, "oscar.png"),
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
  });

  // The renderer draws its own platform-specific window controls,
  // so hide the native macOS traffic lights.
  if (process.platform === "darwin") {
    win.setWindowButtonVisibility(false);
  }

  BasicWindowControls.attachStateEvents(win);
  BasicWindowControls.attachCloseGuard(win);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Language servers are child processes: don't leave them running when the
// app ends some other way than quitting (e.g. the dev server restarting it).
process.once("exit", () => LanguageServer.stopAll());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    LanguageServer.stopAll();
    process.exit(0);
  });
}

// Tab and settings changes are saved after a short delay; don't lose the last ones.
app.on("will-quit", () => {
  Session.flushSync();
  Settings.flushSync();
  LanguageServer.stopAll();
});

app.whenReady().then(() => {
  // Before the first window: its preload script reads them synchronously.
  Settings.loadSync();
  applyTheme();
  createWindow();
});
