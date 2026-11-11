import { useQuery } from "@tanstack/react-query";
import { CheckIcon, GitBranchIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useSelectedFolder } from "@/hooks/use-selected-folder";
import { checkoutBranch, useGitUi } from "@/lib/git-actions";
import { gitBranchesQuery, gitStatusQuery } from "@/queries/git-query";

/** The current branch, with a menu to switch to another local branch. Hidden outside a repository. */
const BranchMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedFolderPath = useSelectedFolder(
    (state) => state.selectedFolderPath,
  );
  const { data: status } = useQuery(gitStatusQuery(selectedFolderPath));
  const { data: branches, isPending: branchesPending } = useQuery({
    ...gitBranchesQuery(selectedFolderPath),
    // Only list branches once the menu is opened.
    enabled: !!selectedFolderPath && isOpen,
  });
  const isCheckingOut = useGitUi((state) => state.running === "checkout");
  const isBusy = useGitUi((state) => !!state.running);

  if (status?.kind !== "repo") return null;

  const label =
    status.branch ??
    (status.detachedAt ? `(${status.detachedAt})` : "No branch");

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="app-no-drag max-w-48 text-sm"
            title={status.branch ? `Branch: ${status.branch}` : "Detached HEAD"}
          />
        }
      >
        {isCheckingOut ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <GitBranchIcon />
        )}
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56 min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
          {branchesPending ? (
            <DropdownMenuItem disabled>
              <LoaderCircleIcon className="animate-spin" />
              Loading…
            </DropdownMenuItem>
          ) : (
            branches?.local.map((branch) => {
              const isCurrent = branch === branches.current;
              return (
                <DropdownMenuItem
                  key={branch}
                  disabled={isBusy}
                  onClick={() => {
                    if (!isCurrent) void checkoutBranch(branch);
                  }}
                >
                  <CheckIcon className={isCurrent ? "" : "invisible"} />
                  <span className="truncate">{branch}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default BranchMenu;
