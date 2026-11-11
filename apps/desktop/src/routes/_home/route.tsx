import ChatPanel from "@/components/ai/chat-panel";
import MainTabs from "@/components/shared/main-tabs";
import MainSidebar from "@/components/sidebars/main-sidebar";
import TerminalPanel from "@/components/terminal/terminal-panel";
import { useAiChat } from "@/hooks/use-ai-chat";
import { usePaneLayout } from "@/hooks/use-pane-layout";
import { useTerminals } from "@/hooks/use-terminals";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Allotment, LayoutPriority, type AllotmentHandle } from "allotment";
import { useRef, useState } from "react";

export const Route = createFileRoute("/_home")({
  component: RouteComponent,
});

function RouteComponent() {
  const isTerminalOpen = useTerminals((state) => state.isPanelOpen);
  const isSidebarVisible = usePaneLayout((state) => state.isSidebarVisible);
  const setSidebarVisible = usePaneLayout((state) => state.setSidebarVisible);
  const isChatOpen = useAiChat((state) => state.isOpen);
  // Read once on mount: subscribing would re-render on every drag frame.
  const [initialSizes] = useState(() => {
    const { sidebarWidth, terminalHeight } = usePaneLayout.getState();
    return {
      sidebarWidth,
      terminalHeight,
      chatWidth: useAiChat.getState().width,
    };
  });

  const panesRef = useRef<HTMLDivElement>(null);
  const allotmentRef = useRef<AllotmentHandle>(null);
  const hasSettled = useRef(false);

  /**
   * Allotment adds the panes one at a time, all visible, and only then hides
   * the closed ones. Meanwhile the chat pane briefly takes its room and
   * squeezes the sidebar to its minimum, which it keeps once that room goes
   * to the editor. So nothing is saved until the panes shown match the
   * layout; then the side panes get their sizes back.
   */
  const restoreSideWidths = (sizes: number[]) => {
    const [sidebar, , chat] = sizes;
    const matches =
      sizes.length === 3 &&
      sidebar > 0 === usePaneLayout.getState().isSidebarVisible &&
      chat > 0 === useAiChat.getState().isOpen;
    if (!matches) return;

    hasSettled.current = true;
    // After Allotment's own resizing in this pass.
    requestAnimationFrame(() => {
      const width = panesRef.current?.clientWidth;
      if (!width) return;
      const sidebarWidth = sidebar > 0 ? initialSizes.sidebarWidth : 0;
      const chatWidth = chat > 0 ? initialSizes.chatWidth : 0;
      allotmentRef.current?.resize([
        sidebarWidth,
        width - sidebarWidth - chatWidth,
        chatWidth,
      ]);
    });
  };

  // A hidden or snapped pane reports 0; keep the last real size for it.
  const saveSideWidths = (sizes: number[]) => {
    if (!hasSettled.current) return restoreSideWidths(sizes);
    const [sidebarWidth, , chatWidth] = sizes;
    if (sidebarWidth > 0)
      usePaneLayout.getState().setSidebarWidth(sidebarWidth);
    if (chatWidth > 0) useAiChat.getState().setWidth(chatWidth);
  };
  const saveTerminalHeight = ([, height]: number[]) => {
    if (height > 0) usePaneLayout.getState().setTerminalHeight(height);
  };

  return (
    // Tabs on top (sidebar tabs and opened files), panes below.
    <div className="flex h-full flex-col">
      <MainTabs />
      <div ref={panesRef} className="min-h-0 flex-1">
        <Allotment
          ref={allotmentRef}
          proportionalLayout={false}
          onChange={saveSideWidths}
          onVisibleChange={(index, visible) => {
            if (index === 0) setSidebarVisible(visible);
            // Dragged closed.
            if (index === 2 && !visible) useAiChat.getState().setOpen(false);
          }}
        >
          <Allotment.Pane
            preferredSize={initialSizes.sidebarWidth}
            minSize={160}
            maxSize={600}
            snap
            visible={isSidebarVisible}
            // Window resizes and the chat opening or closing resize the
            // editor, not the side panes.
            priority={LayoutPriority.Low}
          >
            <MainSidebar />
          </Allotment.Pane>
          <Allotment.Pane minSize={300} priority={LayoutPriority.High}>
            {/* Editor above, terminal panel below, as in VS Code. */}
            <Allotment
              vertical
              proportionalLayout={false}
              onChange={saveTerminalHeight}
            >
              {/* Resizing the window resizes the editor, not the terminal. */}
              <Allotment.Pane minSize={120} priority={LayoutPriority.High}>
                <Outlet />
              </Allotment.Pane>
              <Allotment.Pane
                preferredSize={initialSizes.terminalHeight}
                minSize={100}
                visible={isTerminalOpen}
              >
                <TerminalPanel />
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
          {/* Hidden rather than unmounted, so the conversation stays. */}
          <Allotment.Pane
            preferredSize={initialSizes.chatWidth}
            minSize={280}
            maxSize={720}
            snap
            visible={isChatOpen}
            priority={LayoutPriority.Low}
          >
            <ChatPanel />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}
