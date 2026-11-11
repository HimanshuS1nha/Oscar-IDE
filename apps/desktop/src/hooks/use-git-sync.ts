import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { GIT_QUERY_ROOT } from "@/queries/git-query";

/** Waits for a burst of file events (a save, `npm install`…) to settle. */
const REFRESH_DELAY_MS = 300;

/**
 * Keeps Git status current: refreshes after files change on disk, after Git
 * itself changes something (including from a terminal), and when the window
 * regains focus. Mounted once at the app root, so the branch in the top bar
 * stays right while the Git tab is hidden.
 */
export const useGitSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: GIT_QUERY_ROOT });
      }, REFRESH_DELAY_MS);
    };

    const unsubscribers = [
      window.electron.file.onContentsChange(refresh),
      window.electron.file.onTreeChange(refresh),
      window.electron.git.onChange(refresh),
    ];
    window.addEventListener("focus", refresh);

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      window.removeEventListener("focus", refresh);
    };
  }, [queryClient]);
};
