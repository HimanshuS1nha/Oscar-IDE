import { cn } from "@/lib/utils";

const FENCE = /```([\w+-]*)\n([\s\S]*?)\n?```/g;

type Segment =
  | { kind: "text"; text: string }
  | { kind: "code"; language: string; code: string };

/** Splits message text into prose and fenced code blocks. */
const toSegments = (text: string): Segment[] => {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    const before = text.slice(last, match.index).trim();
    if (before) segments.push({ kind: "text", text: before });
    segments.push({ kind: "code", language: match[1], code: match[2] });
    last = match.index + match[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) segments.push({ kind: "text", text: rest });
  return segments;
};

/** A message's text, with fenced code shown as code blocks. */
const MessageText = ({
  text,
  className,
}: {
  text: string;
  className?: string;
}) => (
  <div className={cn("space-y-2", className)}>
    {toSegments(text).map((segment, index) =>
      segment.kind === "text" ? (
        <p key={index} className="break-words whitespace-pre-wrap">
          {segment.text}
        </p>
      ) : (
        <pre
          key={index}
          className="overflow-x-auto rounded-md border bg-background/60 p-2 font-mono text-xs"
          data-language={segment.language || undefined}
        >
          <code>{segment.code}</code>
        </pre>
      ),
    )}
  </div>
);

export default MessageText;
