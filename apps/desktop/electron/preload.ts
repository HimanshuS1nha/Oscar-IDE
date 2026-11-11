import { ipcRenderer, contextBridge, type IpcRendererEvent } from "electron";
import { IPC_CHANNEL } from "./shared/ipc-channel";
import type {
  DeleteEntryRequest,
  DeleteEntryResult,
  DirectoryEntry,
  FileContents,
  ImageContents,
  ReadFileOptions,
  TextEncoding,
  UnsavedChangesChoice,
  WriteFileRequest,
  WriteFileResult,
} from "./shared/file-tree";
import type {
  GitActionResult,
  GitBlame,
  GitBlameRequest,
  GitBranches,
  GitCommitFile,
  GitCommitMessageContext,
  GitDiffContents,
  GitDiffRequest,
  GitDiscardRequest,
  GitLogPage,
  GitLogRequest,
  GitStash,
  GitStashFile,
  GitStashRequest,
  GitStatus,
} from "./shared/git";
import type {
  ReplaceRequest,
  ReplaceResult,
  SearchRequest,
  SearchResult,
  WorkspaceFiles,
} from "./shared/search";
import type {
  TerminalCreateRequest,
  TerminalExit,
  TerminalInfo,
} from "./shared/terminal";
import type {
  LanguageServerExit,
  LanguageServerInfo,
  ServerLanguage,
} from "./shared/language-server";
import type { RestoredSession, SessionTabs } from "./shared/session";
import type {
  ShellCommandRequest,
  ShellCommandResult,
} from "./shared/shell-command";
import type { Settings, SettingsPatch } from "./shared/settings";
import type { WindowState } from "./shared/window-state";

