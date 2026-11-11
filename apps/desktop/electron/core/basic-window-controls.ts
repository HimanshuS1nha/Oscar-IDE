import { BrowserWindow, type IpcMainInvokeEvent } from "electron";

import { IPC_CHANNEL } from "../shared/ipc-channel";
import type { WindowState } from "../shared/window-state";

const getWindowState = (window: BrowserWindow): WindowState => ({
  isMaximized: window.isMaximized(),
  isFullScreen: window.isFullScreen(),
  isFocused: window.isFocused(),
});

/** Windows whose renderer reported unsaved edits; closing them asks the renderer first. */
const windowsWithUnsavedChanges = new WeakSet<BrowserWindow>();
/** Windows the renderer has cleared to close regardless of unsaved edits. */
const windowsAllowedToClose = new WeakSet<BrowserWindow>();

export class BasicWindowControls {
  static close(event: IpcMainInvokeEvent) {
    BrowserWindow.fromWebContents(event.sender)?.close();
  }

  static setHasUnsavedChanges(event: IpcMainInvokeEvent, hasChanges: boolean) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (hasChanges) windowsWithUnsavedChanges.add(window);
    else windowsWithUnsavedChanges.delete(window);
  }

  /** Closes after the renderer has dealt with unsaved edits (saved or discarded them). */
  static forceClose(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    windowsAllowedToClose.add(window);
    window.close();
  }

  /**
   * Holds back closing a window with unsaved edits (close button, Alt+F4, Cmd+Q)
   * and asks its renderer to prompt; it calls `forceClose` once resolved.
   */
  static attachCloseGuard(window: BrowserWindow) {
    window.on("close", (event) => {
      if (
        !windowsWithUnsavedChanges.has(window) ||
        windowsAllowedToClose.has(window)
      ) {
        return;
      }
      event.preventDefault();
      window.webContents.send(IPC_CHANNEL.window.closeRequested);
    });
  }

  static minimize(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && window.isMinimizable()) {
      window.minimize();
    }
  }

  static isMinimized(event: IpcMainInvokeEvent) {
    return BrowserWindow.fromWebContents(event.sender)?.isMinimized() ?? false;
  }

  static maximize(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    // On macOS the green traffic light toggles full screen.
    if (process.platform === "darwin") {
      window.setFullScreen(!window.isFullScreen());
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }

  static isMaximized(event: IpcMainInvokeEvent) {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  }

  static getState(event: IpcMainInvokeEvent): WindowState | null {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window ? getWindowState(window) : null;
  }

  /** Pushes maximize / full screen / focus changes to the renderer. */
  static attachStateEvents(window: BrowserWindow) {
    const emit = () => {
      if (window.isDestroyed()) return;
      window.webContents.send(
        IPC_CHANNEL.window.stateChanged,
        getWindowState(window),
      );
    };

    window.on("maximize", emit);
    window.on("unmaximize", emit);
    window.on("enter-full-screen", emit);
    window.on("leave-full-screen", emit);
    window.on("focus", emit);
    window.on("blur", emit);
  }
}
