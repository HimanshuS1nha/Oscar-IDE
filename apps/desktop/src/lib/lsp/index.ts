import type * as Monaco from "monaco-editor";
import type * as Lsp from "vscode-languageserver-protocol";

import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useSettings } from "@/hooks/use-settings";
import { onDidSaveFile, setBackgroundFormatter } from "@/lib/file-documents";
import { toTextEdit } from "@/lib/lsp/convert";
import { disposePreviews, registerOpeners } from "@/lib/lsp/files";
import { LANGUAGE_SPECS, specForModel, type LanguageSpec } from "@/lib/lsp/languages";
import {
  APPLY_CODE_ACTION_ID,
  EXECUTE_COMMAND_ID,
  registerProviders,
} from "@/lib/lsp/providers";
import { isServerDocument, ServerSession } from "@/lib/lsp/session";
import { serverStatus, setServerStatus } from "@/lib/lsp/status";
import { monaco } from "@/lib/monaco";

import type {
  LanguageServerExit,
  ServerLanguage,
} from "../../../electron/shared/language-server";

/*
 * Language features from language servers: typescript-language-server for
 * TypeScript and JavaScript (using the opened folder's tsconfig and its own
 * TypeScript if it has one), and Pyright for Python. Completions, errors, go
 * to definition, rename, quick fixes, formatting where the server does it…
 *
 * Each server starts when the first file of its language opens, restarts
 * with the folder, and is restarted after a crash (a few times, then the
 * status bar offers a manual restart). Importing this module sets it all up.
 */

/** Crashes within `CRASH_WINDOW_MS` after which it stays stopped until restarted by hand. */
const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 3 * 60 * 1000;
/** How long `formatOnSave` may hold up a save. */
const FORMAT_ON_SAVE_TIMEOUT_MS = 3000;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Starts, stops and restarts one language's server. */
class ServerController {
  /** The server, once initialized; documents and providers only use this one. */
  session: ServerSession | null = null;
  /** The server being initialized, which already receives messages. */
  connecting: ServerSession | null = null;
  private providers: Monaco.IDisposable | null = null;
  /** Bumped on every start and stop, so a superseded start gives up. */
  private generation = 0;
  /** The generation of the start in progress, if any. */
  private startingGeneration: number | null = null;
  private readonly crashTimes: number[] = [];

  constructor(readonly spec: LanguageSpec) {}

  private get language() {
    return this.spec.language;
  }

  private setStatus(status: Parameters<typeof setServerStatus>[1]) {
    setServerStatus(this.language, status);
  }

  /** The running or starting server. */
  get current() {
    return this.session ?? this.connecting;
  }

  models() {
    return monaco.editor
      .getModels()
      .filter((model) => isServerDocument(this.spec, model));
  }

  private async start(myGeneration: number) {
    this.setStatus({ state: "starting" });
    const { name } = this.spec;

    let next: ServerSession;
    try {
      next = new ServerSession(
        await window.electron.languageServer.start(this.language),
      );
    } catch (error) {
      if (myGeneration !== this.generation) return;
      console.error(`Couldn't start the ${name} language server`, error);
      this.setStatus({ state: "failed", message: errorMessage(error) });
      return;
    }
    if (myGeneration !== this.generation) {
      void window.electron.languageServer.stop(next.info.id);
      return;
    }

    this.connecting = next;
    try {
      await next.initialize();
    } catch (error) {
      if (this.connecting === next) this.connecting = null;
      if (myGeneration !== this.generation) return;
      console.error(`The ${name} language server didn't initialize`, error);
      void next.stop();
      this.setStatus({ state: "failed", message: errorMessage(error) });
      return;
    }
    if (myGeneration !== this.generation) return;

    this.connecting = null;
    this.session = next;
    this.providers = registerProviders(next);
    for (const model of this.models()) next.openDocument(model);
    this.setStatus({
      state: "ready",
      version: next.version?.version ?? null,
      source: next.version?.source ?? null,
      progress: null,
    });
  }

  /** Starts the server unless it's off, running, starting, or failed (until restarted by hand). */
  ensure() {
    if (!this.spec.enabled()) return;
    if (this.session || this.startingGeneration === this.generation) return;
    if (serverStatus(this.language).state === "failed") return;

    const myGeneration = ++this.generation;
    this.startingGeneration = myGeneration;
    void this.start(myGeneration).finally(() => {
      if (this.startingGeneration === myGeneration) this.startingGeneration = null;
    });
  }

  async stop() {
    this.generation++;
    const running = this.current;
    this.session = null;
    this.connecting = null;
    this.providers?.dispose();
    this.providers = null;
    this.setStatus({ state: "off" });
    await running?.stop();
  }

  /** Stops the server and starts a new one if a file of its language is open. Also clears a failure. */
  async restart() {
    if (!this.spec.enabled()) return;
    this.crashTimes.length = 0;
    await this.stop();
    if (this.models().length > 0) this.ensure();
  }

  /** Follows the setting that turns this server on and off. */
  applyEnabled() {
    if (!this.spec.enabled()) {
      this.crashTimes.length = 0;
      if (this.current) void this.stop();
      else this.setStatus({ state: "off" });
    } else if (this.models().length > 0) {
      this.ensure();
    }
  }

