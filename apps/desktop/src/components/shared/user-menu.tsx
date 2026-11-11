import { Link } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useSignOut } from "@/hooks/use-auth";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

/** "Sign In" when signed out; the user's avatar and a Sign Out menu when signed in. */
const UserMenu = () => {
  const { user, isPending } = useUser();
  const { mutate: signOut } = useSignOut();

  // Don't flash "Sign In" while checking a saved token.
  if (isPending) return null;

  if (!user) {
    return (
      <Link
        to="/sign-in"
        className={cn(buttonVariants({ size: "sm" }), "app-no-drag self-center")}
      >
        Sign In
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="app-no-drag self-center rounded-full"
            aria-label="Account"
            title={user.name}
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate font-medium text-foreground">
              {user.name}
            </div>
            <div className="truncate font-normal">{user.email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
