import {
  PlusIcon,
  SparklesIcon,
  SquareTerminalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import TerminalView from "@/components/terminal/terminal-view";
import { Button } from "@/components/ui/button";

import { useTerminals, type TerminalTab } from "@/hooks/use-terminals";
import { explainTerminalOutput } from "@/lib/ai/explain-error";

const TerminalTabButton = ({
  terminal,
  isActive,
}: {
  terminal: TerminalTab;
  isActive: boolean;
}) => {
  const setActive = useTerminals((state) => state.setActive);
  const closeTerminal = useTerminals((state) => state.closeTerminal);

  return (
    <div
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      title={`${terminal.title}\n${terminal.cwd}`}
      onClick={() => setActive(terminal.id)}
      onAuxClick={(event) => {
        if (event.button === 1) closeTerminal(terminal.id);
      }}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActive(terminal.id);
        }
      }}
      className={cn(
        "group/tab relative flex h-full shrink-0 cursor-pointer items-center gap-1.5 pr-1 pl-2.5 text-xs outline-none select-none",
        "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {isActive && (
        <span
          className="absolute inset-x-2 bottom-0 h-px bg-primary"
          aria-hidden
        />
      )}
      <SquareTerminalIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="max-w-40 truncate">{terminal.title}</span>
      <button
        type="button"
        aria-label={`Kill ${terminal.title}`}
        title="Kill terminal"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          closeTerminal(terminal.id);
        }}
        className={cn(
          "flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
          isActive ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
        )}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
};

const TerminalPanel = () => {
  const terminals = useTerminals((state) => state.terminals);
  const activeId = useTerminals((state) => state.activeId);
  const isCreating = useTerminals((state) => state.isCreating);
  const createTerminal = useTerminals((state) => state.createTerminal);
  const closeTerminal = useTerminals((state) => state.closeTerminal);
  const hidePanel = useTerminals((state) => state.hidePanel);

  return (
    <section
      aria-label="Terminal"
      className="flex h-full w-full flex-col bg-background"
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b pr-1 pl-1">
        <div
          role="tablist"
          aria-label="Terminals"
          className="flex h-full min-w-0 flex-1 overflow-x-auto"
        >
          {terminals.map((terminal) => (
            <TerminalTabButton
              key={terminal.id}
              terminal={terminal}
              isActive={terminal.id === activeId}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Explain terminal output with AI"
          title="Explain with AI (the selection, or the latest output)"
          disabled={activeId === null}
          // Keep the terminal's selection: a click would clear it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={explainTerminalOutput}
        >
          <SparklesIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New terminal"
          title="New terminal"
          disabled={isCreating}
          onClick={() => void createTerminal()}
        >
          <PlusIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Kill terminal"
          title="Kill terminal"
          disabled={activeId === null}
          onClick={() => activeId !== null && closeTerminal(activeId)}
        >
          <Trash2Icon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Hide terminal panel"
          title="Hide panel"
          onClick={hidePanel}
        >
          <XIcon />
        </Button>
      </div>

      {/* Padding sits outside the xterm so its fit measures the real space. */}
      <div className="min-h-0 flex-1 py-1 pl-3">
        {activeId !== null ? <TerminalView key={activeId} id={activeId} /> : null}
      </div>
    </section>
  );
};

export default TerminalPanel;