  onExit(exit: LanguageServerExit) {
    const crashed = this.current;
    if (crashed?.info.id !== exit.id) return;

    this.generation++;
    this.session = null;
    this.connecting = null;
    this.providers?.dispose();
    this.providers = null;
    crashed.dispose();

    const lastLine = exit.stderr.split("\n").filter(Boolean).at(-1);
    const message =
      lastLine ??
      `The server exited (${exit.signal ?? `code ${exit.code ?? "unknown"}`}).`;
    console.error(`The ${this.spec.name} language server stopped`, exit);

    const now = Date.now();
    this.crashTimes.push(now);
    while (this.crashTimes.length > 0 && this.crashTimes[0] < now - CRASH_WINDOW_MS) {
      this.crashTimes.shift();
    }
    if (this.crashTimes.length >= MAX_CRASHES) {
      this.setStatus({ state: "failed", message });
      return;
    }

    this.setStatus({ state: "starting" });
    const myGeneration = this.generation;
    setTimeout(() => {
      if (myGeneration !== this.generation) return; // Restarted or stopped meanwhile.
      if (this.models().length > 0) this.ensure();
      else this.setStatus({ state: "off" });
    }, 1000 * this.crashTimes.length);
  }

  /** A new folder: its own server (its own config and environment), and a fresh start after a failure. */
  onFolderChange(folder: string | null) {
    this.crashTimes.length = 0;
    const running = this.current;
    if (!running) {
      if (serverStatus(this.language).state !== "starting") {
        this.setStatus({ state: "off" });
      }
      return;
    }
    if (running.root === folder) return;
    // Opening a folder closes every tab; the next file of this language starts the new one.
    void this.stop().then(() => {
      if (this.models().length > 0) this.ensure();
    });
  }
}

const controllers = Object.fromEntries(
  Object.values(LANGUAGE_SPECS).map((spec) => [spec.language, new ServerController(spec)]),
) as Record<ServerLanguage, ServerController>;

const allControllers = () => Object.values(controllers);

const controllerFor = (model: Monaco.editor.ITextModel) => {
  const spec = specForModel(model);
  return spec ? controllers[spec.language] : undefined;
};

/** Stops `language`'s server and starts a new one if a file of it is open. Also clears a failure. */
export const restartLanguageServer = (language: ServerLanguage) =>
  controllers[language].restart();

/** Tells the right server about a model, now and whenever its language changes. */
const trackModel = (model: Monaco.editor.ITextModel) => {
  const sync = () => {
    for (const controller of allControllers()) controller.session?.closeDocument(model);
    if (model.uri.scheme !== "file") return;
    const controller = controllerFor(model);
    if (!controller) return;
    if (controller.session) controller.session.openDocument(model);
    else controller.ensure();
  };
  sync();
  const languageListener = model.onDidChangeLanguage(sync);
  model.onWillDispose(() => {
    languageListener.dispose();
    for (const controller of allControllers()) controller.session?.closeDocument(model);
  });
};

/** Formats a file being saved without being on screen (lib/file-documents formats the one that is). */
const formatInBackground = async (model: Monaco.editor.ITextModel) => {
  const current = controllerFor(model)?.session;
  if (!current?.isOpen(model) || !current.capabilities.documentFormattingProvider) {
    return;
  }
  const { tabSize, insertSpaces } = model.getOptions();
  const edits = await current.rpc.request<Lsp.TextEdit[] | null>(
    "textDocument/formatting",
    {
      textDocument: { uri: model.uri.toString() },
      options: { tabSize, insertSpaces },
    } satisfies Lsp.DocumentFormattingParams,
  );
  if (!edits?.length || model.isDisposed()) return;
  model.pushEditOperations(
    [],
    edits.map(toTextEdit).map(({ range, text }) => ({ range, text })),
    () => null,
  );
};

const setUp = () => {
  const disposables: (Monaco.IDisposable | (() => void))[] = [
    window.electron.languageServer.onMessage((id, message) => {
      const target = allControllers()
        .map((controller) => controller.current)
        .find((session) => session?.info.id === id);
      target?.rpc.receive(message);
    }),
    window.electron.languageServer.onExit((exit) => {
      for (const controller of allControllers()) controller.onExit(exit);
    }),
    monaco.editor.registerCommand(EXECUTE_COMMAND_ID, (_accessor, language, command) =>
      controllers[language as ServerLanguage]?.session?.executeCommand(
        command as Lsp.Command,
      ),
    ),
    monaco.editor.registerCommand(APPLY_CODE_ACTION_ID, (_accessor, language, action) =>
      controllers[language as ServerLanguage]?.session?.applyCodeAction(
        action as Lsp.CodeAction,
      ),
    ),
    ...registerOpeners(),
    monaco.editor.onDidCreateModel(trackModel),
    onDidSaveFile((path) => {
      for (const controller of allControllers()) controller.session?.didSave(path);
    }),
    setBackgroundFormatter((model) =>
      Promise.race([
        formatInBackground(model),
        new Promise<void>((resolve) => setTimeout(resolve, FORMAT_ON_SAVE_TIMEOUT_MS)),
      ]),
    ),
    useSelectedFolder.subscribe((state, previous) => {
      if (state.selectedFolderPath === previous.selectedFolderPath) return;
      // Previews belong to the old folder's servers.
      disposePreviews();
      for (const controller of allControllers()) {
        controller.onFolderChange(state.selectedFolderPath);
      }
    }),
    useSettings.subscribe((state, previous) => {
      if (state.settings.languages === previous.settings.languages) return;
      for (const controller of allControllers()) controller.applyEnabled();
    }),
  ];
  for (const model of monaco.editor.getModels()) trackModel(model);

  return () => {
    for (const disposable of disposables) {
      if (typeof disposable === "function") disposable();
      else disposable.dispose();
    }
    disposePreviews();
    for (const controller of allControllers()) void controller.stop();
  };
};

// Runs once, the first time the editor code loads.
const tearDown = setUp();
import.meta.hot?.dispose(tearDown);
