import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { SettingsHotkeysProvider } from "./components/settings/settings-hotkeys-provider";
import { applyThemeClass } from "./hooks/use-apply-settings";
import { useSettings } from "./hooks/use-settings";
import { setAppRouter } from "./lib/app-router";

import { getRouter } from "./router";

import "@xterm/xterm/css/xterm.css";
import "allotment/dist/style.css";
import "./index.css";

// Create a new router instance
const router = getRouter();
setAppRouter(router);

// Before the first render, so a light theme doesn't flash dark first.
applyThemeClass(useSettings.getState().settings.appearance.theme);

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <SettingsHotkeysProvider>
        <RouterProvider router={router} />
      </SettingsHotkeysProvider>
    </StrictMode>,
  );
}