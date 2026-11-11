import type { getRouter } from "@/router";

type AppRouter = ReturnType<typeof getRouter>;

let router: AppRouter | null = null;

/** Called once by `main.tsx`, which creates the router. */
export const setAppRouter = (instance: AppRouter) => {
  router = instance;
};

/** Opens Settings from code outside React, such as a menu entry. */
export const openSettings = () => void router?.navigate({ to: "/settings" });

/** Opens the About page from the Help menu. */
export const openAbout = () => void router?.navigate({ to: "/about" });
