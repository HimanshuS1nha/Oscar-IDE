import { findFilesTool } from "@oscar/ai/tools";

import { compileGlobs } from "../../electron/shared/search";
import { openedFolder } from "@/tools/workspace";

const DEFAULT_MAX_RESULTS = 200;

export const findFiles = findFilesTool.client(
  async ({ pattern, maxResults }) => {
    openedFolder();
    // One glob: braces like `*.{ts,tsx}` hold its only commas.
    const matches = compileGlobs(pattern);
    if (!matches) throw new Error("The pattern is empty.");

    const { files, limitHit } = await window.electron.search.listFiles();
    const found = files.filter(matches);
    const max = maxResults ?? DEFAULT_MAX_RESULTS;
    return {
      files: found.slice(0, max),
      // The listing itself stops at a limit in huge folders.
      truncated: found.length > max || limitHit,
    };
  },
);
