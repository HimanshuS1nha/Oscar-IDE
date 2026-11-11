import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal, type ITerminalOptions, type ITheme } from "@xterm/xterm";

import { useSettings } from "@/hooks/use-settings";
import { settingsFontFamily } from "@/lib/editor-options";
import { createColorReader } from "@/lib/monaco-theme";

import type { Settings } from "../../electron/shared/settings";

/*
 * xterm instances live outside React so a terminal keeps its screen,
 * scrollback and shell while its tab is hidden or the panel is closed.
 * Each one renders into its own `host` element, which the visible
 * <TerminalView> adopts.
 */

type Session = {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  isOpened: boolean;
};

const sessions = new Map<number, Session>();
/** Output that arrived before its session was registered. */
const earlyOutput = new Map<number, string>();
/** Closed sessions, whose last output is dropped rather than kept as early output. */
const closedIds = new Set<number>();
let isListening = false;

const ensureListening = (onExit: (id: number) => void) => {
  if (isListening) return;
  isListening = true;
  window.electron.terminal.onData((id, data) => {
    const session = sessions.get(id);
    if (session) session.term.write(data);
    else if (!closedIds.has(id)) earlyOutput.set(id, (earlyOutput.get(id) ?? "") + data);
  });
  window.electron.terminal.onExit(({ id }) => onExit(id));
};

const buildTheme = (): ITheme => {
  const color = createColorReader();
  return {
    background: color("--background"),
    foreground: color("--foreground"),
    cursor: color("--primary"),
    cursorAccent: color("--background"),
    selectionBackground: color("--accent", 0.55),
    selectionInactiveBackground: color("--accent", 0.3),
    scrollbarSliderBackground: color("--muted-foreground", 0.15),
    scrollbarSliderHoverBackground: color("--muted-foreground", 0.25),
    scrollbarSliderActiveBackground: color("--muted-foreground", 0.35),
  };
};

/** The options the user can change, from the settings. */
const settingsOptions = ({
  editor,
  terminal,
}: Settings): ITerminalOptions => ({
  // Empty follows the editor's font.
  fontFamily: settingsFontFamily(terminal.fontFamily || editor.fontFamily),
  fontSize: terminal.fontSize,
  cursorStyle: terminal.cursorStyle,
  cursorBlink: terminal.cursorBlink,
  scrollback: terminal.scrollback,
});

/** Applies changed settings to the open terminals. */
export const applyTerminalSettings = (settings: Settings) => {
  const options = settingsOptions(settings);
  for (const [id, session] of sessions) {
    Object.assign(session.term.options, options);
    // A new font size changes how many rows and columns fit.
    fitTerminalSession(id);
  }
};

/** Repaints the open terminals with the current theme's colours. */
export const applyTerminalTheme = () => {
  if (sessions.size === 0) return;
  const theme = buildTheme();
  for (const session of sessions.values()) session.term.options.theme = theme;
};

const isMac = () => window.electron.platform === "darwin";

/**
 * Copy and paste on Ctrl+Shift+C/V outside macOS (plain Ctrl+C must reach
 * the shell as an interrupt). macOS gets ⌘C/⌘V from the browser already.
 */
const handleClipboardKeys = (term: Terminal) => (event: KeyboardEvent) => {
  if (event.type !== "keydown" || isMac()) return true;
  if (!event.ctrlKey || !event.shiftKey || event.altKey) return true;

  const key = event.key.toLowerCase();
  if (key === "c" && term.hasSelection()) {
    void navigator.clipboard.writeText(term.getSelection());
    event.preventDefault();
    return false;
  }
  if (key === "v") {
    void navigator.clipboard.readText().then((text) => term.paste(text));
    event.preventDefault();
    return false;
  }
  return true;
};

type SessionHandlers = {
  onTitleChange: (id: number, title: string) => void;
  /** The shell exited by itself. */
  onExit: (id: number) => void;
};

