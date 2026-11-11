import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "react-hot-toast";

import StatusBar from "@/components/shared/status-bar";
import { StashDialog } from "@/components/sidebars/git-stashes";
import TopBar from "@/components/shared/topbar";

import { useApplySettings } from "@/hooks/use-apply-settings";
import { useFileSaving } from "@/hooks/use-file-saving";
import { useFileTreeSync } from "@/hooks/use-file-tree-sync";
import { useGitSync } from "@/hooks/use-git-sync";
import { useHotKeys } from "@/hooks/use-hot-keys";
import { useSession } from "@/hooks/use-session";

import { type QueryClient } from "@tanstack/react-query";

type RouterContextType = {
  queryClient: QueryClient;
};

const RootLayout = () => {
  useFileTreeSync();
  useFileSaving();
  useSession();
  useGitSync();
  useHotKeys();
  useApplySettings();

  return (
    // Fill the window: the top and status bars take their natural height,
    // the routed content gets the rest.
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      <StatusBar />
      {/* Opened from the Source Control menu or the command palette. */}
      <StashDialog />

      <Toaster position="top-right" />
      {/* Dev only. Raised so it doesn't cover the status bar's branch. */}
      <TanStackRouterDevtools
        toggleButtonProps={{ style: { bottom: "2rem" } }}
      />
    </div>
  );
};

export const Route = createRootRouteWithContext<RouterContextType>()({
  component: RootLayout,
});
