import type * as Monaco from "monaco-editor";
import type * as Lsp from "vscode-languageserver-protocol";

import { monaco } from "@/lib/monaco";

/*
 * Conversions between LSP and Monaco shapes. LSP positions are 0-based;
 * Monaco's lines and columns are 1-based. Both count UTF-16 code units.
 */

export const toLspPosition = (position: Monaco.IPosition): Lsp.Position => ({
  line: position.lineNumber - 1,
  character: position.column - 1,
});

export const toLspRange = (range: Monaco.IRange): Lsp.Range => ({
  start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
  end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
});

export const toMonacoRange = (range: Lsp.Range): Monaco.IRange => ({
  startLineNumber: range.start.line + 1,
  startColumn: range.start.character + 1,
  endLineNumber: range.end.line + 1,
  endColumn: range.end.character + 1,
});

/** One spelling per URI: the server and Monaco may escape characters differently. */
export const uriKey = (uri: string) => monaco.Uri.parse(uri).toString();

export const toTextEdit = (edit: Lsp.TextEdit): Monaco.languages.TextEdit => ({
  range: toMonacoRange(edit.range),
  text: edit.newText,
});

/** Escapes text so markdown shows it as written. */
const escapeMarkdown = (text: string) =>
  text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");

export const toMarkdown = (
  content: Lsp.MarkupContent | Lsp.MarkedString,
): Monaco.IMarkdownString => {
  if (typeof content === "string") return { value: content };
  if ("kind" in content) {
    return {
      value:
        content.kind === "markdown" ? content.value : escapeMarkdown(content.value),
    };
  }
  return { value: `\`\`\`${content.language}\n${content.value}\n\`\`\`` };
};

export const toDocumentation = (
  documentation: string | Lsp.MarkupContent | undefined,
): string | Monaco.IMarkdownString | undefined => {
  if (documentation === undefined) return undefined;
  if (typeof documentation === "string") return documentation;
  return toMarkdown(documentation);
};

export const toHoverContents = (
  contents: Lsp.Hover["contents"],
): Monaco.IMarkdownString[] =>
  (Array.isArray(contents) ? contents : [contents])
    .map(toMarkdown)
    .filter((markdown) => markdown.value.trim() !== "");

// LSP enums start at 1; Monaco's are in a different order or start at 0.

const COMPLETION_KIND_NAMES = [
  "Text",
  "Method",
  "Function",
  "Constructor",
  "Field",
  "Variable",
  "Class",
  "Interface",
  "Module",
  "Property",
  "Unit",
  "Value",
  "Enum",
  "Keyword",
  "Snippet",
  "Color",
  "File",
  "Reference",
  "Folder",
  "EnumMember",
  "Constant",
  "Struct",
  "Event",
  "Operator",
  "TypeParameter",
] as const;

export const toCompletionKind = (kind: Lsp.CompletionItemKind | undefined) => {
  const name = kind ? COMPLETION_KIND_NAMES[kind - 1] : undefined;
  return monaco.languages.CompletionItemKind[name ?? "Property"];
};

/** Same order in both; Monaco's start at 0. */
export const toSymbolKind = (kind: Lsp.SymbolKind) =>
  (kind - 1) as Monaco.languages.SymbolKind;

const DEPRECATED_TAG = 1;

export const toSymbolTags = (
  tags: Lsp.SymbolTag[] | undefined,
): Monaco.languages.SymbolTag[] =>
  tags?.includes(DEPRECATED_TAG) ? [monaco.languages.SymbolTag.Deprecated] : [];

export const toHighlightKind = (kind: Lsp.DocumentHighlightKind | undefined) => {
  if (kind === 2) return monaco.languages.DocumentHighlightKind.Read;
  if (kind === 3) return monaco.languages.DocumentHighlightKind.Write;
  return monaco.languages.DocumentHighlightKind.Text;
};

export const toMarkerSeverity = (
  severity: Lsp.DiagnosticSeverity | undefined,
) => {
  switch (severity) {
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
};

const toMarkerTags = (tags: Lsp.DiagnosticTag[] | undefined) =>
  tags?.flatMap((tag) => {
    if (tag === 1) return [monaco.MarkerTag.Unnecessary];
    if (tag === 2) return [monaco.MarkerTag.Deprecated];
    return [];
  });

export const toMarker = (
  diagnostic: Lsp.Diagnostic,
): Monaco.editor.IMarkerData => {
  const code =
    diagnostic.code === undefined ? undefined : String(diagnostic.code);
  return {
    ...toMonacoRange(diagnostic.range),
    severity: toMarkerSeverity(diagnostic.severity),
    // LSP 3.18 allows markdown messages; markers show plain text.
    message:
      typeof diagnostic.message === "string"
        ? diagnostic.message
        : diagnostic.message.value,
    source: diagnostic.source,
    code:
      code && diagnostic.codeDescription
        ? { value: code, target: monaco.Uri.parse(diagnostic.codeDescription.href) }
        : code,
    tags: toMarkerTags(diagnostic.tags),
    relatedInformation: diagnostic.relatedInformation?.map((info) => ({
      resource: monaco.Uri.parse(info.location.uri),
      message: info.message,
      ...toMonacoRange(info.location.range),
    })),
  };
};

export const toFoldingKind = (kind: string | undefined) =>
  kind ? new monaco.languages.FoldingRangeKind(kind) : undefined;

/** Monaco's Invoke/TriggerCharacter/Incomplete are 0/1/2; LSP's are 1/2/3. */
export const toLspCompletionTrigger = (
  kind: Monaco.languages.CompletionTriggerKind,
): Lsp.CompletionTriggerKind => (kind + 1) as Lsp.CompletionTriggerKind;
