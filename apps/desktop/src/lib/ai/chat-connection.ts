import { fetchServerSentEvents } from "@tanstack/ai-react";

import { useAiChat } from "@/hooks/use-ai-chat";
import { queryClient } from "@/lib/query-client";

import { API_ROUTES } from "@/constants/api-routes";
import { QUERY_KEYS } from "@/constants/query-keys";

/**
 * The AI chat's connection to the API (`POST /api/ai/chat`), streamed as
 * Server-Sent Events. Each request is signed with the saved token, as the
 * axios client does. `GET /api/ai/chat` loads a saved conversation when the
 * chat mounts (`useChat`'s `persistence: true`).
 *
 * TanStack reports a failed request only as "HTTP error! status: 400 …", or
 * "Stream response body read failed" when the API can't be reached. This
 * shows the API's own message instead, and signs out on a 401.
 */

/** Why the last request failed, read from its JSON body. */
let lastFailure: string | undefined;
let lastStatus: number | undefined;

const fetchChat: typeof fetch = async (input, init) => {
  lastFailure = undefined;
  const response = await fetch(input, init);
  lastStatus = response.status;
  if (response.ok) return response;

  if (response.status === 401) {
    // Expired, or the account is gone: show the sign-in prompt instead.
    await window.electron.auth.clearToken();
    void queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.getUser] });
    lastFailure = "Your session has expired. Sign in again to chat.";
    return response;
  }
  try {
    const body = (await response.clone().json()) as { message?: unknown };
    if (typeof body.message === "string") lastFailure = body.message;
  } catch {
    // Not JSON: keep TanStack's message.
  }
  return response;
};

const sse = fetchServerSentEvents(
  `${import.meta.env.VITE_API_URL}/api${API_ROUTES.ai.chat}`,
  async () => {
    const token = await window.electron.auth.getToken();
    return {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      fetchClient: fetchChat,
    };
  },
);

const describeFailure = (error: unknown) => {
  if (lastFailure) return lastFailure;
  // fetch itself threw: the API isn't running or the network is down.
  if (error instanceof Error && error.cause instanceof TypeError) {
    return "Couldn't reach the server. Check that the API is running.";
  }
  return error instanceof Error ? error.message : String(error);
};

const NO_HISTORY = { messages: [], activeRun: null, interrupts: null };

export const chatConnection: typeof sse = {
  ...sse,
  async *connect(...args) {
    try {
      yield* sse.connect(...args);
    } catch (error) {
      throw new Error(describeFailure(error), { cause: error });
    }
  },
  async hydrate(...args) {
    // Signed out: there's nothing to load.
    if (!(await window.electron.auth.getToken())) return NO_HISTORY;
    try {
      return await sse.hydrate!(...args);
    } catch (error) {
      if (lastStatus === 404) {
        // Another account's conversation (the last one used on this
        // computer): start a new one instead.
        useAiChat.getState().newChat();
        return NO_HISTORY;
      }
      throw new Error(`Couldn't load this chat: ${describeFailure(error)}`, {
        cause: error,
      });
    }
  },
};
