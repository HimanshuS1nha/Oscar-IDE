import { useChat, type UIMessage } from "@tanstack/ai-react";
import {
  ArrowUpIcon,
  FileCodeIcon,
  MessageSquarePlusIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import MessageText from "@/components/ai/message-text";
import AccessModePicker from "@/components/ai/access-mode-picker";
import ModelPicker from "@/components/ai/model-picker";
import ToolCall, { type ToolResultPart } from "@/components/ai/tool-call";
import TurnChanges from "@/components/ai/turn-changes";
import UsageMeter from "@/components/ai/usage-meter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useAiChat, type ChatAttachment } from "@/hooks/use-ai-chat";
import { useAiUsage } from "@/hooks/use-ai-usage";
import { useHotkeyLabel } from "@/hooks/use-hotkey-label";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { useUser } from "@/hooks/use-user";
import { chatConnection } from "@/lib/ai/chat-connection";
import {
  answerCommand,
  denyAllCommands,
  useCommandConfirmations,
} from "@/lib/ai/command-confirmations";
import { forgetTurnChanges } from "@/lib/ai/turn-changes";
import {
  isProposalTool,
  setProposalResponder,
  setProposalsBusy,
  syncProposals,
} from "@/lib/ai/proposed-edits";
import { baseName, isSameOrInside } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { refreshAiUsage } from "@/queries/ai-usage-query";
import { CHAT_TOOLS, FULL_ACCESS_CHAT_TOOLS } from "@/tools";

import { editorHotkeys } from "@/constants/app-hotkeys";

/** Shows a path from the opened folder, or the whole path for files outside it. */
const displayPath = (path: string, folder: string | null) =>
  folder && isSameOrInside(path, folder)
    ? path.slice(folder.replace(/[\\/]+$/, "").length + 1)
    : path;

const lineRange = ({ startLine, endLine }: ChatAttachment) =>
  startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

/** The message sent: each attachment as a fenced block, then the question. */
const composeMessage = (
  text: string,
  attachments: ChatAttachment[],
  folder: string | null,
) =>
  [
    ...attachments.map(
      (item) =>
        `${displayPath(item.path, folder)}:${lineRange(item)}\n\`\`\`${item.language}\n${item.code}\n\`\`\``,
    ),
    text,
  ]
    .filter(Boolean)
    .join("\n\n");

const messageText = (message: UIMessage) =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.content] : []))
    .join("");

/**
 * The tool calls of each turn (from a message of the user's to the end of the
 * reply), by the turn's last assistant message, where its summary goes.
 */
const toolCallsByTurn = (messages: ReadonlyArray<UIMessage>) => {
  const turns = new Map<string, string[]>();
  let lastReply: string | null = null;
  let ids: string[] = [];
  const endTurn = () => {
    if (lastReply && ids.length > 0) turns.set(lastReply, ids);
    lastReply = null;
    ids = [];
  };
  for (const message of messages) {
    // Tool results and approvals travel as messages without text of their own.
    if (message.role === "user" && messageText(message)) endTurn();
    if (message.role !== "assistant") continue;
    lastReply = message.id;
    for (const part of message.parts) {
      if (part.type === "tool-call") ids.push(part.id);
    }
  }
  endTurn();
  return turns;
};

/** Answers the user's approval of one tool call. */
type ApprovalResponder = (
  toolCallId: string,
) => ((approved: boolean) => void) | undefined;

/** The model's reasoning, collapsed once it moves on to answering. */
const Thinking = ({
  content,
  isDone,
}: {
  content: string;
  isDone: boolean;
}) => (
  <details open={!isDone} className="group text-xs text-muted-foreground">
    <summary className="cursor-default select-none">
      {isDone ? "Thought process" : "Thinking…"}
    </summary>
    <p className="mt-1 border-l-2 pl-2 wrap-break-word whitespace-pre-wrap">
      {content}
    </p>
  </details>
);

