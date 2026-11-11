import { defineAppHotkeys, type Hotkey } from "@tanstack/react-hotkeys";

import { getPlatform } from "@/helpers/get-platform";

/**
 * Work wherever focus is, the editor and terminal included: they are caught
 * in the capture phase, before Monaco or xterm can use the key. Holding the
 * keys runs the action once.
 */
const OVERRIDES_WIDGETS = { capture: true, requireReset: true } as const;

/**
 * Editor commands that also work while focus is outside the editor. Monaco
 * handles the key itself when it has focus, and text fields keep it.
 */
const REACHES_EDITOR = { ignoreInputs: true, requireReset: true } as const;

/**
 * Every app-wide shortcut with its default. `useHotKeys` registers them, the
 * menu and command palette show their labels from here, and Settings lists
 * them for the user to change. `hotkey: null` is a command with no default
 * that the user can give one. `meta.group` is the heading Settings shows.
 *
 * The ids key users' custom shortcuts in `settings.json`, so don't rename
 * them: renaming drops what users set.
 */
export const appHotkeys = defineAppHotkeys({
  "file.newFile": {
    hotkey: null,
    meta: { name: "New File", group: "File" },
    options: OVERRIDES_WIDGETS,
  },
  "file.newFolder": {
    hotkey: null,
    meta: { name: "New Folder", group: "File" },
    options: OVERRIDES_WIDGETS,
  },
  "file.openFile": {
    hotkey: null,
    meta: { name: "Open File", group: "File" },
    options: OVERRIDES_WIDGETS,
  },
  "file.openFolder": {
    hotkey: "Mod+O",
    meta: { name: "Open Folder", group: "File" },
    options: OVERRIDES_WIDGETS,
  },
  "file.save": {
    hotkey: "Mod+S",
    meta: { name: "Save", group: "File" },
    options: OVERRIDES_WIDGETS,
  },
  "file.saveAs": {
    hotkey: "Mod+Shift+S",
    meta: { name: "Save As", group: "File" },
    options: OVERRIDES_WIDGETS,
  },
  "edit.find": {
    hotkey: "Mod+F",
    meta: { name: "Find", group: "Edit" },
    options: REACHES_EDITOR,
  },
  "edit.replace": {
    hotkey: "Mod+H",
    meta: { name: "Replace", group: "Edit" },
    options: REACHES_EDITOR,
  },
  "search.findInFiles": {
    hotkey: "Mod+Shift+F",
    meta: { name: "Find in Files", group: "Edit" },
    options: OVERRIDES_WIDGETS,
  },
  "search.replaceInFiles": {
    hotkey: "Mod+Shift+H",
    meta: { name: "Replace in Files", group: "Edit" },
    options: OVERRIDES_WIDGETS,
  },
  "view.settings": {
    hotkey: "Mod+,",
    meta: { name: "Settings", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  "view.explorer": {
    hotkey: null,
    meta: { name: "Explorer", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  "view.search": {
    hotkey: null,
    meta: { name: "Search", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  "view.git": {
    hotkey: null,
    meta: { name: "Git", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  "view.quickOpen": {
    hotkey: "Mod+P",
    meta: { name: "Quick Open", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  "view.commandPalette": {
    hotkey: "Mod+Shift+P",
    meta: { name: "Command Palette", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  "view.aiChat": {
    hotkey: "Mod+Alt+I",
    meta: { name: "AI Chat", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  // The terminal shortcuts use Ctrl on every platform, as in VS Code. They
  // match the physical key, because with Shift held "`" types "~".
  "view.toggleTerminal": {
    hotkey: "Control+[Backquote]",
    meta: { name: "Terminal", group: "View" },
    options: OVERRIDES_WIDGETS,
  },
  "terminal.new": {
    hotkey: "Control+Shift+[Backquote]",
    meta: { name: "New Terminal", group: "Terminal" },
    options: OVERRIDES_WIDGETS,
  },
  "terminal.kill": {
    hotkey: null,
    meta: { name: "Kill Terminal", group: "Terminal" },
    options: OVERRIDES_WIDGETS,
  },
  "terminal.explainOutput": {
    hotkey: null,
    meta: { name: "Explain Terminal Output with AI", group: "Terminal" },
    options: OVERRIDES_WIDGETS,
  },
  "ai.explainError": {
    hotkey: null,
    meta: { name: "Explain Error with AI", group: "Code" },
    options: OVERRIDES_WIDGETS,
  },
  "git.stash": {
    hotkey: null,
    meta: { name: "Stash", group: "Git" },
    options: OVERRIDES_WIDGETS,
  },
  "git.stashIncludeUntracked": {
    hotkey: null,
    meta: { name: "Stash (Include Untracked)", group: "Git" },
    options: OVERRIDES_WIDGETS,
  },
  "git.popStash": {
    hotkey: null,
    meta: { name: "Pop Latest Stash", group: "Git" },
    options: OVERRIDES_WIDGETS,
  },
  "git.applyStash": {
    hotkey: null,
    meta: { name: "Apply Latest Stash", group: "Git" },
    options: OVERRIDES_WIDGETS,
  },
  "git.toggleBlame": {
    hotkey: null,
    meta: { name: "Toggle Line Blame", group: "Git" },
    options: OVERRIDES_WIDGETS,
  },
  "git.nextConflict": {
    hotkey: null,
    meta: { name: "Next Merge Conflict", group: "Git" },
    options: REACHES_EDITOR,
  },
  "git.previousConflict": {
    hotkey: null,
    meta: { name: "Previous Merge Conflict", group: "Git" },
    options: REACHES_EDITOR,
  },
});

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}

/**
 * Monaco's own bindings, shown in the menu but not registered: the editor
 * handles them, and outside it the keys keep their usual meaning (copy in the
 * terminal, undo in a text field…). They can't be changed, and custom
 * shortcuts can't take them.
 */
export const editorHotkeys = {
  undo: "Mod+Z",
  redo: getPlatform() === "darwin" ? "Mod+Shift+Z" : "Mod+Y",
  cut: "Mod+X",
  copy: "Mod+C",
  paste: "Mod+V",
  selectAll: "Mod+A",
  goToDefinition: "F12",
  findReferences: "Shift+F12",
  renameSymbol: "F2",
  quickFix: "Mod+.",
  // Monaco's own bindings; Linux uses Ctrl+Shift+I for formatting.
  formatDocument:
    getPlatform() === "linux" ? "Mod+Shift+I" : "Alt+Shift+F",
  organizeImports: "Alt+Shift+O",
  // Registered by lib/ai/selection-to-chat.
  addSelectionToChat: "Mod+L",
} as const satisfies Record<string, Hotkey>;

export const editorHotkeyNames: Record<keyof typeof editorHotkeys, string> = {
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select All",
  goToDefinition: "Go to Definition",
  findReferences: "Find All References",
  renameSymbol: "Rename Symbol",
  quickFix: "Quick Fix",
  formatDocument: "Format Document",
  organizeImports: "Organize Imports",
  addSelectionToChat: "Add Selection to Chat",
};

/** The platform name the hotkeys library uses for `Mod` and labels. */
export const hotkeyPlatform = () => {
  const platform = getPlatform();
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "windows";
  return "linux";
};
