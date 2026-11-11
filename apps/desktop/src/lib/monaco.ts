import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";

/**
 * Bundles Monaco with the app instead of letting @monaco-editor/react pull it
 * from a CDN, so the editor works offline and loads no remote code.
 */
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

loader.config({ monaco });

/**
 * With the TypeScript language server on (see lib/lsp), Monaco's built-in
 * TypeScript would show a second, single-file set of completions, hovers and
 * errors. Monaco registers its providers the first time a TS/JS model is
 * created and never re-reads this, so it is decided once, at startup.
 * Colouring is separate (Monarch) and stays.
 */
export const usesTypescriptServer =
  window.electron.settings.initial.languages.typescriptServer;

if (usesTypescriptServer) {
  const builtInOff = {
    completionItems: false,
    hovers: false,
    documentSymbols: false,
    definitions: false,
    references: false,
    documentHighlights: false,
    rename: false,
    diagnostics: false,
    documentRangeFormattingEdits: false,
    signatureHelp: false,
    onTypeFormattingEdits: false,
    codeActions: false,
    inlayHints: false,
  };
  monaco.typescript.typescriptDefaults.setModeConfiguration(builtInOff);
  monaco.typescript.javascriptDefaults.setModeConfiguration(builtInOff);
}

export { monaco };
