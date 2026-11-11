import type { AppHotkeyId, Hotkey } from "@tanstack/react-hotkeys";

import { editorHotkeys } from "@/constants/app-hotkeys";
import { openAbout, openSettings } from "@/lib/app-router";
import {
  copy,
  cut,
  find,
  findReferences,
  formatDocument,
  goToDefinition,
  organizeImports,
  paste,
  quickFix,
  redo,
  renameSymbol,
  replace,
  undo,
} from "@/lib/editor-actions";
import {
  openFileFromDisk,
  saveFocusedFile,
  saveFocusedFileAs,
} from "@/lib/file-documents";
import { baseName } from "@/lib/paths";
import { applyStash, openStashDialog, useGitUi } from "@/lib/git-actions";
import {
  acceptAllConflicts,
  goToConflict,
} from "@/lib/merge-conflicts";
import { addSelectionToChat } from "@/lib/ai/selection-to-chat";
import { explainError, explainTerminalOutput } from "@/lib/ai/explain-error";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useCurrentTab } from "@/hooks/use-current-tab";
import { useExplorerTree } from "@/hooks/use-explorer-tree";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { showReplaceInFiles, showSearch } from "@/hooks/use-search";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useTerminals } from "@/hooks/use-terminals";

export type MainMenuItem = {
  name: string;
  children?: MainMenuItem[];
  /** Builds `children` when the menu opens, for lists that change (e.g. recent folders). */
  getChildren?: () => MainMenuItem[];
  /** Extra text shown dimmed after the name, such as a folder's location. */
  detail?: string;
  action?: () => void;
  /** Its shortcut, which `useHotKeys` registers to run `action`. */
  appHotkey?: AppHotkeyId;
  /** A shortcut Monaco handles itself, shown only as a label. */
  editorHotkey?: Hotkey;
  /** The action focuses something itself, so the menu must not return focus to its button. */
  movesFocus?: boolean;
  /** Acts on the code editor, so it's disabled while no text file is showing. */
  needsEditor?: boolean;
  /** Works from any page, so running it doesn't switch to the editor view first. */
  anyPage?: boolean;
};
export const mainMenuItems: MainMenuItem[] = [
  {
    name: "File",
    children: [
      {
        name: "New File",
        action: () => void useExplorerTree.getState().startCreation("file"),
        movesFocus: true,
        appHotkey: "file.newFile",
      },
      {
        name: "New Folder",
        action: () =>
          void useExplorerTree.getState().startCreation("directory"),
        movesFocus: true,
        appHotkey: "file.newFolder",
      },
      {
        name: "Open File",
        action: () => void openFileFromDisk(),
        appHotkey: "file.openFile",
      },
      {
        name: "Open Folder",
        action: () => useSelectedFolder.getState().openFolder(),
        appHotkey: "file.openFolder",
      },
      {
        name: "Open Recent",
        getChildren: () => {
          const { recentFolders, openRecentFolder } =
            useSelectedFolder.getState();
          return recentFolders.map((folder) => ({
            name: baseName(folder),
            detail: folder,
            action: () => void openRecentFolder(folder),
          }));
        },
      },
      {
        name: "Save",
        action: () => void saveFocusedFile(),
        appHotkey: "file.save",
      },
      {
        name: "Save As",
        action: () => void saveFocusedFileAs(),
        appHotkey: "file.saveAs",
      },
      {
        name: "Settings",
        action: openSettings,
        appHotkey: "view.settings",
        anyPage: true,
      },
      {
        name: "Exit",
        action: () => {
          window.electron.window.close();
        },
      },
    ],
  },
  {
    name: "Edit",
    children: [
      {
        name: "Undo",
        action: undo,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.undo,
      },
      {
        name: "Redo",
        action: redo,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.redo,
      },
      {
        name: "Cut",
        action: cut,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.cut,
      },
      {
        name: "Copy",
        action: copy,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.copy,
      },
      {
        name: "Paste",
        action: paste,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.paste,
      },
      {
        name: "Find",
        action: find,
        movesFocus: true,
        needsEditor: true,
        appHotkey: "edit.find",
      },
      {
        name: "Replace",
        action: replace,
        movesFocus: true,
        needsEditor: true,
        appHotkey: "edit.replace",
      },
      {
        name: "Find in Files",
        action: showSearch,
        movesFocus: true,
        appHotkey: "search.findInFiles",
      },
      {
        name: "Replace in Files",
        action: showReplaceInFiles,
        movesFocus: true,
        appHotkey: "search.replaceInFiles",
      },
    ],
  },
  {
    name: "Code",
    children: [
      {
        name: "Go to Definition",
        action: goToDefinition,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.goToDefinition,
      },
      {
        name: "Find All References",
        action: findReferences,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.findReferences,
      },
      {
        name: "Rename Symbol",
        action: renameSymbol,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.renameSymbol,
      },
      {
        name: "Quick Fix",
        action: quickFix,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.quickFix,
      },
      {
        name: "Format Document",
        action: formatDocument,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.formatDocument,
      },
      {
        name: "Organize Imports",
        action: organizeImports,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.organizeImports,
      },
      {
        name: "Add Selection to Chat",
        action: addSelectionToChat,
        movesFocus: true,
        needsEditor: true,
        editorHotkey: editorHotkeys.addSelectionToChat,
      },
      {
        name: "Explain Error with AI",
        action: explainError,
        movesFocus: true,
        needsEditor: true,
        appHotkey: "ai.explainError",
      },
      {
        name: "Restart TypeScript Server",
        action: () =>
          void import("@/lib/lsp").then((lsp) =>
            lsp.restartLanguageServer("typescript"),
          ),
      },
      {
        name: "Restart Python Server",
        action: () =>
          void import("@/lib/lsp").then((lsp) => lsp.restartLanguageServer("python")),
      },
    ],
  },
  {
    name: "View",
    children: [
      {
        name: "Quick Open",
        // A toggle, so the shortcut also closes the palette.
        action: () => useCommandPalette.getState().toggle(),
        movesFocus: true,
        appHotkey: "view.quickOpen",
      },
      {
        name: "Explorer",
        action: () => {
          useCurrentTab.getState().setCurrentTab("Explorer");
        },
        appHotkey: "view.explorer",
      },
      {
        name: "Search",
        action: showSearch,
        movesFocus: true,
        appHotkey: "view.search",
      },
      {
        name: "Git",
        action: () => {
          useCurrentTab.getState().setCurrentTab("Git");
        },
        appHotkey: "view.git",
      },
      {
        name: "Terminal",
        action: () => useTerminals.getState().togglePanel(),
        appHotkey: "view.toggleTerminal",
        movesFocus: true,
      },
      {
        name: "AI Chat",
        action: () => useAiChat.getState().toggle(),
        appHotkey: "view.aiChat",
        movesFocus: true,
      },
    ],
  },
  {
    name: "Git",
    children: [
      {
        name: "Stash",
        action: () => openStashDialog(false),
        movesFocus: true,
        appHotkey: "git.stash",
      },
      {
        name: "Stash (Include Untracked)",
        action: () => openStashDialog(true),
        movesFocus: true,
        appHotkey: "git.stashIncludeUntracked",
      },
      {
        name: "Pop Latest Stash",
        action: () => void applyStash({ index: 0 }, true),
        appHotkey: "git.popStash",
      },
      {
        name: "Apply Latest Stash",
        action: () => void applyStash({ index: 0 }, false),
        appHotkey: "git.applyStash",
      },
      {
        name: "Toggle Line Blame",
        action: () =>
          useGitUi.setState((state) => ({ blameEnabled: !state.blameEnabled })),
        appHotkey: "git.toggleBlame",
      },
      {
        name: "Next Merge Conflict",
        action: () => goToConflict("next"),
        needsEditor: true,
        appHotkey: "git.nextConflict",
      },
      {
        name: "Previous Merge Conflict",
        action: () => goToConflict("previous"),
        needsEditor: true,
        appHotkey: "git.previousConflict",
      },
      {
        name: "Accept All Current",
        action: () => acceptAllConflicts("current"),
        needsEditor: true,
      },
      {
        name: "Accept All Incoming",
        action: () => acceptAllConflicts("incoming"),
        needsEditor: true,
      },
      {
        name: "Accept All Both",
        action: () => acceptAllConflicts("both"),
        needsEditor: true,
      },
    ],
  },
  {
    name: "Terminal",
    children: [
      {
        name: "New Terminal",
        action: () => void useTerminals.getState().createTerminal(),
        appHotkey: "terminal.new",
        movesFocus: true,
      },
      {
        name: "Kill Terminal",
        action: () => {
          const { activeId, closeTerminal } = useTerminals.getState();
          if (activeId !== null) closeTerminal(activeId);
        },
        appHotkey: "terminal.kill",
      },
      {
        name: "Explain Terminal Output with AI",
        action: explainTerminalOutput,
        movesFocus: true,
        appHotkey: "terminal.explainOutput",
      },
    ],
  },
  {
    name: "Help",
    children: [
      {
        name: "About",
        action: openAbout,
      },
    ],
  },
];