/** Starts a shell and the xterm that shows it. */
export const createTerminalSession = async (handlers: SessionHandlers) => {
  ensureListening(handlers.onExit);

  const term = new Terminal({
    ...settingsOptions(useSettings.getState().settings),
    lineHeight: 1.2,
    allowProposedApi: true,
    macOptionIsMeta: true,
    theme: buildTheme(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      event.preventDefault();
      window.open(uri, "_blank", "noopener");
    }),
  );
  term.attachCustomKeyEventHandler(handleClipboardKeys(term));

  const host = document.createElement("div");
  host.className = "h-full w-full";

  const info = await window.electron.terminal.create({
    cols: term.cols,
    rows: term.rows,
  });

  sessions.set(info.id, { term, fit, host, isOpened: false });
  term.onData((data) => window.electron.terminal.write(info.id, data));
  term.onResize(({ cols, rows }) =>
    window.electron.terminal.resize(info.id, cols, rows),
  );
  term.onTitleChange((title) => {
    if (title.trim()) handlers.onTitleChange(info.id, title.trim());
  });

  const early = earlyOutput.get(info.id);
  if (early) {
    term.write(early);
    earlyOutput.delete(info.id);
  }
  return info;
};

/** Sizes the terminal to its container, if it is showing. */
export const fitTerminalSession = (id: number) => {
  const session = sessions.get(id);
  if (!session?.isOpened) return;
  const { offsetWidth, offsetHeight } = session.host;
  if (offsetWidth === 0 || offsetHeight === 0) return; // hidden
  session.fit.fit();
};

/** Moves the terminal into `container`. Returns a function that takes it out again. */
export const attachTerminalSession = (id: number, container: HTMLElement) => {
  const session = sessions.get(id);
  if (!session) return () => {};

  container.appendChild(session.host);
  if (!session.isOpened) {
    session.term.open(session.host);
    session.isOpened = true;
  }
  fitTerminalSession(id);

  return () => {
    if (session.host.parentElement === container) {
      container.removeChild(session.host);
    }
  };
};

export const focusTerminalSession = (id: number) => {
  // After React has shown the panel and attached the terminal.
  requestAnimationFrame(() => sessions.get(id)?.term.focus());
};

export const disposeTerminalSession = (id: number) => {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  earlyOutput.delete(id);
  closedIds.add(id);
  session.term.dispose();
  session.host.remove();
};

/** How much recent output "Explain Terminal Output" sends without a selection. */
const RECENT_LINES = 80;
const MAX_TEXT_LENGTH = 12_000;

/**
 * The terminal's selected text, or else its last lines of output up to the
 * cursor (wrapped lines joined back together). Trimmed to a length a chat
 * message can carry, keeping the end, where errors usually are.
 */
export const readTerminalText = (
  id: number,
): { text: string; isSelection: boolean } | null => {
  const session = sessions.get(id);
  if (!session) return null;
  const { term } = session;

  let text: string;
  const isSelection = term.hasSelection() && !!term.getSelection().trim();
  if (isSelection) {
    text = term.getSelection();
  } else {
    const buffer = term.buffer.active;
    const lastRow = buffer.baseY + buffer.cursorY;
    const lines: string[] = [];
    for (let row = lastRow; row >= 0 && lines.length < RECENT_LINES; row--) {
      const line = buffer.getLine(row);
      if (!line) continue;
      let content = line.translateToString(true);
      // A wrapped row continues the one above it.
      while (line.isWrapped && row > 0) {
        const above = buffer.getLine(--row);
        if (!above) break;
        content = above.translateToString(true) + content;
        if (!above.isWrapped) break;
      }
      lines.unshift(content);
    }
    text = lines.join("\n");
  }

  text = text.replace(/\s+$/, "").replace(/^\s*\n/, "");
  if (text.length > MAX_TEXT_LENGTH) {
    text = `…${text.slice(-MAX_TEXT_LENGTH)}`;
  }
  return text ? { text, isSelection } : null;
};
