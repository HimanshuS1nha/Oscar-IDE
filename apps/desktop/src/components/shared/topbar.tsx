import { Link } from "@tanstack/react-router";
import { SettingsIcon, SparklesIcon } from "lucide-react";

import BranchMenu from "@/components/shared/branch-menu";
import CommandPalette from "@/components/shared/command-palette";
import MainMenu from "@/components/shared/main-menu";
import UserMenu from "@/components/shared/user-menu";
import WindowControls from "@/components/shared/window-controls";
import { Button, buttonVariants } from "@/components/ui/button";

import { getPlatform } from "@/helpers/get-platform";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useShowWorkspace } from "@/hooks/use-show-workspace";
import { cn } from "@/lib/utils";

import oscarLogo from "@/assets/oscar.png";

const TopBar = () => {
  const platform = getPlatform();
  const isMac = platform === "darwin";
  const showWorkspace = useShowWorkspace();
  const isChatOpen = useAiChat((state) => state.isOpen);

  return (
    <header className="app-drag p-2 flex justify-between items-center border-b">
      <div className="flex shrink-0 gap-x-3 items-center">
        {isMac && <WindowControls />}

        <img
          src={oscarLogo}
          alt="Oscar"
          draggable={false}
          className="size-6 select-none"
        />

        <MainMenu />

        <BranchMenu />
      </div>

      <CommandPalette />

      <div className="flex shrink-0 gap-x-3 items-center self-stretch">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="AI Chat"
          title="AI Chat"
          aria-pressed={isChatOpen}
          className="app-no-drag self-center aria-pressed:bg-muted"
          // The chat lives in the editor view: leave pages like Settings first.
          onClick={() =>
            void showWorkspace().then(() => useAiChat.getState().toggle())
          }
        >
          <SparklesIcon size={18} />
        </Button>
        <Link
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "app-no-drag self-center data-[status=active]:bg-muted",
          )}
        >
          <SettingsIcon size={18} />
        </Link>
        <UserMenu />

        {!isMac && (
          <WindowControls
            // Windows caption buttons sit flush against the top-right corner.
            className={platform === "win32" ? "-my-2 -mr-2" : undefined}
          />
        )}
      </div>
    </header>
  );
};

export default TopBar;
