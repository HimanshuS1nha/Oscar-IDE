import type * as Monaco from "monaco-editor";
import type * as Lsp from "vscode-languageserver-protocol";

import { useSettings } from "@/hooks/use-settings";
import { uriKey, toLspRange, toMarker } from "@/lib/lsp/convert";
import { openFileAt, toFilePath } from "@/lib/lsp/files";
import { isLargeModel } from "@/lib/large-files";
import { JsonRpcConnection } from "@/lib/lsp/json-rpc";
import { LANGUAGE_SPECS, specForModel, type LanguageSpec } from "@/lib/lsp/languages";
import { serverStatus, setServerStatus } from "@/lib/lsp/status";
import { applyWorkspaceEdit } from "@/lib/lsp/workspace-edit";
import { monaco } from "@/lib/monaco";
import { baseName } from "@/lib/paths";

import type { LanguageServerInfo } from "../../../electron/shared/language-server";

/**
 * Files `spec`'s server should know about: files of its languages open in a
 * tab. Read-only diff sides and previews have their own URI schemes. Large
 * files are left out (see lib/large-files): each would be sent whole, and
 * servers are slow to analyze them.
 */
export const isServerDocument = (
  spec: LanguageSpec,
  model: Monaco.editor.ITextModel,
) =>
  model.uri.scheme === "file" &&
  specForModel(model) === spec &&
  !isLargeModel(model);

type OpenDocument = {
  model: Monaco.editor.ITextModel;
  changeListener: Monaco.IDisposable;
};

/** Client capabilities: what this editor can do with the server's results. */
const CLIENT_CAPABILITIES: Lsp.ClientCapabilities = {
  general: { positionEncodings: ["utf-16"] },
  window: { workDoneProgress: true, showDocument: { support: true } },
  workspace: {
    applyEdit: true,
    workspaceEdit: {
      documentChanges: true,
      resourceOperations: ["create"],
      failureHandling: "abort",
    },
    configuration: true,
    workspaceFolders: true,
    executeCommand: {},
  },
  textDocument: {
    synchronization: { didSave: true, willSave: false, willSaveWaitUntil: false },
    publishDiagnostics: {
      relatedInformation: true,
      tagSupport: { valueSet: [1, 2] },
      versionSupport: true,
      codeDescriptionSupport: true,
      dataSupport: true,
    },
    completion: {
      contextSupport: true,
      completionItem: {
        snippetSupport: true,
        commitCharactersSupport: true,
        documentationFormat: ["markdown", "plaintext"],
        deprecatedSupport: true,
        preselectSupport: true,
        tagSupport: { valueSet: [1] },
        insertReplaceSupport: true,
        labelDetailsSupport: true,
        resolveSupport: {
          properties: ["documentation", "detail", "additionalTextEdits", "command"],
        },
      },
      completionList: {
        itemDefaults: ["commitCharacters", "editRange", "insertTextFormat", "data"],
      },
    },
    hover: { contentFormat: ["markdown", "plaintext"] },
    signatureHelp: {
      contextSupport: true,
      signatureInformation: {
        documentationFormat: ["markdown", "plaintext"],
        parameterInformation: { labelOffsetSupport: true },
        activeParameterSupport: true,
      },
    },
    definition: { linkSupport: true },
    typeDefinition: { linkSupport: true },
    implementation: { linkSupport: true },
    declaration: { linkSupport: true },
    references: {},
    documentHighlight: {},
    documentSymbol: {
      hierarchicalDocumentSymbolSupport: true,
      tagSupport: { valueSet: [1] },
    },
    codeAction: {
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: [
            "",
            "quickfix",
            "refactor",
            "refactor.extract",
            "refactor.inline",
            "refactor.rewrite",
            "source",
            "source.organizeImports",
            "source.fixAll",
          ],
        },
      },
      isPreferredSupport: true,
      disabledSupport: true,
      dataSupport: true,
      resolveSupport: { properties: ["edit"] },
    },
    formatting: {},
    rangeFormatting: {},
    onTypeFormatting: {},
    rename: { prepareSupport: true },
    // Monaco folds whole lines.
    foldingRange: { lineFoldingOnly: true },
    selectionRange: {},
  },
};

