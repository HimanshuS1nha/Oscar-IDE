/**
 * Tidies a model's reply to an inline completion request into the text to
 * insert at the cursor. Models sometimes wrap it in a code fence, repeat the
 * start of the line, or carry on into code that already follows the cursor.
 */
export const cleanCompletion = ({
  reply,
  prefix,
  suffix,
}: {
  reply: string;
  prefix: string;
  suffix: string;
}) => {
  let text = reply;

  // A reply wrapped in ```lang … ```.
  const fenced = /^\s*```[\w+-]*\n([\s\S]*?)\n?```\s*$/.exec(text);
  if (fenced) text = fenced[1] ?? "";

  // The current line repeated from its start.
  const lineStart = prefix.slice(prefix.lastIndexOf("\n") + 1);
  if (lineStart.trim() && text.startsWith(lineStart)) {
    text = text.slice(lineStart.length);
  }

  // Code the reply repeats from after the cursor: the longest end of the
  // reply that the code after the cursor starts with.
  for (
    let length = Math.min(text.length, suffix.length);
    length > 0;
    length--
  ) {
    if (text.endsWith(suffix.slice(0, length))) {
      text = text.slice(0, -length);
      break;
    }
  }

  return text.trimEnd();
};
