import { bashTool, destructiveCommandReason } from "@oscar/ai/tools";

import { confirmCommand } from "@/lib/ai/command-confirmations";
import { ipcErrorMessage } from "@/lib/ipc-error";
import {
  openedFolder,
  resolveWorkspacePath,
  throwIfAborted,
} from "@/tools/workspace";

type BashArgs = Parameters<
  NonNullable<ReturnType<typeof bashTool.client>["execute"]>
>;

const runCommand = async (
  ...[{ command, cwd, timeoutMs }, context]: BashArgs
) => {
  openedFolder();
  const folder = cwd ? resolveWorkspacePath(cwd).absolute : undefined;
  const signal = context?.abortSignal;
  throwIfAborted(signal);

  // Stopping the chat stops the command.
  const id = crypto.randomUUID();
  const onAbort = () => void window.electron.shellCommand.cancel(id);
  signal?.addEventListener("abort", onAbort, { once: true });

  let result;
  try {
    result = await window.electron.shellCommand.run({
      id,
      command,
      cwd: folder,
      timeoutMs,
    });
  } catch (error) {
    throw new Error(ipcErrorMessage(error));
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  if (result.cancelled) throw new Error("Stopped by the user.");
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    truncated: result.truncated,
  };
};

/** Runs the command once the chat's approval step lets it through. */
export const bash = bashTool.client(runCommand);

/**
 * For full access mode, where the chat has no approval step: runs the
 * command straight away, unless it's destructive (`destructiveCommandReason`).
 * Then it waits for the user to approve it here, in the app.
 */
export const fullAccessBash = bashTool.client(async (...args: BashArgs) => {
  const [{ command }, context] = args;
  const reason = destructiveCommandReason(command);
  if (reason) {
    const approved = await confirmCommand({
      // Set by the chat, which shows the buttons under this id.
      toolCallId: context?.toolCallId ?? crypto.randomUUID(),
      command,
      reason,
      signal: context?.abortSignal,
    });
    throwIfAborted(context?.abortSignal);
    if (!approved) {
      throw new Error(
        `The user denied this command (it ${reason}). Don't retry it or work around it; ask them what they want instead.`,
      );
    }
  }
  return runCommand(...args);
});
