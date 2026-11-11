import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AiAccessModeType, AiProviderType } from "@oscar/validators";

/** Code the user picked in the editor to ask about. */
export type ChatAttachment = {
  id: string;
  path: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  /** Monaco's language id, for the code fence. */
  language: string;
  code: string;
};

/** A message asked for from outside the chat panel, e.g. "Explain this error". */
export type QueuedPrompt = { id: number; text: string };

/** A model from `GET /api/ai/models`. */
export type ChatModel = { provider: AiProviderType["id"]; id: string };

type UseAiChatType = {
  /** The model messages go to; null until the list loads. Remembered across launches. */
  model: ChatModel | null;
  setModel: (model: ChatModel | null) => void;
  /**
   * Whether file changes and commands wait for approval or run straight
   * away. Remembered across launches.
   */
  accessMode: AiAccessModeType;
  setAccessMode: (accessMode: AiAccessModeType) => void;
  /**
   * The conversation's id, for `useChat` and the API, which saves it. Kept
   * across launches, so the last conversation comes back.
   */
  threadId: string;
  isOpen: boolean;
  /** The panel's width, kept while it's closed and when the editor view unmounts. */
  width: number;
  attachments: ChatAttachment[];
  /** Goes up each time something asks for the message box to take focus. */
  focusRequest: number;
  setOpen: (isOpen: boolean) => void;
  toggle: () => void;
  setWidth: (width: number) => void;
  /** Opens the panel and puts the cursor in its message box. */
  openAndFocus: () => void;
  addAttachment: (attachment: Omit<ChatAttachment, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  /**
   * Sent by the chat panel as soon as it can (signed in, a model picked, no
   * reply running). If the chat is busy, it goes into the message box instead.
   */
  queuedPrompt: QueuedPrompt | null;
  /** Opens the panel and sends `text` as the next message. */
  ask: (text: string) => void;
  clearQueuedPrompt: (id: number) => void;
  /** Starts a new conversation and drops the attachments. */
  newChat: () => void;
};

let nextAttachmentId = 0;
let nextPromptId = 1;

/** The AI chat panel beside the editor. */
export const useAiChat = create<UseAiChatType>()(
  persist(
    (set) => ({
      model: null,
      setModel: (model) => set({ model }),
      accessMode: "approval",
      setAccessMode: (accessMode) => set({ accessMode }),
      threadId: crypto.randomUUID(),
      isOpen: false,
      width: 360,
      attachments: [],
      focusRequest: 0,
      setOpen: (isOpen) => set({ isOpen }),
      toggle: () =>
        set((state) =>
          state.isOpen
            ? { isOpen: false }
            : { isOpen: true, focusRequest: state.focusRequest + 1 },
        ),
      setWidth: (width) => set({ width }),
      openAndFocus: () =>
        set((state) => ({
          isOpen: true,
          focusRequest: state.focusRequest + 1,
        })),
      addAttachment: (attachment) =>
        set((state) => {
          // The same lines of the same file once is enough.
          const isDuplicate = state.attachments.some(
            (existing) =>
              existing.path === attachment.path &&
              existing.startLine === attachment.startLine &&
              existing.endLine === attachment.endLine,
          );
          return {
            isOpen: true,
            focusRequest: state.focusRequest + 1,
            attachments: isDuplicate
              ? state.attachments
              : [
                  ...state.attachments,
                  { ...attachment, id: String(nextAttachmentId++) },
                ],
          };
        }),
      removeAttachment: (id) =>
        set((state) => ({
          attachments: state.attachments.filter((item) => item.id !== id),
        })),
      clearAttachments: () => set({ attachments: [] }),
      queuedPrompt: null,
      ask: (text) =>
        set((state) => ({
          isOpen: true,
          focusRequest: state.focusRequest + 1,
          queuedPrompt: { id: nextPromptId++, text },
        })),
      clearQueuedPrompt: (id) =>
        set((state) =>
          state.queuedPrompt?.id === id ? { queuedPrompt: null } : {},
        ),
      newChat: () => set({ threadId: crypto.randomUUID(), attachments: [] }),
    }),
    {
      name: "oscar-ai-chat",
      // Only the choices worth keeping; the rest starts fresh each launch.
      partialize: (state) => ({
        model: state.model,
        accessMode: state.accessMode,
        width: state.width,
        threadId: state.threadId,
      }),
    },
  ),
);
