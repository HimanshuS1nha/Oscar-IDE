import { afterEach, describe, expect, it } from "vitest";

import {
  answerCommand,
  confirmCommand,
  denyAllCommands,
  useCommandConfirmations,
} from "./command-confirmations";

const ask = (toolCallId: string, signal?: AbortSignal) =>
  confirmCommand({
    toolCallId,
    command: "git reset --hard",
    reason: "discards uncommitted changes",
    signal,
  });

const pendingIds = () =>
  Object.keys(useCommandConfirmations.getState().pending);

afterEach(() => denyAllCommands());

describe("command confirmations", () => {
  it("waits for the user's answer", async () => {
    const approved = ask("call-1");
    const denied = ask("call-2");
    expect(pendingIds()).toEqual(["call-1", "call-2"]);

    answerCommand("call-1", true);
    answerCommand("call-2", false);

    await expect(approved).resolves.toBe(true);
    await expect(denied).resolves.toBe(false);
    expect(pendingIds()).toEqual([]);
  });

  it("ignores an answer to a call that isn't waiting", async () => {
    const answer = ask("call-1");
    answerCommand("other", true);
    expect(pendingIds()).toEqual(["call-1"]);

    answerCommand("call-1", false);
    answerCommand("call-1", true);
    await expect(answer).resolves.toBe(false);
  });

  it("denies when the chat is stopped", async () => {
    const controller = new AbortController();
    const answer = ask("call-1", controller.signal);

    controller.abort();

    await expect(answer).resolves.toBe(false);
    expect(pendingIds()).toEqual([]);
  });

  it("denies at once when the chat was already stopped", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(ask("call-1", controller.signal)).resolves.toBe(false);
    expect(pendingIds()).toEqual([]);
  });

  it("denies everything waiting when the chat goes away", async () => {
    const answers = [ask("call-1"), ask("call-2")];

    denyAllCommands();

    await expect(Promise.all(answers)).resolves.toEqual([false, false]);
    expect(pendingIds()).toEqual([]);
  });
});
