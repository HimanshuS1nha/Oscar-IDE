import type * as Monaco from "monaco-editor";
import type * as Lsp from "vscode-languageserver-protocol";

import {
  toCompletionKind,
  toDocumentation,
  toFoldingKind,
  toHighlightKind,
  toHoverContents,
  toLspCompletionTrigger,
  toLspPosition,
  toLspRange,
  toMarker,
  toMonacoRange,
  toSymbolKind,
  toSymbolTags,
  toTextEdit,
} from "@/lib/lsp/convert";
import { showableUris } from "@/lib/lsp/files";
import type { ServerSession } from "@/lib/lsp/session";
import { toMonacoWorkspaceEdit } from "@/lib/lsp/workspace-edit";
import { monaco } from "@/lib/monaco";

/**
 * Monaco commands that hand a server command or code action back to the
 * session. Their arguments are the server's language, then the command or action.
 */
export const EXECUTE_COMMAND_ID = "oscar.languageServer.executeCommand";
export const APPLY_CODE_ACTION_ID = "oscar.languageServer.applyCodeAction";

type Locations = Lsp.Location | Lsp.Location[] | Lsp.LocationLink[] | null;

const isCommand = (value: Lsp.Command | Lsp.CodeAction): value is Lsp.Command =>
  typeof value.command === "string";

/** The original LSP item behind each Monaco suggestion, for `completionItem/resolve`. */
const lspItems = new WeakMap<Monaco.languages.CompletionItem, Lsp.CompletionItem>();

/**
 * Registers Monaco providers backed by `session`, using what its server
 * said it supports. Disposed when the session ends.
 */