const AssistantMessage = ({
  message,
  isRunning,
  respondTo,
  isResuming,
}: {
  message: UIMessage;
  /** The chat is still answering with this message. */
  isRunning: boolean;
  respondTo: ApprovalResponder;
  isResuming: boolean;
}) => {
  const results = new Map<string, ToolResultPart>();
  for (const part of message.parts) {
    if (part.type === "tool-result") results.set(part.toolCallId, part);
  }

  return (
    <div className="space-y-2 text-sm">
      {message.parts.map((part, index) => {
        switch (part.type) {
          case "text":
            return part.content ? (
              <MessageText key={index} text={part.content} />
            ) : null;
          case "thinking":
            return part.content ? (
              <Thinking
                key={index}
                content={part.content}
                isDone={!isRunning || index < message.parts.length - 1}
              />
            ) : null;
          case "tool-call": {
            const respond = respondTo(part.id);
            return (
              <ToolCall
                key={part.id}
                part={part}
                result={results.get(part.id)}
                isRunning={isRunning}
                approval={
                  respond && { onRespond: respond, disabled: isResuming }
                }
              />
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
};

const UserMessage = ({ message }: { message: UIMessage }) => {
  const text = messageText(message);
  if (!text) return null;
  return (
    <div className="ml-6 rounded-lg bg-muted px-3 py-2 text-sm">
      <MessageText text={text} />
    </div>
  );
};

const EmptyState = () => {
  const isFullAccess = useAiChat((state) => state.accessMode === "full-access");
  const hotkeyLabel = useHotkeyLabel();
  const addSelectionLabel = hotkeyLabel({
    editorHotkey: editorHotkeys.addSelectionToChat,
  });
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <SparklesIcon className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">Ask about your code</p>
      <p className="text-xs text-muted-foreground">
        Select code in the editor and press {addSelectionLabel} to add it to
        your message. The AI can read, search and change files in the opened
        folder and run commands.{" "}
        {isFullAccess
          ? "In full access mode it does so without asking."
          : "It asks before changing anything."}
      </p>
    </div>
  );
};

const AttachmentChip = ({
  attachment,
  folder,
}: {
  attachment: ChatAttachment;
  folder: string | null;
}) => (
  <span
    className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-1.5 text-xs"
    title={`${displayPath(attachment.path, folder)}, line ${lineRange(attachment)}`}
  >
    <FileCodeIcon className="size-3 shrink-0 text-muted-foreground" />
    <span className="truncate">{baseName(attachment.path)}</span>
    <span className="shrink-0 text-muted-foreground">
      :{lineRange(attachment)}
    </span>
    <Button
      variant="ghost"
      size="icon-xs"
      className="size-4"
      aria-label="Remove"
      onClick={() => useAiChat.getState().removeAttachment(attachment.id)}
    >
      <XIcon className="size-3" />
    </Button>
  </span>
);

/** Shown instead of the message box while signed out. */
const SignInPrompt = () => (
  <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/40 p-3 text-center">
    <p className="text-xs text-muted-foreground">
      Sign in to chat with AI about your code.
    </p>
    <Link
      to="/sign-in"
      className={cn(buttonVariants({ size: "sm" }), "w-full")}
    >
      Sign In
    </Link>
  </div>
);

/** The chat for one account (or for nobody, while signed out). */
const ChatBody = () => {
  const threadId = useAiChat((state) => state.threadId);
  const model = useAiChat((state) => state.model);
  const setModel = useAiChat((state) => state.setModel);
  const accessMode = useAiChat((state) => state.accessMode);
  const setAccessMode = useAiChat((state) => state.setAccessMode);
  const forwardedProps = useMemo(
    () => ({ provider: model?.provider, model: model?.id, accessMode }),
    [model, accessMode],
  );
  const {
    messages,
    sendMessage,
    isLoading,
    error,
    stop,
    clear,
    interrupts,
    resuming,
    isHydrating,
  } = useChat({
    threadId,
    connection: chatConnection,
    // The API keeps the conversation: on mount, the chat loads its messages.
    persistence: true,
    // Must match what the server was told (`accessMode`): the chat asks
    // again for calls it takes over if its own tool says so.
    tools: accessMode === "full-access" ? FULL_ACCESS_CHAT_TOOLS : CHAT_TOOLS,
    // The model to answer with, read by the API from `forwardedProps`. Set
    // here rather than per message so the requests TanStack makes by itself
    // (sending tool results, resuming after an approval) carry it too.
    forwardedProps,
  });
  const attachments = useAiChat((state) => state.attachments);
  const focusRequest = useAiChat((state) => state.focusRequest);
  const folder = useSelectedFolder((state) => state.selectedFolderPath);
  const { user, isPending: isUserPending } = useUser();
  const { isSpent: isBudgetSpent, resetsAt } = useAiUsage();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Opening the panel or adding a selection puts the cursor in the message box.
  useEffect(() => {
    if (focusRequest) inputRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, error]);

  // A finished reply (or a failed one, which may still be billed) changes
  // today's spending.
  const isRunning = isLoading || resuming;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !isRunning) refreshAiUsage();
    wasRunning.current = isRunning;
  }, [isRunning]);

  // Tool calls waiting for the user to approve or deny them.
  const pendingApprovals = new Map(
    interrupts.flatMap((interrupt) =>
      interrupt.kind === "tool-approval" &&
      (interrupt.status === "pending" || interrupt.status === "error")
        ? [[interrupt.toolCallId, interrupt] as const]
        : [],
    ),
  );
  // Destructive commands in full access mode, waiting in the app's own
  // `bash` tool (lib/ai/command-confirmations).
  const pendingCommands = useCommandConfirmations((state) => state.pending);
  const waitingCount =
    pendingApprovals.size + Object.keys(pendingCommands).length;
  const respondTo: ApprovalResponder = (toolCallId) => {
    const interrupt = pendingApprovals.get(toolCallId);
    if (interrupt) {
      return (approved) =>
        approved
          ? interrupt.resolveInterrupt(true)
          : interrupt.resolveInterrupt(false);
    }
    if (pendingCommands[toolCallId]) {
      return (approved) => answerCommand(toolCallId, approved);
    }
    return undefined;
  };
  // Signing out or switching account drops this chat: its commands can't run.
  useEffect(() => denyAllCommands, []);

  // File changes waiting for approval also show as diffs in editor tabs
  // (lib/ai/proposed-edits), which answer through `respondTo`.
  useEffect(() => {
    syncProposals(
      interrupts.flatMap((interrupt) =>
        interrupt.kind === "tool-approval" &&
        (interrupt.status === "pending" || interrupt.status === "error") &&
        isProposalTool(interrupt.toolName)
          ? [
              {
                toolCallId: interrupt.toolCallId,
                tool: interrupt.toolName,
                input: (interrupt.originalArgs ?? {}) as Record<
                  string,
                  unknown
                >,
              },
            ]
          : [],
      ),
    );
    setProposalsBusy(resuming);
  }, [interrupts, resuming]);
  const respondRef = useRef(respondTo);
  useEffect(() => {
    respondRef.current = respondTo;
  });
  useEffect(() => {
    setProposalResponder((toolCallId, approved) =>
      respondRef.current(toolCallId)?.(approved),
    );
    return () => {
      setProposalResponder(null);
      syncProposals([]);
    };
  }, []);

  const lastMessage = messages.at(-1);
  const turnToolCalls = useMemo(() => toolCallsByTurn(messages), [messages]);
  // Until the reply shows something, say it's on its way.
  const isWaiting =
    (isLoading || resuming) &&
    !(lastMessage?.role === "assistant" && lastMessage.parts.length > 0);

  const canSend =
    !!user &&
    !!model &&
    !isBudgetSpent &&
    !isLoading &&
    !resuming &&
    waitingCount === 0 &&
    (!!input.trim() || attachments.length > 0);

  const send = () => {
    if (!canSend) return;
    const content = composeMessage(input.trim(), attachments, folder);
    setInput("");
    useAiChat.getState().clearAttachments();
    void sendMessage(content);
  };

  // A message asked for elsewhere ("Explain this error"): sent as soon as the
  // chat can, or left in the message box while a reply is running.
  const queuedPrompt = useAiChat((state) => state.queuedPrompt);
  const isBusy = isLoading || resuming || waitingCount > 0;
  useEffect(() => {
    if (!queuedPrompt || isUserPending || isHydrating) return;
    const { clearQueuedPrompt, clearAttachments } = useAiChat.getState();
    // Signed out: the panel asks to sign in instead.
    if (!user) return clearQueuedPrompt(queuedPrompt.id);
    // The model list is still loading.
    if (!model) return;

    clearQueuedPrompt(queuedPrompt.id);
    if (isBusy) {
      setInput((current) =>
        current.trim()
          ? `${current}\n\n${queuedPrompt.text}`
          : queuedPrompt.text,
      );
      return;
    }
    clearAttachments();
    void sendMessage(composeMessage(queuedPrompt.text, attachments, folder));
  }, [
    queuedPrompt,
    isUserPending,
    isHydrating,
    user,
    model,
    isBusy,
    attachments,
    folder,
    sendMessage,
  ]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter starts a new line.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b pr-1 pl-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Chat
        </span>
        <div className="flex items-center">
          <UsageMeter />
          <Button
            variant="ghost"
            size="icon-sm"
            title="New chat"
            aria-label="New chat"
            disabled={messages.length === 0 && !error}
            onClick={() => {
              denyAllCommands();
              forgetTurnChanges();
              clear();
              setInput("");
              useAiChat.getState().newChat();
            }}
          >
            <MessageSquarePlusIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Close"
            aria-label="Close chat"
            onClick={() => useAiChat.getState().setOpen(false)}
          >
            <XIcon />
          </Button>
        </div>
      </div>

      {isHydrating && messages.length === 0 ? (
        <p className="flex-1 animate-pulse p-3 text-sm text-muted-foreground">
          Loading chat…
        </p>
      ) : messages.length === 0 && !error ? (
        <EmptyState />
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 select-text">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserMessage key={message.id} message={message} />
            ) : message.role === "assistant" ? (
              <Fragment key={message.id}>
                <AssistantMessage
                  message={message}
                  isRunning={(isLoading || resuming) && message === lastMessage}
                  respondTo={respondTo}
                  isResuming={resuming}
                />
                {/* Once the reply is done: what it changed, to review or undo. */}
                {turnToolCalls.has(message.id) &&
                  !(isRunning && message === lastMessage) && (
                    <TurnChanges toolCallIds={turnToolCalls.get(message.id)!} />
                  )}
              </Fragment>
            ) : null,
          )}
          {isWaiting && (
            <p className="animate-pulse text-sm text-muted-foreground">
              Thinking…
            </p>
          )}
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error.message}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="shrink-0 border-t p-2">
        {/* Nothing until the saved sign-in has been checked. */}
        {isUserPending ? null : !user ? (
          <SignInPrompt />
        ) : (
          <div className="rounded-md border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1 px-2 pt-2">
                {attachments.map((attachment) => (
                  <AttachmentChip
                    key={attachment.id}
                    attachment={attachment}
                    folder={folder}
                  />
                ))}
              </div>
            )}
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                waitingCount > 0
                  ? "Approve or deny the action above first…"
                  : isBudgetSpent
                    ? `Today's AI budget is used up. It resets at ${resetsAt}.`
                    : "Ask about your code…"
              }
              rows={2}
              className="max-h-48 min-h-14 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
              <div className="flex min-w-0 items-center">
                <ModelPicker value={model} onChange={setModel} />
                <AccessModePicker
                  value={accessMode}
                  onChange={setAccessMode}
                  // Mid-run, the server and the chat would disagree about
                  // which calls wait for approval.
                  disabled={isBusy}
                  disabledReason={
                    waitingCount > 0
                      ? "Approve or deny the waiting action first"
                      : "Wait for the reply to finish"
                  }
                />
              </div>
              {isLoading ? (
                <Button
                  size="icon-sm"
                  variant="secondary"
                  title="Stop"
                  aria-label="Stop"
                  onClick={stop}
                >
                  <SquareIcon />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  title="Send (Enter)"
                  aria-label="Send"
                  disabled={!canSend}
                  onClick={send}
                >
                  <ArrowUpIcon />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * The AI chat beside the editor. Starts over on signing in or out, so it
 * loads the conversation for the account now signed in.
 */
const ChatPanel = () => {
  const { user, isPending } = useUser();
  if (isPending) return <div className="h-full border-l bg-background" />;
  return <ChatBody key={user?.id ?? "signed-out"} />;
};

export default ChatPanel;
