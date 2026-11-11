import { AxiosError, isCancel } from "axios";
import { toast } from "react-hot-toast";

import type {
  AiCommitMessageRequestType,
  AiCommitMessageResponseType,
} from "@oscar/validators";

import { useAiChat, type ChatModel } from "@/hooks/use-ai-chat";
import { axios } from "@/lib/axios";
import { useGitUi } from "@/lib/git-actions";
import { ipcErrorMessage } from "@/lib/ipc-error";
import { queryClient } from "@/lib/query-client";
import { aiModelsQuery } from "@/queries/ai-models-query";
import { refreshAiUsage } from "@/queries/ai-usage-query";

import { API_ROUTES } from "@/constants/api-routes";

/*
 * Commit message suggestions: the Source Control view's sparkle button sends
 * the changes the next commit would include to `POST /api/ai/commit-message`
 * and puts the answer in the message box.
 */

/** The request in flight, so a second click cancels it. */
let inFlight: AbortController | null = null;

/** The chat's model, or before one was picked there, the first the server offers. */
const chosenModel = async (): Promise<ChatModel | null> => {
  const chat = useAiChat.getState().model;
  if (chat) return chat;
  const providers = await queryClient.fetchQuery(aiModelsQuery());
  const provider = providers.find((candidate) => candidate.models.length > 0);
  return provider ? { provider: provider.id, id: provider.models[0].id } : null;
};

const failureMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: unknown } | undefined)
      ?.message;
    if (typeof message === "string") return message;
    if (!error.response) return "Couldn't reach the Oscar server.";
  }
  return ipcErrorMessage(error);
};

/** Cancels a suggestion in progress. */
export const cancelCommitMessageSuggestion = () => {
  inFlight?.abort();
  inFlight = null;
  useGitUi.setState({ suggestingMessage: false });
};

/**
 * Drafts a commit message for the staged changes (or every change, with
 * nothing staged) and puts it in the message box, replacing what's there.
 */
export const suggestCommitMessage = async () => {
  if (inFlight) {
    cancelCommitMessageSuggestion();
    return;
  }
  const controller = new AbortController();
  inFlight = controller;
  useGitUi.setState({ suggestingMessage: true });

  try {
    if (!(await window.electron.auth.getToken())) {
      toast.error("Sign in to get commit message suggestions.");
      return;
    }

    const context = await window.electron.git.commitMessageContext();
    if (!context.changes.trim()) {
      toast.error("There are no changes to describe.");
      return;
    }

    const model = await chosenModel();
    if (!model) {
      toast.error("No AI model is available. Pick one in the chat panel.");
      return;
    }
    if (controller.signal.aborted) return;

    const request: AiCommitMessageRequestType = {
      provider: model.provider,
      model: model.id,
      changes: context.changes,
      recentCommits: context.recentCommits,
      branch: context.branch,
    };
    const { data } = await axios.post<AiCommitMessageResponseType>(
      API_ROUTES.ai.commitMessage,
      request,
      { signal: controller.signal },
    );
    if (controller.signal.aborted) return;
    if (!data.message.trim()) {
      toast.error("The model didn't suggest a message. Try again.");
      return;
    }
    useGitUi.getState().setCommitMessage(data.message);
  } catch (error) {
    if (controller.signal.aborted || isCancel(error)) return;
    console.error("Commit message suggestion failed", error);
    toast.error(`Couldn't suggest a commit message: ${failureMessage(error)}`);
  } finally {
    // Billed even when it failed after the model answered.
    refreshAiUsage();
    if (inFlight === controller) {
      inFlight = null;
      useGitUi.setState({ suggestingMessage: false });
    }
  }
};
