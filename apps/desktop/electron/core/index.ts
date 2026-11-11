import { ipcMain } from "electron";

import { BasicWindowControls } from "./basic-window-controls";
import { IPC_CHANNEL } from "../shared/ipc-channel";
import { FileExplorer } from "./file-explorer";
import { FileOperations } from "./file-operations";
import { FileSearch } from "./search";
import { Git } from "./git";
import { Session } from "./session";
import { Settings } from "./settings";
import { Terminal } from "./terminal";
import { LanguageServer } from "./language-server";
import { AuthToken } from "./auth-token";
import { ShellCommand } from "./shell-command";

export const setupListeners = () => {
  ipcMain.handle(IPC_CHANNEL.window.close, BasicWindowControls.close);
  ipcMain.handle(IPC_CHANNEL.window.minimize, BasicWindowControls.minimize);
  ipcMain.handle(
    IPC_CHANNEL.window.isMinimized,
    BasicWindowControls.isMinimized,
  );
  ipcMain.handle(IPC_CHANNEL.window.maximize, BasicWindowControls.maximize);
  ipcMain.handle(
    IPC_CHANNEL.window.isMaximized,
    BasicWindowControls.isMaximized,
  );
  ipcMain.handle(IPC_CHANNEL.window.getState, BasicWindowControls.getState);
  ipcMain.handle(
    IPC_CHANNEL.window.setHasUnsavedChanges,
    BasicWindowControls.setHasUnsavedChanges,
  );
  ipcMain.handle(IPC_CHANNEL.window.forceClose, BasicWindowControls.forceClose);
  ipcMain.handle(IPC_CHANNEL.file.openFolder, async (event) => {
    const folder = await FileOperations.openFolder(event);
    if (folder) await Session.recordFolder(folder);
    return folder;
  });
  ipcMain.handle(IPC_CHANNEL.file.openFile, FileOperations.openFile);
  ipcMain.handle(IPC_CHANNEL.file.readDirectory, FileExplorer.readDirectory);
  ipcMain.handle(IPC_CHANNEL.file.readFile, FileExplorer.readFile);
  ipcMain.handle(IPC_CHANNEL.file.readImage, FileExplorer.readImage);
  ipcMain.handle(IPC_CHANNEL.file.createFile, FileExplorer.createFile);
  ipcMain.handle(
    IPC_CHANNEL.file.createDirectory,
    FileExplorer.createDirectory,
  );
  ipcMain.handle(IPC_CHANNEL.file.renameEntry, FileExplorer.renameEntry);
  ipcMain.handle(IPC_CHANNEL.file.deleteEntry, FileOperations.deleteEntry);
  ipcMain.handle(IPC_CHANNEL.file.writeFile, FileOperations.writeFile);
  ipcMain.handle(IPC_CHANNEL.file.saveFileAs, FileOperations.saveFileAs);
  ipcMain.handle(
    IPC_CHANNEL.file.confirmUnsavedChanges,
    FileOperations.confirmUnsavedChanges,
  );
  ipcMain.handle(IPC_CHANNEL.search.run, FileSearch.search);
  ipcMain.handle(IPC_CHANNEL.search.replace, FileSearch.replace);
  ipcMain.handle(IPC_CHANNEL.search.confirmReplace, FileSearch.confirmReplace);
  ipcMain.handle(IPC_CHANNEL.search.listFiles, FileSearch.listFiles);
  ipcMain.handle(IPC_CHANNEL.git.status, Git.status);
  ipcMain.handle(IPC_CHANNEL.git.diff, Git.diff);
  ipcMain.handle(IPC_CHANNEL.git.branches, Git.branches);
  ipcMain.handle(IPC_CHANNEL.git.init, Git.init);
  ipcMain.handle(IPC_CHANNEL.git.stage, Git.stage);
  ipcMain.handle(IPC_CHANNEL.git.unstage, Git.unstage);
  ipcMain.handle(IPC_CHANNEL.git.discard, Git.discard);
  ipcMain.handle(IPC_CHANNEL.git.commit, Git.commit);
  ipcMain.handle(IPC_CHANNEL.git.pull, Git.pull);
  ipcMain.handle(IPC_CHANNEL.git.push, Git.push);
  ipcMain.handle(IPC_CHANNEL.git.checkout, Git.checkout);
  ipcMain.handle(IPC_CHANNEL.git.log, Git.log);
  ipcMain.handle(IPC_CHANNEL.git.commitFiles, Git.commitFiles);
  ipcMain.handle(IPC_CHANNEL.git.stashes, Git.stashes);
  ipcMain.handle(IPC_CHANNEL.git.stashFiles, Git.stashFiles);
  ipcMain.handle(IPC_CHANNEL.git.stash, Git.stash);
  ipcMain.handle(IPC_CHANNEL.git.stashApply, Git.stashApply);
  ipcMain.handle(IPC_CHANNEL.git.stashDrop, Git.stashDrop);
  ipcMain.handle(IPC_CHANNEL.git.blame, Git.blame);
  ipcMain.handle(
    IPC_CHANNEL.git.commitMessageContext,
    Git.commitMessageContext,
  );
  ipcMain.handle(IPC_CHANNEL.session.restore, Session.restore);
  ipcMain.on(IPC_CHANNEL.session.saveTabs, Session.saveTabs);
  ipcMain.handle(IPC_CHANNEL.session.recentFolders, Session.recentFolders);
  ipcMain.handle(IPC_CHANNEL.session.openRecent, Session.openRecent);
  ipcMain.on(IPC_CHANNEL.settings.getSync, Settings.getSync);
  ipcMain.handle(IPC_CHANNEL.settings.update, Settings.update);
  ipcMain.handle(IPC_CHANNEL.settings.openFile, Settings.openFile);
  ipcMain.handle(IPC_CHANNEL.terminal.create, Terminal.create);
  ipcMain.on(IPC_CHANNEL.terminal.write, Terminal.write);
  ipcMain.on(IPC_CHANNEL.terminal.resize, Terminal.resize);
  ipcMain.handle(IPC_CHANNEL.terminal.kill, Terminal.kill);
  ipcMain.handle(IPC_CHANNEL.languageServer.start, LanguageServer.start);
  ipcMain.on(IPC_CHANNEL.languageServer.send, LanguageServer.send);
  ipcMain.handle(IPC_CHANNEL.languageServer.stop, LanguageServer.stop);
  ipcMain.handle(
    IPC_CHANNEL.languageServer.allowFile,
    LanguageServer.allowFile,
  );
  ipcMain.handle(IPC_CHANNEL.shellCommand.run, ShellCommand.run);
  ipcMain.handle(IPC_CHANNEL.shellCommand.cancel, ShellCommand.cancel);
  ipcMain.handle(IPC_CHANNEL.auth.getToken, AuthToken.get);
  ipcMain.handle(IPC_CHANNEL.auth.setToken, AuthToken.set);
  ipcMain.handle(IPC_CHANNEL.auth.clearToken, AuthToken.clear);
};
