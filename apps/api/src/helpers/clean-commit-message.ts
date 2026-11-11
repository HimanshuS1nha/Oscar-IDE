/**
 * Tidies a model's reply to a commit message request: drops a code fence or
 * quotes around it, and spaces at line ends.
 */
export const cleanCommitMessage = (reply: string) => {
  let text = reply.trim();

  const fenced = /^```[\w+-]*\n([\s\S]*?)\n?```$/.exec(text);
  if (fenced) text = (fenced[1] ?? "").trim();

  const quoted = /^(["'`])([\s\S]*)\1$/.exec(text);
  if (quoted && !quoted[2]?.includes(quoted[1] ?? "")) text = (quoted[2] ?? "").trim();

  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
};