export const api = {
  platform: process.platform,
  /** Runtime versions, shown on the About page. */
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  window: {
    close: () => ipcRenderer.invoke(IPC_CHANNEL.window.close),
    minimize: () => ipcRenderer.invoke(IPC_CHANNEL.window.minimize),
    isMinimized: () => ipcRenderer.invoke(IPC_CHANNEL.window.isMinimized),
    maximize: () => ipcRenderer.invoke(IPC_CHANNEL.window.maximize),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNEL.window.isMaximized),
    getState: (): Promise<WindowState | null> =>
      ipcRenderer.invoke(IPC_CHANNEL.window.getState),
    onStateChange: (callback: (state: WindowState) => void) => {
      const listener = (_event: IpcRendererEvent, state: WindowState) =>
        callback(state);
      ipcRenderer.on(IPC_CHANNEL.window.stateChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.window.stateChanged, listener);
      };
    },
    /** While true, closing the window fires `onCloseRequested` instead of closing. */
    setHasUnsavedChanges: (hasChanges: boolean) =>
      ipcRenderer.invoke(IPC_CHANNEL.window.setHasUnsavedChanges, hasChanges),
    /** Called when the user tries to close a window with unsaved changes. */
    onCloseRequested: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNEL.window.closeRequested, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.window.closeRequested, listener);
      };
    },
    /** Closes the window even if it has unsaved changes. */
    forceClose: () => ipcRenderer.invoke(IPC_CHANNEL.window.forceClose),
  },
  file: {
    openFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.openFolder),
    /**
     * Shows the native file picker. Resolves to the chosen file's path, or null
     * if cancelled. The file may be read and saved even outside the opened folder.
     */
    openFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.openFile),
    readDirectory: (dirPath: string): Promise<DirectoryEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.readDirectory, dirPath),
    /** Called with the directories whose listing changed on disk. */
    onTreeChange: (callback: (changedDirs: string[]) => void) => {
      const listener = (_event: IpcRendererEvent, changedDirs: string[]) =>
        callback(changedDirs);
      ipcRenderer.on(IPC_CHANNEL.file.treeChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.file.treeChanged, listener);
      };
    },
    /**
     * Creates an empty file at `name` inside `parentPath`. `name` may contain
     * `/` to create missing folders on the way. Resolves to the new file's path.
     */
    createFile: (parentPath: string, name: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.createFile, parentPath, name),
    /** Like `createFile`, but creates a folder. Resolves to its path. */
    createDirectory: (parentPath: string, name: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.createDirectory, parentPath, name),
    /** Renames a file or folder in place. Resolves to its new path. */
    renameEntry: (oldPath: string, newName: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.renameEntry, oldPath, newName),
    /** Asks for confirmation, then moves the entry to the trash. */
    deleteEntry: (request: DeleteEntryRequest): Promise<DeleteEntryResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.deleteEntry, request),
    writeFile: (request: WriteFileRequest): Promise<WriteFileResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.writeFile, request),
    /** Shows the Save As dialog and writes `content` to the chosen path. */
    saveFileAs: (request: {
      sourcePath: string;
      content: string;
      encoding: TextEncoding;
    }): Promise<WriteFileResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.saveFileAs, request),
    confirmUnsavedChanges: (
      fileNames: string[],
    ): Promise<UnsavedChangesChoice> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.confirmUnsavedChanges, fileNames),
    readFile: (
      filePath: string,
      options?: ReadFileOptions,
    ): Promise<FileContents> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.readFile, filePath, options),
    /** Reads an image (see `imageMimeType`) for the editor to preview. */
    readImage: (filePath: string): Promise<ImageContents> =>
      ipcRenderer.invoke(IPC_CHANNEL.file.readImage, filePath),
    /** Called with the files that were edited, created or deleted on disk. */
    onContentsChange: (callback: (changedFiles: string[]) => void) => {
      const listener = (_event: IpcRendererEvent, changedFiles: string[]) =>
        callback(changedFiles);
      ipcRenderer.on(IPC_CHANNEL.file.contentsChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.file.contentsChanged, listener);
      };
    },
  },
  search: {
    /** Searches the opened folder's files on disk. A newer call cancels this one. */
    run: (request: SearchRequest): Promise<SearchResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.search.run, request),
    /** Replaces matches in files on disk. Shows its own error for files it couldn't change. */
    replace: (request: ReplaceRequest): Promise<ReplaceResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.search.replace, request),
    /** Asks before a Replace All. Resolves true to go ahead. */
    confirmReplace: (request: {
      matchCount: number;
      fileCount: number;
      replacement: string;
    }): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNEL.search.confirmReplace, request),
    /** Every file in the opened folder (for quick open), skipping `node_modules`. */
    listFiles: (): Promise<WorkspaceFiles> =>
      ipcRenderer.invoke(IPC_CHANNEL.search.listFiles),
  },
  /** Git for the opened folder. Actions show their own errors and confirmations. */
  git: {
    status: (): Promise<GitStatus> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.status),
    branches: (): Promise<GitBranches> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.branches),
    /** The two versions of a changed file to show side by side. */
    diff: (request: GitDiffRequest): Promise<GitDiffContents> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.diff, request),
    /** Called when something inside `.git` changes (commit, checkout, staging…). */
    onChange: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNEL.git.changed, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.git.changed, listener);
      };
    },
    init: (): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.init),
    stage: (paths: string[]): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.stage, paths),
    /** Include a rename's original path so both sides are unstaged. */
    unstage: (paths: string[]): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.unstage, paths),
    /** Asks first. Untracked files go to the trash. */
    discard: (changes: GitDiscardRequest): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.discard, changes),
    /** With nothing staged, offers to stage everything first. */
    commit: (message: string): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.commit, message),
    pull: (): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.pull),
    /** Publishes the branch if it has no upstream yet. */
    push: (): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.push),
    checkout: (branch: string): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.checkout, branch),
    /** A page of commit history for the graph. Empty before the first commit. */
    log: (request: GitLogRequest): Promise<GitLogPage> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.log, request),
    /** The files a commit changed, compared with its first parent. */
    commitFiles: (hash: string): Promise<GitCommitFile[]> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.commitFiles, hash),
    /** Stash entries, newest first. */
    stashes: (): Promise<GitStash[]> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.stashes),
    /** The files a stash changed, including the untracked files it saved. */
    stashFiles: (hash: string): Promise<GitStashFile[]> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.stashFiles, hash),
    /** Says so (and resolves "cancelled") when there is nothing to stash. */
    stash: (request: GitStashRequest): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.stash, request),
    /** Applies `stash@{index}`; `pop` also drops it if it applied cleanly. */
    stashApply: (index: number, pop: boolean): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.stashApply, index, pop),
    /** Asks first. */
    stashDrop: (index: number): Promise<GitActionResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.stashDrop, index),
    /** Who last changed each line of a file. */
    blame: (request: GitBlameRequest): Promise<GitBlame> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.blame, request),
    /** The changes the next commit would include, for a suggested commit message. */
    commitMessageContext: (): Promise<GitCommitMessageContext> =>
      ipcRenderer.invoke(IPC_CHANNEL.git.commitMessageContext),
  },
  session: {
    /**
     * Reopens the last folder (as if picked with Open Folder) and resolves to
     * it with its tabs that still exist, or null if there is none.
     */
    restore: (): Promise<RestoredSession | null> =>
      ipcRenderer.invoke(IPC_CHANNEL.session.restore),
    /** Remembers the opened folder's tabs, to reopen them on the next launch. */
    saveTabs: (tabs: SessionTabs) =>
      ipcRenderer.send(IPC_CHANNEL.session.saveTabs, tabs),
    /** Recently opened folders, most recent first. */
    recentFolders: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNEL.session.recentFolders),
    /**
     * Opens one of `recentFolders`. Resolves to its path, or null if it no
     * longer exists (the user is told, and it's dropped from the list).
     */
    openRecent: (folder: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNEL.session.openRecent, folder),
  },
  settings: {
    /** The settings when the window loaded, so the first render already uses them. */
    initial: ipcRenderer.sendSync(IPC_CHANNEL.settings.getSync) as Settings,
    /** Saves a change and resolves to the resulting settings (invalid values reset to their defaults). */
    update: (patch: SettingsPatch): Promise<Settings> =>
      ipcRenderer.invoke(IPC_CHANNEL.settings.update, patch),
    /** Called when another window or a hand edit of `settings.json` changed them. */
    onChange: (callback: (settings: Settings) => void) => {
      const listener = (_event: IpcRendererEvent, settings: Settings) =>
        callback(settings);
      ipcRenderer.on(IPC_CHANNEL.settings.changed, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.settings.changed, listener);
      };
    },
    /** Opens `settings.json` in the system's default editor. */
    openFile: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNEL.settings.openFile),
  },
  /** Shells running in the opened folder. They end when the window reloads or closes. */
  terminal: {
    create: (request: TerminalCreateRequest): Promise<TerminalInfo> =>
      ipcRenderer.invoke(IPC_CHANNEL.terminal.create, request),
    write: (id: number, data: string) =>
      ipcRenderer.send(IPC_CHANNEL.terminal.write, id, data),
    resize: (id: number, cols: number, rows: number) =>
      ipcRenderer.send(IPC_CHANNEL.terminal.resize, id, cols, rows),
    kill: (id: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNEL.terminal.kill, id),
    /** Called with every terminal's output; check the id. */
    onData: (callback: (id: number, data: string) => void) => {
      const listener = (_event: IpcRendererEvent, id: number, data: string) =>
        callback(id, data);
      ipcRenderer.on(IPC_CHANNEL.terminal.data, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.terminal.data, listener);
      };
    },
    /** Called when a shell exits on its own (not after `kill`). */
    onExit: (callback: (exit: TerminalExit) => void) => {
      const listener = (_event: IpcRendererEvent, exit: TerminalExit) =>
        callback(exit);
      ipcRenderer.on(IPC_CHANNEL.terminal.exit, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.terminal.exit, listener);
      };
    },
  },
  /**
   * Language servers (TypeScript, Python) for the opened folder. The renderer
   * speaks the protocol (src/lib/lsp); messages are serialized JSON-RPC.
   */
  languageServer: {
    start: (language: ServerLanguage): Promise<LanguageServerInfo> =>
      ipcRenderer.invoke(IPC_CHANNEL.languageServer.start, language),
    send: (id: number, message: string) =>
      ipcRenderer.send(IPC_CHANNEL.languageServer.send, id, message),
    /** Call after sending `shutdown` and `exit`; kills the server if it lingers. */
    stop: (id: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNEL.languageServer.stop, id),
    /** Called with every server's messages; check the id. */
    onMessage: (callback: (id: number, message: string) => void) => {
      const listener = (_event: IpcRendererEvent, id: number, message: string) =>
        callback(id, message);
      ipcRenderer.on(IPC_CHANNEL.languageServer.message, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.languageServer.message, listener);
      };
    },
    /** Called when a server stops by itself (a crash), not after `stop`. */
    onExit: (callback: (exit: LanguageServerExit) => void) => {
      const listener = (_event: IpcRendererEvent, exit: LanguageServerExit) =>
        callback(exit);
      ipcRenderer.on(IPC_CHANNEL.languageServer.exit, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNEL.languageServer.exit, listener);
      };
    },
    /**
     * Lets the editor open a declaration or source file outside the opened
     * folder that a definition led to (in `node_modules`, the bundled
     * TypeScript, an installed Python package or the standard library).
     * Resolves false if it isn't such a file.
     */
    allowFile: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNEL.languageServer.allowFile, filePath),
  },
  /** One-off commands for the AI, run to completion without a terminal. */
  shellCommand: {
    /** Runs in the opened folder (or `cwd` inside it). Rejects if it can't start. */
    run: (request: ShellCommandRequest): Promise<ShellCommandResult> =>
      ipcRenderer.invoke(IPC_CHANNEL.shellCommand.run, request),
    /** Stops the run with this id; its `run` resolves with `cancelled`. */
    cancel: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNEL.shellCommand.cancel, id),
  },
  /** The signed-in user's API token, stored encrypted by the main process. */
  auth: {
    /** Resolves to null when signed out. */
    getToken: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNEL.auth.getToken),
    setToken: (token: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNEL.auth.setToken, token),
    clearToken: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNEL.auth.clearToken),
  },
};

contextBridge.exposeInMainWorld("electron", api);
