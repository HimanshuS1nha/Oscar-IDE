import { create } from "zustand";

/*
 * Commands that wait for the user's approval in full access mode, because
 * `destructiveCommandReason` flagged them. TanStack's approval step is per
 * tool, not per call, so the app's `bash` tool asks here instead: it waits on
 * `confirmCommand` while the chat shows the call's Approve / Deny buttons.
 */

type PendingCommand = {
  command: string;
  /** Why it asks, such as "discards uncommitted changes". */
  reason: string;
};

export const useCommandConfirmations = create<{
  /** By tool call id. */
  pending: Record<string, PendingCommand>;
}>(() => ({ pending: {} }));

const resolvers = new Map<string, (approved: boolean) => void>();

const settle = (toolCallId: string, approved: boolean) => {
  const resolve = resolvers.get(toolCallId);
  if (!resolve) return;
  resolvers.delete(toolCallId);
  useCommandConfirmations.setState(({ pending }) => {
    const rest = { ...pending };
    delete rest[toolCallId];
    return { pending: rest };
  });
  resolve(approved);
};

/**
 * Waits for the user to approve or deny the command. Stopping the chat
 * (`signal`) counts as denying it.
 */
export const confirmCommand = ({
  toolCallId,
  command,
  reason,
  signal,
}: PendingCommand & { toolCallId: string; signal?: AbortSignal }) => {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    resolvers.set(toolCallId, resolve);
    useCommandConfirmations.setState(({ pending }) => ({
      pending: { ...pending, [toolCallId]: { command, reason } },
    }));
    signal?.addEventListener("abort", () => settle(toolCallId, false), {
      once: true,
    });
  });
};

/** The user's answer from the chat. */
export const answerCommand = (toolCallId: string, approved: boolean) =>
  settle(toolCallId, approved);

/** Denies every waiting command: the chat they belong to is going away. */
export const denyAllCommands = () => {
  for (const toolCallId of [...resolvers.keys()]) settle(toolCallId, false);
};
