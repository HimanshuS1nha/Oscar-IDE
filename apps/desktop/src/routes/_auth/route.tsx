import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import oscarLogo from "@/assets/oscar.png";

export const Route = createFileRoute("/_auth")({
  // Already signed in: nothing to do here.
  beforeLoad: async () => {
    if (await window.electron.auth.getToken()) throw redirect({ to: "/" });
  },
  component: AuthLayout,
});

/** Shared by the sign-in and register pages. */
function AuthLayout() {
  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto px-6 py-8">
      <Link
        to="/"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "absolute top-4 left-4 text-muted-foreground",
        )}
      >
        <ArrowLeftIcon />
        Back to editor
      </Link>

      <div className="w-full max-w-sm space-y-6">
        <img
          src={oscarLogo}
          alt=""
          draggable={false}
          className="mx-auto size-12 select-none"
        />
        <Outlet />
      </div>
    </div>
  );
}
