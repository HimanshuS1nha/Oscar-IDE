import type { OpenedFile } from "@/hooks/use-opened-files";
import { diffSideLabel } from "@/lib/git-actions";

/** What a tab shows besides the file itself, e.g. "Working Tree"; null for a file tab. */
const tabSide = (file: OpenedFile) => {
  if (file.proposal) return "Proposed";
  if (file.aiChange) return "Changed by AI";
  if (file.diff) return diffSideLabel(file.diff);
  return null;
};

/** "a.ts", or "a.ts (Working Tree)" for a diff tab. */
export const tabLabel = (file: OpenedFile) => {
  const side = tabSide(file);
  return side ? `${file.name} (${side})` : file.name;
};

/** The tab's tooltip: its path, plus what it shows. */
export const tabTitle = (file: OpenedFile) => {
  const side = tabSide(file);
  return side ? `${file.path} (${side})` : file.path;
};
