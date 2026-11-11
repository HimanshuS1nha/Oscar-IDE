import type { ReactNode } from "react";

/** Shown in place of an editor that can't display its file. */
const EditorMessage = ({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  /** A button offering a way past the message. */
  action?: ReactNode;
}) => (
  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
    <p className="text-sm text-foreground">{title}</p>
    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default EditorMessage;