/**
 * One running language server and the documents it has been told about.
 * Created by lib/lsp/index, which decides when to start and stop it.
 */
export class ServerSession {
  readonly rpc: JsonRpcConnection;
  capabilities: Lsp.ServerCapabilities = {};
  private readonly documents = new Map<string, OpenDocument>();
  /** The latest diagnostics per document, to hand back with code action requests. */
  private readonly diagnostics = new Map<string, Lsp.Diagnostic[]>();
  /** Titles of work in progress, by progress token. */
  private readonly progress = new Map<string | number, string>();
  private disposed = false;
  /**
   * TypeScript: the version the server runs and where it's from, once it says
   * (see `$/typescriptVersion`). Others: the server's own version.
   */
  version: { version: string; source: string | null } | null = null;
  readonly spec: LanguageSpec;

  constructor(readonly info: LanguageServerInfo) {
    this.spec = LANGUAGE_SPECS[info.language];
    this.rpc = new JsonRpcConnection((message) =>
      window.electron.languageServer.send(info.id, message),
    );
    this.registerHandlers();
  }

  get root() {
    return this.info.root;
  }

  async initialize() {
    const rootUri = this.root ? monaco.Uri.file(this.root).toString() : null;
    const result = await this.rpc.request<Lsp.InitializeResult>("initialize", {
      processId: null,
      clientInfo: { name: "Oscar" },
      locale: navigator.language,
      rootPath: this.root,
      rootUri,
      workspaceFolders:
        rootUri && this.root
          ? [{ uri: rootUri, name: baseName(this.root) }]
          : null,
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: this.spec.initializationOptions(this.info),
    } satisfies Lsp.InitializeParams);
    this.capabilities = result.capabilities;
    // TypeScript's server says which TypeScript it runs later, in `$/typescriptVersion`.
    if (this.info.language !== "typescript") {
      const version = result.serverInfo?.version ?? this.info.serverVersion;
      if (version) this.version = { version, source: this.info.pythonPath };
    }
    this.rpc.notify("initialized", {});
  }

