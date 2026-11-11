# Desktop

The Oscar editor: an Electron app built with Vite (`vite-plugin-electron`). The renderer is React 19 with TanStack Router, TanStack Query, Zustand, Tailwind and shadcn components on Base UI. The editor is Monaco and the terminal is xterm.js over `node-pty`.

## Layout

Two halves, split by Electron's process model.

### `electron/`: main process and preload

- `main.ts` creates the window, applies the theme setting and calls `setupListeners()`.
- `core/` holds the main-process features, one class of static methods per area: `FileExplorer`, `FileOperations`, `FileSearch` (`search.ts`), `Git` (simple-git), `Terminal` (node-pty), `LanguageServer` (spawns `typescript-language-server` and `pyright`), `Session`, `Settings` (conf), `AuthToken`, `ShellCommand` and `BasicWindowControls`.
- `core/index.ts` registers every IPC handler in one place. `ipcMain.handle` is for request and response; `ipcMain.on` is for fire-and-forget calls (terminal input, saving tabs) and the one sync call (`settings:getSync`).
- `shared/` holds the types and constants both processes import. `shared/ipc-channel.ts` names every channel. The other files type each feature's requests and results.
- `preload.ts` exposes `window.electron` through `contextBridge`. It is the renderer's only way into Node. `electron-env.d.ts` types it on `Window`.

To add an IPC call:

1. Add the channel to `shared/ipc-channel.ts`.
2. Put its request and result types in the matching `shared/*.ts` file.
3. Write the handler in `core/`.
4. Register it in `core/index.ts`.
5. Expose it in `preload.ts`.

When a handler throws, Electron prefixes the message. `ipcErrorMessage` in `src/lib/ipc-error.ts` strips that prefix before the renderer shows it.

### `src/`: renderer

- `routes/` is TanStack Router's file-based routing; it generates `routeTree.gen.ts`, so don't edit that file. `__root.tsx` mounts the top bar, status bar and the app-wide sync hooks. `_home/` is the editor layout (sidebar, tabs, terminal panel, chat panel in Allotment panes). `_auth/` holds sign-in and register; `settings.tsx` and `about.tsx` are the remaining pages.
- `components/` is grouped by area: `ai/`, `editor/`, `sidebars/` (explorer, search, git), `terminal/`, `settings/` and `shared/` (top bar, menus, command palette, window controls). `components/ui/` holds shadcn components (`components.json`); add new ones with the shadcn CLI.
- `hooks/` holds the `use-*` hooks. Many are Zustand stores (`use-opened-files`, `use-current-tab`, `use-pane-layout`, `use-terminals`, `use-ai-chat` and others). The rest wrap queries or sync main-process events into the renderer (`use-file-tree-sync`, `use-git-sync`, `use-session`).
- `queries/` holds TanStack Query `queryOptions` factories. Most call `window.electron.*`. `ai-models-query.ts` and `ai-usage-query.ts` (today's AI spending, shown in the chat header) call the API. Query keys live in `constants/query-keys.ts`.
- `lib/` holds logic that isn't React: the Monaco setup and themes, the LSP client (`lib/lsp/`, JSON-RPC over IPC to the main process), git and explorer actions, merge conflicts and fuzzy matching. `lib/ai/` holds the AI editor features: inline completions, commit messages, Explain Error, proposed edits, selection-to-chat and turn changes. `turn-changes.ts` keeps each `write_file` / `edit_file` call's before and after (in memory, by tool call id); the chat sums up each finished turn under its reply (`components/ai/turn-changes.tsx`), with a read-only diff tab per file (`components/editor/ai-change-view.tsx`) and one undo for the turn. Undo only touches a file the turn left as it is now, and moves files the turn created to the trash. Changes made by `bash` commands aren't tracked.
- `tools/` holds the client-side implementations of the AI tools defined in `@oscar/ai/tools`: `read_file`, `write_file`, `edit_file`, `find_files`, `search_code` and `bash`. They run against the opened folder. `tools/index.ts` builds one set for the default access mode and one for full access, where no tool asks for approval through the chat. The exception is a destructive shell command (`destructiveCommandReason` in `@oscar/ai/tools`: `rm -rf`, `git reset --hard`, `git push --force`, `sudo` and the like). TanStack's approval step is per tool, not per call, so the full-access `bash` tool asks in the app instead (`lib/ai/command-confirmations.ts`), behind the same Approve / Deny buttons.
- `constants/` holds API routes, hotkeys, menu items and tab items.

`@/` resolves to `src/`.

## Talking to the API

`src/lib/axios.ts` is the API client. It points at `${VITE_API_URL}/api` (set in `.env`) and adds the bearer token from `window.electron.auth.getToken()` to every request. The main process owns the token (`core/auth-token.ts`) and saves it to disk encrypted with `safeStorage` when the OS has a keyring. Request and response types come from `@oscar/validators`.

## Commands

- `pnpm dev` starts Vite and launches Electron.
- `pnpm typecheck` runs `tsc --noEmit`.
- `pnpm lint` runs ESLint with `--max-warnings 0`.
- `pnpm test` from the root runs the unit tests (`src/**/*.test.ts` and `electron/**/*.test.ts`, in Node, no DOM). Modules that import Monaco need `vi.mock("@/lib/monaco", ...)`; see `src/tools/workspace.test.ts`.
- `pnpm test:e2e` builds the app and runs the Playwright tests in `e2e/` against it, with a temporary `--user-data-dir` so your settings and session are untouched. The build needs a larger Node heap than the default, which the script sets.
- `pnpm build` runs tsc, Vite and electron-builder. Oscar isn't distributed, so you rarely need it.

`dist/` and `dist-electron/` are build output. Don't edit them.