export const registerProviders = (session: ServerSession): Monaco.IDisposable => {
  const { rpc, capabilities: caps, spec } = session;
  // Only real files; diff sides and previews have other schemes.
  const SELECTOR: Monaco.languages.LanguageSelector = spec.monacoLanguages.map(
    (language) => ({ language, scheme: "file" }),
  );
  const disposables: Monaco.IDisposable[] = [];
  const add = (disposable: Monaco.IDisposable) => disposables.push(disposable);

  const textDocument = (model: Monaco.editor.ITextModel) => ({
    uri: model.uri.toString(),
  });

  /** Position params for `model`, or null if the server doesn't have the file. */
  const at = (model: Monaco.editor.ITextModel, position: Monaco.IPosition) =>
    session.isOpen(model)
      ? { textDocument: textDocument(model), position: toLspPosition(position) }
      : null;

  const toMonacoCommand = (
    command: Lsp.Command | undefined,
  ): Monaco.languages.Command | undefined => {
    if (!command) return undefined;
    if (command.command.startsWith("editor.action.")) {
      return { id: command.command, title: command.title, arguments: command.arguments };
    }
    return {
      id: EXECUTE_COMMAND_ID,
      title: command.title,
      arguments: [spec.language, command],
    };
  };

  /** Locations as Monaco links, pointing at models Monaco can show. */
  const toLocations = async (
    result: Locations,
  ): Promise<Monaco.languages.LocationLink[]> => {
    if (!result) return [];
    const list = Array.isArray(result) ? result : [result];
    const uris = await showableUris(
      list.map((item) => ("targetUri" in item ? item.targetUri : item.uri)),
    );
    return list.map((item) =>
      "targetUri" in item
        ? {
            uri: uris.get(item.targetUri)!,
            range: toMonacoRange(item.targetRange),
            targetSelectionRange: toMonacoRange(item.targetSelectionRange),
            originSelectionRange: item.originSelectionRange
              ? toMonacoRange(item.originSelectionRange)
              : undefined,
          }
        : { uri: uris.get(item.uri)!, range: toMonacoRange(item.range) },
    );
  };

  const navigation =
    (method: string) =>
    async (
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
      token: Monaco.CancellationToken,
    ) => {
      const params = at(model, position);
      if (!params) return null;
      return toLocations(await rpc.request<Locations>(method, params, token));
    };

  // --- Completion -------------------------------------------------------

  if (caps.completionProvider) {
    const completion = caps.completionProvider;
    add(
      monaco.languages.registerCompletionItemProvider(SELECTOR, {
        triggerCharacters: completion.triggerCharacters,
        provideCompletionItems: async (model, position, context, token) => {
          const params = at(model, position);
          if (!params) return { suggestions: [] };
          const result = await rpc.request<
            Lsp.CompletionList | Lsp.CompletionItem[] | null
          >(
            "textDocument/completion",
            {
              ...params,
              context: {
                triggerKind: toLspCompletionTrigger(context.triggerKind),
                triggerCharacter: context.triggerCharacter,
              },
            } satisfies Lsp.CompletionParams,
            token,
          );
          if (!result) return { suggestions: [] };

          const items = Array.isArray(result) ? result : result.items;
          const defaults = Array.isArray(result) ? undefined : result.itemDefaults;

          // Without an edit range, replace the word being typed.
          const word = model.getWordUntilPosition(position);
          const wordEnd =
            model.getWordAtPosition(position)?.endColumn ?? position.column;
          const line = position.lineNumber;
          const defaultRange = {
            insert: new monaco.Range(line, word.startColumn, line, position.column),
            replace: new monaco.Range(line, word.startColumn, line, wordEnd),
          };

          const suggestions = items.map((item) => {
            const lspItem: Lsp.CompletionItem = {
              ...item,
              data: item.data ?? defaults?.data,
            };
            const editRange = defaults?.editRange;
            const textEdit =
              item.textEdit ??
              (editRange
                ? "insert" in editRange
                  ? {
                      newText: item.textEditText ?? item.insertText ?? item.label,
                      insert: editRange.insert,
                      replace: editRange.replace,
                    }
                  : {
                      newText: item.textEditText ?? item.insertText ?? item.label,
                      range: editRange,
                    }
                : undefined);
            const insertTextFormat =
              item.insertTextFormat ?? defaults?.insertTextFormat;

            const suggestion: Monaco.languages.CompletionItem = {
              label: item.labelDetails
                ? {
                    label: item.label,
                    detail: item.labelDetails.detail,
                    description: item.labelDetails.description,
                  }
                : item.label,
              kind: toCompletionKind(item.kind),
              tags:
                item.deprecated || item.tags?.includes(1)
                  ? [monaco.languages.CompletionItemTag.Deprecated]
                  : undefined,
              detail: item.detail,
              documentation: toDocumentation(item.documentation),
              sortText: item.sortText,
              filterText: item.filterText,
              preselect: item.preselect,
              insertText: textEdit?.newText ?? item.insertText ?? item.label,
              insertTextRules:
                insertTextFormat === 2
                  ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  : undefined,
              range: textEdit
                ? "range" in textEdit
                  ? toMonacoRange(textEdit.range)
                  : {
                      insert: toMonacoRange(textEdit.insert),
                      replace: toMonacoRange(textEdit.replace),
                    }
                : defaultRange,
              commitCharacters: item.commitCharacters ?? defaults?.commitCharacters,
              additionalTextEdits: item.additionalTextEdits?.map(toTextEdit),
              command: toMonacoCommand(item.command),
            };
            lspItems.set(suggestion, lspItem);
            return suggestion;
          });

          return {
            suggestions,
            incomplete: !Array.isArray(result) && result.isIncomplete,
          };
        },
        resolveCompletionItem: completion.resolveProvider
          ? async (suggestion, token) => {
              const lspItem = lspItems.get(suggestion);
              if (!lspItem) return suggestion;
              const resolved = await rpc.request<Lsp.CompletionItem>(
                "completionItem/resolve",
                lspItem,
                token,
              );
              // Auto-imports arrive here as additional edits.
              suggestion.detail = resolved.detail ?? suggestion.detail;
              suggestion.documentation =
                toDocumentation(resolved.documentation) ?? suggestion.documentation;
              if (resolved.additionalTextEdits) {
                suggestion.additionalTextEdits =
                  resolved.additionalTextEdits.map(toTextEdit);
              }
              if (resolved.command) {
                suggestion.command = toMonacoCommand(resolved.command);
              }
              return suggestion;
            }
          : undefined,
      }),
    );
  }

  // --- Hover and signature help -----------------------------------------

  if (caps.hoverProvider) {
    add(
      monaco.languages.registerHoverProvider(SELECTOR, {
        provideHover: async (model, position, token) => {
          const params = at(model, position);
          if (!params) return null;
          const hover = await rpc.request<Lsp.Hover | null>(
            "textDocument/hover",
            params,
            token,
          );
          if (!hover) return null;
          const contents = toHoverContents(hover.contents);
          if (contents.length === 0) return null;
          return {
            contents,
            range: hover.range ? toMonacoRange(hover.range) : undefined,
          };
        },
      }),
    );
  }

  if (caps.signatureHelpProvider) {
    const signatureHelp = caps.signatureHelpProvider;
    /** The last answer, which the server wants back when the popup updates. */
    let active: Lsp.SignatureHelp | undefined;
    add(
      monaco.languages.registerSignatureHelpProvider(SELECTOR, {
        signatureHelpTriggerCharacters: signatureHelp.triggerCharacters,
        signatureHelpRetriggerCharacters: signatureHelp.retriggerCharacters,
        provideSignatureHelp: async (model, position, token, context) => {
          const params = at(model, position);
          if (!params) return null;
          const result = await rpc.request<Lsp.SignatureHelp | null>(
            "textDocument/signatureHelp",
            {
              ...params,
              context: {
                // Same numbering: Invoke 1, TriggerCharacter 2, ContentChange 3.
                triggerKind: context.triggerKind as number as Lsp.SignatureHelpTriggerKind,
                triggerCharacter: context.triggerCharacter,
                isRetrigger: context.isRetrigger,
                activeSignatureHelp: context.isRetrigger ? active : undefined,
              },
            } satisfies Lsp.SignatureHelpParams,
            token,
          );
          active = result ?? undefined;
          if (!result || result.signatures.length === 0) return null;
          return {
            value: {
              signatures: result.signatures.map((signature) => ({
                label: signature.label,
                documentation: toDocumentation(signature.documentation),
                parameters: (signature.parameters ?? []).map((parameter) => ({
                  label: parameter.label,
                  documentation: toDocumentation(parameter.documentation),
                })),
                activeParameter: signature.activeParameter ?? undefined,
              })),
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0,
            },
            dispose: () => {},
          };
        },
      }),
    );
  }

  // --- Navigation -------------------------------------------------------

  if (caps.definitionProvider) {
    add(
      monaco.languages.registerDefinitionProvider(SELECTOR, {
        provideDefinition: navigation("textDocument/definition"),
      }),
    );
  }
  if (caps.typeDefinitionProvider) {
    add(
      monaco.languages.registerTypeDefinitionProvider(SELECTOR, {
        provideTypeDefinition: navigation("textDocument/typeDefinition"),
      }),
    );
  }
  if (caps.implementationProvider) {
    add(
      monaco.languages.registerImplementationProvider(SELECTOR, {
        provideImplementation: navigation("textDocument/implementation"),
      }),
    );
  }
  if (caps.declarationProvider) {
    add(
      monaco.languages.registerDeclarationProvider(SELECTOR, {
        provideDeclaration: navigation("textDocument/declaration"),
      }),
    );
  }

  if (caps.referencesProvider) {
    add(
      monaco.languages.registerReferenceProvider(SELECTOR, {
        provideReferences: async (model, position, context, token) => {
          const params = at(model, position);
          if (!params) return null;
          const result = await rpc.request<Lsp.Location[] | null>(
            "textDocument/references",
            {
              ...params,
              context: { includeDeclaration: context.includeDeclaration },
            } satisfies Lsp.ReferenceParams,
            token,
          );
          return toLocations(result);
        },
      }),
    );
  }

  if (caps.documentHighlightProvider) {
    add(
      monaco.languages.registerDocumentHighlightProvider(SELECTOR, {
        provideDocumentHighlights: async (model, position, token) => {
          const params = at(model, position);
          if (!params) return null;
          const result = await rpc.request<Lsp.DocumentHighlight[] | null>(
            "textDocument/documentHighlight",
            params,
            token,
          );
          return (result ?? []).map((highlight) => ({
            range: toMonacoRange(highlight.range),
            kind: toHighlightKind(highlight.kind),
          }));
        },
      }),
    );
  }

  if (caps.documentSymbolProvider) {
    const toSymbol = (
      symbol: Lsp.DocumentSymbol,
    ): Monaco.languages.DocumentSymbol => ({
      name: symbol.name,
      detail: symbol.detail ?? "",
      kind: toSymbolKind(symbol.kind),
      tags: toSymbolTags(symbol.tags),
      range: toMonacoRange(symbol.range),
      selectionRange: toMonacoRange(symbol.selectionRange),
      children: symbol.children?.map(toSymbol),
    });
    add(
      monaco.languages.registerDocumentSymbolProvider(SELECTOR, {
        displayName: spec.name,
        provideDocumentSymbols: async (model, token) => {
          if (!session.isOpen(model)) return null;
          const result = await rpc.request<
            Lsp.DocumentSymbol[] | Lsp.SymbolInformation[] | null
          >(
            "textDocument/documentSymbol",
            { textDocument: textDocument(model) },
            token,
          );
          return (result ?? []).map((symbol) =>
            "location" in symbol
              ? {
                  name: symbol.name,
                  detail: "",
                  kind: toSymbolKind(symbol.kind),
                  tags: toSymbolTags(symbol.tags),
                  containerName: symbol.containerName,
                  range: toMonacoRange(symbol.location.range),
                  selectionRange: toMonacoRange(symbol.location.range),
                }
              : toSymbol(symbol),
          );
        },
      }),
    );
  }

  // --- Rename -----------------------------------------------------------

  if (caps.renameProvider) {
    const canPrepare =
      typeof caps.renameProvider === "object" && caps.renameProvider.prepareProvider;
    add(
      monaco.languages.registerRenameProvider(SELECTOR, {
        provideRenameEdits: async (model, position, newName, token) => {
          const params = at(model, position);
          if (!params) return null;
          const edit = await rpc.request<Lsp.WorkspaceEdit | null>(
            "textDocument/rename",
            { ...params, newName } satisfies Lsp.RenameParams,
            token,
          );
          if (!edit) return null;
          try {
            return await toMonacoWorkspaceEdit(edit);
          } catch (error) {
            return {
              edits: [],
              rejectReason: error instanceof Error ? error.message : String(error),
            };
          }
        },
        resolveRenameLocation: canPrepare
          ? async (model, position, token) => {
              const params = at(model, position);
              if (!params) return null;
              const result = await rpc.request<Lsp.PrepareRenameResult | null>(
                "textDocument/prepareRename",
                params,
                token,
              );
              const word = model.getWordAtPosition(position);
              const wordRange = word
                ? new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn,
                  )
                : new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column,
                  );
              if (!result) {
                return {
                  range: wordRange,
                  text: word?.word ?? "",
                  rejectReason: "You cannot rename this element.",
                };
              }
              if ("defaultBehavior" in result) {
                return { range: wordRange, text: word?.word ?? "" };
              }
              if ("placeholder" in result) {
                return {
                  range: toMonacoRange(result.range),
                  text: result.placeholder,
                };
              }
              const range = toMonacoRange(result);
              return { range, text: model.getValueInRange(range) };
            }
          : undefined,
      }),
    );
  }

  // --- Formatting -------------------------------------------------------

  const formattingOptions = (
    options: Monaco.languages.FormattingOptions,
  ): Lsp.FormattingOptions => ({
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces,
  });

  if (caps.documentFormattingProvider) {
    add(
      monaco.languages.registerDocumentFormattingEditProvider(SELECTOR, {
        displayName: spec.name,
        provideDocumentFormattingEdits: async (model, options, token) => {
          if (!session.isOpen(model)) return null;
          const edits = await rpc.request<Lsp.TextEdit[] | null>(
            "textDocument/formatting",
            {
              textDocument: textDocument(model),
              options: formattingOptions(options),
            } satisfies Lsp.DocumentFormattingParams,
            token,
          );
          return edits?.map(toTextEdit) ?? [];
        },
      }),
    );
  }

  if (caps.documentRangeFormattingProvider) {
    add(
      monaco.languages.registerDocumentRangeFormattingEditProvider(SELECTOR, {
        displayName: spec.name,
        provideDocumentRangeFormattingEdits: async (model, range, options, token) => {
          if (!session.isOpen(model)) return null;
          const edits = await rpc.request<Lsp.TextEdit[] | null>(
            "textDocument/rangeFormatting",
            {
              textDocument: textDocument(model),
              range: toLspRange(range),
              options: formattingOptions(options),
            } satisfies Lsp.DocumentRangeFormattingParams,
            token,
          );
          return edits?.map(toTextEdit) ?? [];
        },
      }),
    );
  }

  if (caps.documentOnTypeFormattingProvider) {
    const onType = caps.documentOnTypeFormattingProvider;
    add(
      monaco.languages.registerOnTypeFormattingEditProvider(SELECTOR, {
        autoFormatTriggerCharacters: [
          onType.firstTriggerCharacter,
          ...(onType.moreTriggerCharacter ?? []),
        ],
        provideOnTypeFormattingEdits: async (model, position, ch, options, token) => {
          const params = at(model, position);
          if (!params) return null;
          const edits = await rpc.request<Lsp.TextEdit[] | null>(
            "textDocument/onTypeFormatting",
            {
              ...params,
              ch,
              options: formattingOptions(options),
            } satisfies Lsp.DocumentOnTypeFormattingParams,
            token,
          );
          return edits?.map(toTextEdit) ?? [];
        },
      }),
    );
  }

  // --- Structure --------------------------------------------------------

  if (caps.foldingRangeProvider) {
    add(
      monaco.languages.registerFoldingRangeProvider(SELECTOR, {
        provideFoldingRanges: async (model, _context, token) => {
          if (!session.isOpen(model)) return null;
          const ranges = await rpc.request<Lsp.FoldingRange[] | null>(
            "textDocument/foldingRange",
            { textDocument: textDocument(model) },
            token,
          );
          return (ranges ?? []).map((range) => ({
            start: range.startLine + 1,
            end: range.endLine + 1,
            kind: toFoldingKind(range.kind),
          }));
        },
      }),
    );
  }

  if (caps.selectionRangeProvider) {
    add(
      monaco.languages.registerSelectionRangeProvider(SELECTOR, {
        provideSelectionRanges: async (model, positions, token) => {
          if (!session.isOpen(model)) return null;
          const result = await rpc.request<Lsp.SelectionRange[] | null>(
            "textDocument/selectionRange",
            {
              textDocument: textDocument(model),
              positions: positions.map(toLspPosition),
            } satisfies Lsp.SelectionRangeParams,
            token,
          );
          return (result ?? []).map((selection) => {
            const ranges: Monaco.languages.SelectionRange[] = [];
            for (
              let current: Lsp.SelectionRange | undefined = selection;
              current;
              current = current.parent
            ) {
              ranges.push({ range: toMonacoRange(current.range) });
            }
            return ranges;
          });
        },
      }),
    );
  }

  // --- Code actions -----------------------------------------------------

  if (caps.codeActionProvider) {
    const kinds =
      typeof caps.codeActionProvider === "object"
        ? caps.codeActionProvider.codeActionKinds
        : undefined;
    add(
      monaco.languages.registerCodeActionProvider(
        SELECTOR,
        {
          provideCodeActions: async (model, range, context, token) => {
            if (!session.isOpen(model)) return null;
            const diagnostics = session.diagnosticsFor(model, context.markers);
            const result = await rpc.request<(Lsp.Command | Lsp.CodeAction)[] | null>(
              "textDocument/codeAction",
              {
                textDocument: textDocument(model),
                range: toLspRange(range),
                context: {
                  diagnostics,
                  only: context.only ? [context.only] : undefined,
                  // Monaco: Invoke 1, Auto 2. LSP: Invoked 1, Automatic 2.
                  triggerKind: context.trigger as number as Lsp.CodeActionTriggerKind,
                },
              } satisfies Lsp.CodeActionParams,
              token,
            );

            const actions = (result ?? []).map(
              (action): Monaco.languages.CodeAction => {
                if (isCommand(action)) {
                  return { title: action.title, command: toMonacoCommand(action) };
                }
                return {
                  title: action.title,
                  kind: action.kind,
                  isPreferred: action.isPreferred,
                  disabled: action.disabled?.reason,
                  diagnostics: action.diagnostics?.map(toMarker),
                  // Applied by the session, which can open the files it touches.
                  command: {
                    id: APPLY_CODE_ACTION_ID,
                    title: action.title,
                    arguments: [spec.language, action],
                  },
                };
              },
            );
            return { actions, dispose: () => {} };
          },
        },
        { providedCodeActionKinds: kinds },
      ),
    );
  }

  return {
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    },
  };
};
