import { create } from "zustand";

import { useCurrentTab } from "@/hooks/use-current-tab";
import { useSelectedFolder } from "@/hooks/use-selected-folder";
import type {
  SearchFileResult,
  SearchRequest,
} from "../../electron/shared/search";

/** Pause after the last keystroke before searching. */
const TYPING_DELAY_MS = 250;
/** Pause after files change on disk before refreshing results. */
const DISK_CHANGE_DELAY_MS = 600;

type SearchToggle = "matchCase" | "wholeWord" | "isRegex";

type SearchStatus =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "done"; limitHit: boolean }
  | { kind: "error"; message: string };

type UseSearch = SearchRequest & {
  /** Whether the include/exclude fields are shown. */
  showDetails: boolean;
  /** Whether the replace field (and replace buttons) are shown. */
  showReplace: boolean;
  /** Text that replaces each match. With a regex it may use `$1`, `$<name>` and `$&`. */
  replacement: string;
  /** True while a replace is being applied, to block another. */
  isReplacing: boolean;
  status: SearchStatus;
  files: SearchFileResult[];
  /** Files whose matches are hidden, by path. */
  collapsedPaths: Record<string, true>;
  /** Bumped to ask the search input to take focus. */
  focusRequest: number;

  setQuery: (query: string) => void;
  setInclude: (include: string) => void;
  setExclude: (exclude: string) => void;
  toggle: (option: SearchToggle) => void;
  toggleDetails: () => void;
  toggleReplace: () => void;
  setReplacement: (replacement: string) => void;
  toggleCollapsed: (path: string) => void;
  /** Collapses every file, or expands them all if they already are. */
  toggleCollapseAll: () => void;
  /** Searches now, skipping the typing delay. */
  run: () => Promise<void>;
  /** Searches after `delay` ms, restarting the wait on each call. */
  schedule: (delay?: number) => void;
  clear: () => void;
  focusInput: () => void;
  /** Runs a replace, marking it in progress so another can't start meanwhile. */
  runReplace: (replace: () => Promise<unknown>) => Promise<void>;
};

let timer: ReturnType<typeof setTimeout> | null = null;
/** Ignores answers to searches that a newer one replaced. */
let latestRun = 0;

export const useSearch = create<UseSearch>((set, get) => ({
  query: "",
  include: "",
  exclude: "",
  matchCase: false,
  wholeWord: false,
  isRegex: false,
  showDetails: false,
  showReplace: false,
  replacement: "",
  isReplacing: false,
  status: { kind: "idle" },
  files: [],
  collapsedPaths: {},
  focusRequest: 0,

  setQuery: (query) => {
    set({ query });
    get().schedule();
  },
  setInclude: (include) => {
    set({ include });
    get().schedule();
  },
  setExclude: (exclude) => {
    set({ exclude });
    get().schedule();
  },
  toggle: (option) => {
    set((state) => ({ [option]: !state[option] }));
    get().schedule(0);
  },
  toggleDetails: () => set((state) => ({ showDetails: !state.showDetails })),
  toggleReplace: () => set((state) => ({ showReplace: !state.showReplace })),
  setReplacement: (replacement) => set({ replacement }),

  toggleCollapsed: (path) =>
    set((state) => {
      const collapsedPaths = { ...state.collapsedPaths };
      if (collapsedPaths[path]) delete collapsedPaths[path];
      else collapsedPaths[path] = true;
      return { collapsedPaths };
    }),
  toggleCollapseAll: () =>
    set((state) => {
      const allCollapsed = state.files.every(
        (f) => state.collapsedPaths[f.path],
      );
      if (allCollapsed) return { collapsedPaths: {} };
      return {
        collapsedPaths: Object.fromEntries(
          state.files.map((f) => [f.path, true as const]),
        ),
      };
    }),

  run: async () => {
    if (timer) clearTimeout(timer);
    timer = null;

    const { query, include, exclude, matchCase, wholeWord, isRegex } = get();
    const runId = ++latestRun;

    if (!query || !useSelectedFolder.getState().selectedFolderPath) {
      set({ status: { kind: "idle" }, files: [] });
      return;
    }

    // Keep showing the previous results while the new ones load.
    set({ status: { kind: "searching" } });
    try {
      const result = await window.electron.search.run({
        query,
        include,
        exclude,
        matchCase,
        wholeWord,
        isRegex,
      });
      if (runId !== latestRun || result.status === "cancelled") return;

      if (result.status === "invalid-query") {
        set({ status: { kind: "error", message: result.message }, files: [] });
        return;
      }
      set({
        status: { kind: "done", limitHit: result.limitHit },
        files: result.files,
      });
    } catch (error) {
      if (runId !== latestRun) return;
      set({
        status: {
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        },
        files: [],
      });
    }
  },

  schedule: (delay = TYPING_DELAY_MS) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().run(), delay);
  },

  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    latestRun++;
    set({
      query: "",
      status: { kind: "idle" },
      files: [],
      collapsedPaths: {},
    });
  },

  focusInput: () => set((state) => ({ focusRequest: state.focusRequest + 1 })),

  runReplace: async (replace) => {
    if (get().isReplacing) return;
    set({ isReplacing: true });
    try {
      await replace();
    } finally {
      set({ isReplacing: false });
    }
  },
}));

/** Opens the Search tab and focuses its input. */
export const showSearch = () => {
  useCurrentTab.getState().setCurrentTab("Search");
  useSearch.getState().focusInput();
};

/** Opens the Search tab with the replace field showing. */
export const showReplaceInFiles = () => {
  useSearch.setState({ showReplace: true });
  showSearch();
};

/** Keeps results current: a new folder searches it, edits on disk refresh them. */
const keepResultsFresh = () => {
  const unsubscribeFolder = useSelectedFolder.subscribe((state, previous) => {
    if (state.selectedFolderPath === previous.selectedFolderPath) return;
    useSearch.setState({ files: [], collapsedPaths: {} });
    useSearch.getState().schedule(0);
  });
  const unsubscribeDisk = window.electron.file.onContentsChange(() => {
    if (useSearch.getState().query) {
      useSearch.getState().schedule(DISK_CHANGE_DELAY_MS);
    }
  });
  return () => {
    unsubscribeFolder();
    unsubscribeDisk();
  };
};

const unsubscribe = keepResultsFresh();
import.meta.hot?.dispose(unsubscribe);