  /** Asks the server to exit, then has the main process make sure it does. */
  async stop() {
    if (this.disposed) return;
    try {
      await Promise.race([
        this.rpc.request("shutdown", null),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      this.rpc.notify("exit");
    } catch {
      // Already gone.
    }
    this.dispose();
    await window.electron.languageServer.stop(this.info.id);
  }

  /** Forgets everything without talking to the server (it may already be gone). */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.rpc.dispose();
    for (const document of this.documents.values()) {
      document.changeListener.dispose();
      if (!document.model.isDisposed()) {
        monaco.editor.setModelMarkers(document.model, this.spec.markerOwner, []);
      }
    }
    this.documents.clear();
    this.diagnostics.clear();
  }

  // --- Documents --------------------------------------------------------

  isOpen(model: Monaco.editor.ITextModel) {
    return !this.disposed && this.documents.has(model.uri.toString());
  }

  openDocument(model: Monaco.editor.ITextModel) {
    const uri = model.uri.toString();
    if (this.disposed || this.documents.has(uri)) return;
    if (!isServerDocument(this.spec, model)) return;
    const languageId = this.spec.lspLanguageId(model);

    this.rpc.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: model.getVersionId(),
        text: model.getValue(),
      },
    } satisfies Lsp.DidOpenTextDocumentParams);

    const changeListener = model.onDidChangeContent((event) => {
      // One edit goes as a range; several (multi-cursor, undo of a batch)
      // or a full replacement go as the whole text, which is always valid.
      const [change] = event.changes;
      const contentChanges: Lsp.TextDocumentContentChangeEvent[] =
        !event.isFlush && event.changes.length === 1
          ? [{ range: toLspRange(change.range), text: change.text }]
          : [{ text: model.getValue() }];
      this.rpc.notify("textDocument/didChange", {
        textDocument: { uri, version: event.versionId },
        contentChanges,
      } satisfies Lsp.DidChangeTextDocumentParams);
    });
    this.documents.set(uri, { model, changeListener });
  }

  closeDocument(model: Monaco.editor.ITextModel) {
    const uri = model.uri.toString();
    const document = this.documents.get(uri);
    if (!document) return;
    document.changeListener.dispose();
    this.documents.delete(uri);
    this.diagnostics.delete(uri);
    if (!model.isDisposed()) {
      monaco.editor.setModelMarkers(model, this.spec.markerOwner, []);
    }
    this.rpc.notify("textDocument/didClose", {
      textDocument: { uri },
    } satisfies Lsp.DidCloseTextDocumentParams);
  }

  /** After a file was written to disk. */
  didSave(path: string) {
    const uri = monaco.Uri.file(path).toString();
    if (!this.documents.has(uri)) return;
    this.rpc.notify("textDocument/didSave", {
      textDocument: { uri },
    } satisfies Lsp.DidSaveTextDocumentParams);
  }

  /** The server's diagnostics behind `markers`, which code action requests need. */
  diagnosticsFor(
    model: Monaco.editor.ITextModel,
    markers: Monaco.editor.IMarkerData[],
  ): Lsp.Diagnostic[] {
    const all = this.diagnostics.get(model.uri.toString()) ?? [];
    return all.filter((diagnostic) => {
      const marker = toMarker(diagnostic);
      return markers.some(
        (other) =>
          other.message === marker.message &&
          other.startLineNumber === marker.startLineNumber &&
          other.startColumn === marker.startColumn &&
          other.endLineNumber === marker.endLineNumber &&
          other.endColumn === marker.endColumn,
      );
    });
  }

  // --- Commands ---------------------------------------------------------

  /** Runs a command from a completion, code action or the server itself. */
  async executeCommand(command: Lsp.Command) {
    if (command.command.startsWith("editor.action.")) {
      // Client-side commands (e.g. trigger parameter hints) run in Monaco.
      const editor = monaco.editor
        .getEditors()
        .find((candidate) => candidate.hasTextFocus());
      editor?.trigger("language-server", command.command, command.arguments?.[0]);
      return;
    }
    try {
      await this.rpc.request("workspace/executeCommand", {
        command: command.command,
        arguments: command.arguments,
      } satisfies Lsp.ExecuteCommandParams);
    } catch (error) {
      console.error(`Language server command ${command.command} failed`, error);
    }
  }

  /** Applies a code action: resolves its edit if needed, applies it, runs its command. */
  async applyCodeAction(action: Lsp.CodeAction) {
    let resolved = action;
    const canResolve =
      typeof this.capabilities.codeActionProvider === "object" &&
      this.capabilities.codeActionProvider.resolveProvider;
    if (!resolved.edit && resolved.data !== undefined && canResolve) {
      resolved = await this.rpc.request<Lsp.CodeAction>(
        "codeAction/resolve",
        action,
      );
    }
    if (resolved.edit) await applyWorkspaceEdit(resolved.edit);
    if (resolved.command) await this.executeCommand(resolved.command);
  }

  // --- Messages from the server ------------------------------------------

  private registerHandlers() {
    const rpc = this.rpc;

    rpc.onNotification("textDocument/publishDiagnostics", (params) => {
      const { uri, diagnostics } = params as Lsp.PublishDiagnosticsParams;
      const key = uriKey(uri);
      const document = this.documents.get(key);
      // Only open files get diagnostics; a late report for a closed one is dropped.
      if (!document || document.model.isDisposed()) return;
      this.diagnostics.set(key, diagnostics);
      monaco.editor.setModelMarkers(
        document.model,
        this.spec.markerOwner,
        diagnostics.map(toMarker),
      );
    });

    rpc.onNotification("$/typescriptVersion", (params) => {
      const { version, source } = params as { version: string; source: string };
      this.version = { version, source };
      const status = serverStatus(this.info.language);
      if (status.state !== "ready") return;
      setServerStatus(this.info.language, { ...status, version, source });
    });

    rpc.onNotification("$/progress", (params) => {
      const { token, value } = params as {
        token: Lsp.ProgressToken;
        value:
          | Lsp.WorkDoneProgressBegin
          | Lsp.WorkDoneProgressReport
          | Lsp.WorkDoneProgressEnd;
      };
      if (value.kind === "begin") this.progress.set(token, value.title);
      else if (value.kind === "end") this.progress.delete(token);
      this.publishProgress();
    });

    rpc.onNotification("window/logMessage", (params) => {
      const { type, message } = params as Lsp.LogMessageParams;
      if (type === 1) console.error(`[${this.info.language}] ${message}`);
      else if (type === 2) console.warn(`[${this.info.language}] ${message}`);
    });

    rpc.onNotification("window/showMessage", (params) => {
      const { type, message } = params as Lsp.ShowMessageParams;
      (type === 1 ? console.error : console.warn)(`[${this.info.language}] ${message}`);
    });

    // Nothing to register or refresh: every feature is registered up front.
    rpc.onRequest("client/registerCapability", () => null);
    rpc.onRequest("client/unregisterCapability", () => null);
    rpc.onRequest("window/workDoneProgress/create", () => null);
    rpc.onRequest("window/showMessageRequest", (params) => {
      console.warn(`[${this.info.language}] ${(params as Lsp.ShowMessageRequestParams).message}`);
      return null;
    });
    for (const refresh of [
      "workspace/codeLens/refresh",
      "workspace/inlayHint/refresh",
      "workspace/semanticTokens/refresh",
      "workspace/diagnostic/refresh",
    ]) {
      rpc.onRequest(refresh, () => null);
    }

    rpc.onRequest("workspace/workspaceFolders", () =>
      this.root
        ? [{ uri: monaco.Uri.file(this.root).toString(), name: baseName(this.root) }]
        : null,
    );

    rpc.onRequest("workspace/configuration", (params) => {
      const { items } = params as Lsp.ConfigurationParams;
      return items.map((item) => {
        if (item.section === "formattingOptions") {
          return this.formattingOptions(item.scopeUri);
        }
        return this.spec.configuration?.(this.info, item.section) ?? null;
      });
    });

    rpc.onRequest("workspace/applyEdit", async (params) => {
      const { edit } = params as Lsp.ApplyWorkspaceEditParams;
      const applied = await applyWorkspaceEdit(edit);
      return { applied } satisfies Lsp.ApplyWorkspaceEditResult;
    });

    rpc.onRequest("window/showDocument", async (params) => {
      const { uri, selection, external } = params as Lsp.ShowDocumentParams;
      if (external || !uri.startsWith("file:")) return { success: false };
      const success = await openFileAt(
        toFilePath(uri),
        selection
          ? {
              startLineNumber: selection.start.line + 1,
              startColumn: selection.start.character + 1,
              endLineNumber: selection.end.line + 1,
              endColumn: selection.end.character + 1,
            }
          : undefined,
      );
      return { success } satisfies Lsp.ShowDocumentResult;
    });
  }

  /** Indentation for edits the server makes in `scopeUri` (organize imports, refactors). */
  formattingOptions(scopeUri?: string): Lsp.FormattingOptions {
    const model = scopeUri
      ? monaco.editor.getModel(monaco.Uri.parse(scopeUri))
      : null;
    if (model) {
      const { tabSize, insertSpaces } = model.getOptions();
      return { tabSize, insertSpaces };
    }
    const { tabSize, insertSpaces } = useSettings.getState().settings.editor;
    return { tabSize, insertSpaces };
  }

  private publishProgress() {
    const status = serverStatus(this.info.language);
    if (status.state !== "ready") return;
    const titles = [...this.progress.values()];
    setServerStatus(this.info.language, { ...status, progress: titles.at(-1) ?? null });
  }
}
