import type * as Monaco from "monaco-editor";

import {
  AI_COMPLETION_LIMITS,
  type AiCompletionRequestType,
  type AiCompletionResponseType,
} from "@oscar/validators";

import { useAiChat } from "@/hooks/use-ai-chat";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useSettings } from "@/hooks/use-settings";
import { axios } from "@/lib/axios";
import { monaco } from "@/lib/monaco";
import { isSameOrInside } from "@/lib/paths";

import { API_ROUTES } from "@/constants/api-routes";

/**
 * Inline completions: grey suggestions in the editor from the AI, accepted
 * with Tab. `POST /api/ai/complete` gets the code around the cursor and
 * returns the text to insert.
 */

/**
 * Wait this long after the last keystroke before asking for a suggestion.
 * Monaco does the waiting, and cancels the request if typing resumes.
 */
const DEBOUNCE_MS = 500;

/**
 * How much of the file the model sees. The lines just before the cursor
 * matter most; the lines after it tell the model where to stop. Character
 * caps keep long lines (minified code, data) from making requests huge.
 */
const CONTEXT = {
  linesBefore: 150,
  linesAfter: 50,
  charactersBefore: AI_COMPLETION_LIMITS.prefixCharacters,
  charactersAfter: AI_COMPLETION_LIMITS.suffixCharacters,
} as const;

/** What may follow the cursor: nothing, or brackets and quotes the editor closed. */
const AUTO_CLOSED = /^[\s)\]}'"`;,]*$/;

/** The code around the cursor, cut to `CONTEXT`. */
const contextAround = (
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
) => {
  const lastLine = model.getLineCount();
  const firstLine = Math.max(1, position.lineNumber - CONTEXT.linesBefore);
  const endLine = Math.min(lastLine, position.lineNumber + CONTEXT.linesAfter);

  const prefix = model.getValueInRange({
    startLineNumber: firstLine,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
  const suffix = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: endLine,
    endColumn: model.getLineMaxColumn(endLine),
  });

  return {
    prefix: prefix.slice(-CONTEXT.charactersBefore),
    suffix: suffix.slice(0, CONTEXT.charactersAfter),
  };
};

/** The file's path in the open folder, or its full path outside it. */
const pathOf = (model: Monaco.editor.ITextModel) => {
  const path = model.uri.fsPath;
  const folder = useSelectedFolder.getState().selectedFolderPath;
  return folder && isSameOrInside(path, folder)
    ? path.slice(folder.replace(/[\\/]+$/, "").length + 1)
    : path;
};

/** The model the setting names, or else the chat's. */
const chosenModel = () =>
  useSettings.getState().settings.ai.inlineCompletionsModel ??
  useAiChat.getState().model;

/**
 * The last suggestion, so typing what it suggests keeps showing the rest
 * of it without asking again.
 */
let last: {
  uri: string;
  prefix: string;
  suffix: string;
  completion: string;
} | null = null;

const reuseLast = (uri: string, prefix: string, suffix: string) => {
  if (!last || last.uri !== uri || last.suffix !== suffix) return null;
  if (!prefix.startsWith(last.prefix)) return null;
  const typed = prefix.slice(last.prefix.length);
  if (!last.completion.startsWith(typed)) return null;
  const rest = last.completion.slice(typed.length);
  return rest || null;
};

const askForCompletion = async (
  request: AiCompletionRequestType,
  token: Monaco.CancellationToken,
) => {
  const controller = new AbortController();
  const listener = token.onCancellationRequested(() => controller.abort());
  try {
    const { data } = await axios.post<AiCompletionResponseType>(
      API_ROUTES.ai.complete,
      request,
      { signal: controller.signal },
    );
    return data.completion;
  } finally {
    listener.dispose();
  }
};

const provider: Monaco.languages.InlineCompletionsProvider = {
  debounceDelayMs: DEBOUNCE_MS,

  async provideInlineCompletions(model, position, _context, token) {
    const none = { items: [] };
    if (token.isCancellationRequested) return none;

    const line = model.getLineContent(position.lineNumber);
    // Only at the end of a line, or before closing characters the editor
    // typed itself (the ")" after "("), so a suggestion never lands in the
    // middle of code.
    if (!AUTO_CLOSED.test(line.slice(position.column - 1))) return none;

    const choice = chosenModel();
    if (!choice) return none;

    const uri = model.uri.toString();
    const { prefix, suffix } = contextAround(model, position);
    const at = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column,
    );

    const reused = reuseLast(uri, prefix, suffix);
    if (reused) return { items: [{ insertText: reused, range: at }] };

    // Signed out: there's no one to ask.
    if (!(await window.electron.auth.getToken())) return none;
    if (token.isCancellationRequested) return none;

    let completion: string;
    try {
      completion = await askForCompletion(
        {
          provider: choice.provider,
          model: choice.id,
          path: pathOf(model),
          language: model.getLanguageId(),
          prefix,
          suffix,
        },
        token,
      );
    } catch {
      // Cancelled, offline, or the model failed: just no suggestion.
      return none;
    }
    if (token.isCancellationRequested || !completion.trim()) return none;

    last = { uri, prefix, suffix, completion };
    return { items: [{ insertText: completion, range: at }] };
  },

  disposeInlineCompletions() {},
};

let registration: Monaco.IDisposable | null = null;

/** Registers the provider while the "Inline completions" setting is on. */
const apply = (enabled: boolean) => {
  if (enabled && !registration) {
    // Only files on disk: not diff sides or previews.
    registration = monaco.languages.registerInlineCompletionsProvider(
      { language: "*", scheme: "file" },
      provider,
    );
  } else if (!enabled && registration) {
    registration.dispose();
    registration = null;
    last = null;
  }
};

apply(useSettings.getState().settings.ai.inlineCompletions);
const stopListening = useSettings.subscribe((state) =>
  apply(state.settings.ai.inlineCompletions),
);

// Vite reloads this module on edits; drop the old provider and listener.
import.meta.hot?.dispose(() => {
  stopListening();
  apply(false);
});
