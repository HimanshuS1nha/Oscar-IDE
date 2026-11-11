import type { UIMessage } from "@tanstack/ai-react";
import {
  CheckIcon,
  CircleSlashIcon,
  FilePenIcon,
  FilePlusIcon,
  FileDiffIcon,
  FileTextIcon,
  FolderSearchIcon,
  GlobeIcon,
  LoaderIcon,
  SearchIcon,
  ShieldQuestionIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useCommandConfirmations } from "@/lib/ai/command-confirmations";
import {
  isProposalTool,
  openProposal,
  useProposedEdits,
} from "@/lib/ai/proposed-edits";
import { cn } from "@/lib/utils";

type Part = UIMessage["parts"][number];
export type ToolCallPart = Extract<Part, { type: "tool-call" }>;
export type ToolResultPart = Extract<Part, { type: "tool-result" }>;

/** A tool call's input as an object, even while its JSON is still streaming in. */
type ToolInput = Record<string, unknown>;

const readInput = (part: ToolCallPart): ToolInput => {
  if (part.input && typeof part.input === "object")
    return part.input as ToolInput;
  try {
    const parsed: unknown = JSON.parse(part.arguments);
    return parsed && typeof parsed === "object" ? (parsed as ToolInput) : {};
  } catch {
    return {};
  }
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** What each tool is shown as: an icon and a short summary of its input. */
const describe = (
  name: string,
  input: ToolInput,
): { icon: LucideIcon; label: ReactNode } => {
  const code = (value: unknown) => (
    <code className="font-mono text-[0.85em]">{text(value)}</code>
  );
  switch (name) {
    case "read_file":
      return { icon: FileTextIcon, label: <>Read {code(input.path)}</> };
    case "write_file":
      return { icon: FilePlusIcon, label: <>Write {code(input.path)}</> };
    case "edit_file":
      return { icon: FilePenIcon, label: <>Edit {code(input.path)}</> };
    case "find_files":
      return { icon: FolderSearchIcon, label: <>Find {code(input.pattern)}</> };
    case "search_code":
      return { icon: SearchIcon, label: <>Search for {code(input.query)}</> };
    case "bash":
      return {
        icon: TerminalIcon,
        label: text(input.description) || code(input.command),
      };
    case "web_search":
      return {
        icon: GlobeIcon,
        label: <>Search the web for {code(input.query)}</>,
      };
    case "web_fetch":
      return { icon: GlobeIcon, label: <>Read {code(input.url)}</> };
    default:
      return { icon: WrenchIcon, label: name };
  }
};

/**
 * A proposed file change, shown as a diff in an editor tab (opened by itself
 * when the call comes in). This links back to it.
 */
const ProposalLink = ({ toolCallId }: { toolCallId: string }) => {
  const preview = useProposedEdits(
    (state) => state.proposals[toolCallId]?.preview,
  );
  if (!preview || preview.status === "loading") {
    return (
      <p className="animate-pulse text-muted-foreground">
        Working out the change…
      </p>
    );
  }
  if (preview.status === "error") {
    return (
      <p className="wrap-break-word text-destructive">
        This change can't be applied: {preview.message}
      </p>
    );
  }
  return (
    <Button
      size="xs"
      variant="outline"
      className="w-full justify-start"
      onClick={() => openProposal(toolCallId)}
    >
      <FileDiffIcon />
      {preview.isNewFile ? "Review the new file" : "Review the change"}
    </Button>
  );
};

/** Shows what an approval would let the tool do. */
const ApprovalDetails = ({
  toolCallId,
  name,
  input,
}: {
  toolCallId: string;
  name: string;
  input: ToolInput;
}) => {
  if (isProposalTool(name)) return <ProposalLink toolCallId={toolCallId} />;
  const block =
    "max-h-48 overflow-auto rounded border bg-muted/50 px-2 py-1.5 font-mono text-xs whitespace-pre-wrap break-words";
  switch (name) {
    case "bash":
      return <pre className={block}>{text(input.command)}</pre>;
    default:
      return <pre className={block}>{JSON.stringify(input, null, 2)}</pre>;
  }
};

type Status = "running" | "approval" | "done" | "error" | "denied" | "stopped";

const STATUS_ICON: Record<Status, ReactNode> = {
  running: (
    <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
  ),
  approval: <ShieldQuestionIcon className="size-3.5 text-amber-500" />,
  done: <CheckIcon className="size-3.5 text-green-600 dark:text-green-500" />,
  error: <XIcon className="size-3.5 text-destructive" />,
  denied: <CircleSlashIcon className="size-3.5 text-muted-foreground" />,
  stopped: <CircleSlashIcon className="size-3.5 text-muted-foreground" />,
};

const statusOf = (
  part: ToolCallPart,
  result: ToolResultPart | undefined,
  {
    awaitingApproval,
    isRunning,
  }: { awaitingApproval: boolean; isRunning: boolean },
): Status => {
  if (awaitingApproval) return "approval";
  if (part.approval?.approved === false || result?.outcome === "denied") {
    return "denied";
  }
  if (result?.state === "error" || part.state === "error") return "error";
  if (result?.state === "complete" || part.output !== undefined) return "done";
  return isRunning ? "running" : "stopped";
};

/**
 * One tool call in an assistant message: what the model asked for and how it
 * went. Calls that change files or run commands wait here for the user to
 * approve or deny them.
 */
const ToolCall = ({
  part,
  result,
  isRunning,
  approval,
}: {
  part: ToolCallPart;
  result: ToolResultPart | undefined;
  /** The chat is still answering, so a call without a result is in progress. */
  isRunning: boolean;
  /** Set while the call waits for the user. */
  approval?: { onRespond: (approved: boolean) => void; disabled: boolean };
}) => {
  const input = readInput(part);
  const { icon: Icon, label } = describe(part.name, input);
  // Set when full access mode still asks, because the command is destructive.
  const destructiveReason = useCommandConfirmations(
    (state) => state.pending[part.id]?.reason,
  );
  const status = statusOf(part, result, {
    awaitingApproval: !!approval,
    isRunning,
  });

  return (
    <div
      className={cn(
        "rounded-md border text-xs",
        approval && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {STATUS_ICON[status]}
      </div>
      {status === "error" && result?.error && (
        <p className="border-t px-2 py-1.5 wrap-break-word text-destructive">
          {result.error}
        </p>
      )}
      {approval && (
        <div className="space-y-2 border-t px-2 py-2">
          {destructiveReason && (
            <p className="text-amber-700 dark:text-amber-400">
              Asking even in full access: this command {destructiveReason}.
            </p>
          )}
          <ApprovalDetails
            toolCallId={part.id}
            name={part.name}
            input={input}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="xs"
              variant="outline"
              disabled={approval.disabled}
              onClick={() => approval.onRespond(false)}
            >
              Deny
            </Button>
            <Button
              size="xs"
              disabled={approval.disabled}
              onClick={() => approval.onRespond(true)}
            >
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolCall;
