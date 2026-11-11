import { create } from "zustand";

import { useOpenedFiles, type OpenedFile } from "@/hooks/use-opened-files";
import { baseName } from "@/lib/paths";
import { applyEdit } from "@/tools/edit-file";
import { withFileLineBreaks } from "@/tools/write-file";
import { readCurrentText, resolveWorkspacePath } from "@/tools/workspace";

/**
 * File changes the AI proposes: `edit_file` and `write_file` calls waiting
 * for the user's approval. Each is shown as a read-only diff in its own tab
 * (the file as it is now against the file after the change), with Approve
 * and Deny in the tab's toolbar as well as in the chat.
 *
 * The chat panel reports which calls are waiting (`syncProposals`) and
 * answers them (`setProposalResponder`); the tab closes once its call is
 * answered, from either place.
 */

export const PROPOSAL_TOOLS = ["edit_file", "write_file"] as const;
export type ProposalTool = (typeof PROPOSAL_TOOLS)[number];

export const isProposalTool = (name: string): name is ProposalTool =>
  (PROPOSAL_TOOLS as readonly string[]).includes(name);

/** A call waiting for approval, as the chat reports it. */
export type PendingProposal = {
  toolCallId: string;
  tool: ProposalTool;
  input: Record<string, unknown>;
};

/** The change worked out for showing: the file now, and after the change. */
export type ProposalPreview =
  | { status: "loading" }
  | {
      status: "ready";
      /** Native absolute path. */
      path: string;
      /** From the opened folder, as the model wrote it. */
      relativePath: string;
      original: string;
      modified: string;
      isNewFile: boolean;
    }
  /** Approving would fail the same way (the tool runs the same checks). */
  | { status: "error"; message: string };

type Proposal = PendingProposal & {
  preview: ProposalPreview;
  /** The approval is being sent: the buttons wait. */
  isBusy: boolean;
};

type UseProposedEdits = {
  proposals: Record<string, Proposal>;
};

export const useProposedEdits = create<UseProposedEdits>(() => ({
  proposals: {},
}));

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Works out the file before and after the change, as the tool would make it. */
const computePreview = async ({
  tool,
  input,
}: PendingProposal): Promise<ProposalPreview> => {
  try {
    const target = resolveWorkspacePath(text(input.path));
    const current = await readCurrentText(target);
    const base = {
      status: "ready" as const,
      path: target.absolute,
      relativePath: target.relative,
    };

    if (tool === "write_file") {
      const content = text(input.content);
      return current
        ? {
            ...base,
            original: current.text,
            modified: withFileLineBreaks(content, current.text),
            isNewFile: false,
          }
        : { ...base, original: "", modified: content, isNewFile: true };
    }

    if (!current) throw new Error(`"${target.relative}" doesn't exist.`);
    const { text: modified } = applyEdit(
      current.text,
      {
        oldString: text(input.oldString),
        newString: text(input.newString),
        replaceAll: input.replaceAll === true,
      },
      target.relative,
    );
    return { ...base, original: current.text, modified, isNewFile: false };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const proposalTab = (toolCallId: string, path: string): OpenedFile => ({
  name: baseName(path),
  path,
  isPermanent: true,
  proposal: { toolCallId },
});

const closeProposalTab = (toolCallId: string) => {
  const tab = useOpenedFiles
    .getState()
    .openedFiles.find((file) => file.proposal?.toolCallId === toolCallId);
  if (tab) useOpenedFiles.getState().removeFile(tab);
};

/** Shows the proposal's diff tab, if its change could be worked out. */
export const openProposal = (toolCallId: string) => {
  const preview = useProposedEdits.getState().proposals[toolCallId]?.preview;
  if (preview?.status !== "ready") return;
  useOpenedFiles.getState().addFile(proposalTab(toolCallId, preview.path));
};

/**
 * Works the change out again, e.g. after the file changed. Leaves the
 * current preview showing meanwhile.
 */
export const refreshProposal = async (toolCallId: string) => {
  const proposal = useProposedEdits.getState().proposals[toolCallId];
  if (!proposal) return;
  const preview = await computePreview(proposal);
  useProposedEdits.setState((state) => {
    const current = state.proposals[toolCallId];
    if (!current) return {};
    return {
      proposals: { ...state.proposals, [toolCallId]: { ...current, preview } },
    };
  });
};

/** The new proposal's change, then its tab, which opens by itself once. */
const loadNewProposal = async (toolCallId: string) => {
  await refreshProposal(toolCallId);
  openProposal(toolCallId);
};

/**
 * Called by the chat with the calls now waiting. New ones are worked out
 * and shown; answered ones lose their tab.
 */
export const syncProposals = (pending: PendingProposal[]) => {
  const { proposals } = useProposedEdits.getState();
  const ids = new Set(pending.map((item) => item.toolCallId));
  const added = pending.filter((item) => !proposals[item.toolCallId]);
  const removed = Object.keys(proposals).filter((id) => !ids.has(id));
  if (added.length === 0 && removed.length === 0) return;

  const next = { ...proposals };
  for (const id of removed) delete next[id];
  for (const item of added) {
    next[item.toolCallId] = {
      ...item,
      preview: { status: "loading" },
      isBusy: false,
    };
  }
  useProposedEdits.setState({ proposals: next });

  for (const id of removed) closeProposalTab(id);
  for (const item of added) void loadNewProposal(item.toolCallId);
};

/** Answers a call; set by the chat while it's showing. */
let responder: ((toolCallId: string, approved: boolean) => void) | null = null;

export const setProposalResponder = (
  respond: ((toolCallId: string, approved: boolean) => void) | null,
) => {
  responder = respond;
};

/** Approves or denies a proposal from its diff tab. */
export const respondToProposal = (toolCallId: string, approved: boolean) => {
  responder?.(toolCallId, approved);
};

/** Marks whether the chat is busy sending an answer, so the tab's buttons wait. */
export const setProposalsBusy = (isBusy: boolean) => {
  const { proposals } = useProposedEdits.getState();
  if (Object.values(proposals).every((item) => item.isBusy === isBusy)) return;
  useProposedEdits.setState({
    proposals: Object.fromEntries(
      Object.entries(proposals).map(([id, item]) => [id, { ...item, isBusy }]),
    ),
  });
};
