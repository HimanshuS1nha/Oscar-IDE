import type * as Monaco from "monaco-editor";

import { useSettings } from "@/hooks/use-settings";
import { monaco, usesTypescriptServer } from "@/lib/monaco";

import type {
  LanguageServerInfo,
  ServerLanguage,
} from "../../../electron/shared/language-server";

/*
 * What differs between the language servers Oscar runs. Everything else
 * (starting, restarting, syncing documents, Monaco providers) is shared.
 */

export type LanguageSpec = {
  language: ServerLanguage;
  /** For the status bar, menus and logs. */
  name: string;
  /** Monaco language ids whose files this server handles. */
  monacoLanguages: string[];
  /** Owner of the markers (squiggles) its diagnostics become. */
  markerOwner: string;
  /** Whether the server should run. Python's setting applies at once; TypeScript's at startup. */
  enabled: () => boolean;
  /** The LSP language id for a file of one of `monacoLanguages`. */
  lspLanguageId: (model: Monaco.editor.ITextModel) => string;
  initializationOptions: (info: LanguageServerInfo) => unknown;
  /** Answers to `workspace/configuration` for a section; undefined if it isn't one of the server's. */
  configuration?: (info: LanguageServerInfo, section: string | undefined) => unknown;
};

const extension = (model: Monaco.editor.ITextModel) =>
  /\.([^./\\]+)$/.exec(model.uri.path)?.[1]?.toLowerCase();

/** tsserver preferences: what VS Code turns on by default. */
const TSSERVER_PREFERENCES = {
  includeCompletionsForModuleExports: true,
  includeCompletionsForImportStatements: true,
  includeCompletionsWithSnippetText: true,
  includeCompletionsWithInsertText: true,
  includeAutomaticOptionalChainCompletions: true,
  includeCompletionsWithClassMemberSnippets: true,
  includeCompletionsWithObjectLiteralMethodSnippets: true,
  allowIncompleteCompletions: true,
  useLabelDetailsInCompletionEntries: true,
  importModuleSpecifierPreference: "shortest",
  quotePreference: "auto",
  allowRenameOfImportPath: true,
  providePrefixAndSuffixTextForRename: true,
  allowTextChangesInNewFiles: true,
  jsxAttributeCompletionStyle: "auto",
};

/** Pyright's analysis settings: what VS Code's Pylance uses by default. */
const PYRIGHT_ANALYSIS = {
  autoSearchPaths: true,
  useLibraryCodeForTypes: true,
  autoImportCompletions: true,
  // Analyzing every file of a big project is slow; open files are what's shown.
  diagnosticMode: "openFilesOnly",
  typeCheckingMode: "standard",
};

export const LANGUAGE_SPECS: Record<ServerLanguage, LanguageSpec> = {
  typescript: {
    language: "typescript",
    name: "TypeScript",
    monacoLanguages: ["typescript", "javascript"],
    markerOwner: "typescript-language-server",
    enabled: () => usesTypescriptServer,
    lspLanguageId: (model) => {
      const ext = extension(model);
      if (ext === "tsx") return "typescriptreact";
      if (ext === "jsx") return "javascriptreact";
      return model.getLanguageId();
    },
    initializationOptions: (info) => ({
      hostInfo: "oscar",
      preferences: TSSERVER_PREFERENCES,
      tsserver: info.fallbackTsserverPath
        ? { fallbackPath: info.fallbackTsserverPath }
        : {},
    }),
  },
  python: {
    language: "python",
    name: "Python",
    monacoLanguages: ["python"],
    markerOwner: "pyright",
    enabled: () => useSettings.getState().settings.languages.pythonServer,
    lspLanguageId: () => "python",
    initializationOptions: () => ({}),
    // Pyright asks for these instead of taking initialization options.
    configuration: (info, section) => {
      switch (section) {
        case "python":
          return {
            ...(info.pythonPath ? { pythonPath: info.pythonPath } : {}),
            analysis: PYRIGHT_ANALYSIS,
          };
        case "python.analysis":
          return PYRIGHT_ANALYSIS;
        case "pyright":
          return {};
        default:
          return undefined;
      }
    },
  },
};

/** The spec whose server handles `model`'s language, if any. */
export const specForModel = (model: Monaco.editor.ITextModel) =>
  Object.values(LANGUAGE_SPECS).find((spec) =>
    spec.monacoLanguages.includes(model.getLanguageId()),
  );

// Monaco's Python doesn't claim stub files.
monaco.languages.register({ id: "python", extensions: [".pyi"] });
