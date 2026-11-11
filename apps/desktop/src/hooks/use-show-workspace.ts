import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

/**
 * Returns a function that leaves pages like Settings for the editor view.
 * Menu and palette commands await it first: they act on the explorer,
 * editor or terminal, which only exist there.
 */
export const useShowWorkspace = () => {
  const router = useRouter();

  return useCallback(async () => {
    if (router.state.location.pathname === "/") return;
    await router.navigate({ to: "/" });
  }, [router]);
};
