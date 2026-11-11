# Oscar

Oscar is a desktop code editor with an AI assistant built in. It's a pnpm + Turborepo monorepo. Run it from source; there are no installers or auto-updates.

## Apps

- `apps/desktop`: the editor itself, an Electron app with a React renderer. It has Monaco, a file explorer, search and replace, Git, terminals, language servers and the AI chat panel. See `apps/desktop/AGENTS.md`.
- `apps/api`: the Hono server the desktop app calls. It handles sign-in and registration, streams AI chat, and serves inline completions and commit messages. See `apps/api/AGENTS.md`.

## Packages

- `packages/ai` (`@oscar/ai`): the TanStack AI setup both apps share. It holds the providers and models (OpenAI, Anthropic, Gemini), each chat model's price (`pricing.ts`, for the daily budget), chat persistence and usage middleware, and the AI tool definitions. Each tool's name, description, schema and approval rule live here; the desktop app and the API supply the implementations.
- `packages/db` (`@oscar/db`): the Drizzle schema and client for MySQL. It reads `DATABASE_URL`. The drizzle-kit scripts (`db:push`, `db:generate`, `db:migrate`, `db:studio`) live here.
- `packages/dal` (`@oscar/dal`): data access over `@oscar/db`, one class per table (`UserDal`, `ConversationDal`, `MessageDal`, `AiUsageDal`). The API reads and writes the database only through these.
- `packages/validators` (`@oscar/validators`): Zod schemas for request and response bodies, shared by the API and the desktop app. It re-exports Zod.
- `packages/firecrawl` (`@oscar/firecrawl`): a wrapper over Firecrawl for the API's web search and web fetch tools.

Packages export their TypeScript source directly (`exports` points at `src/`), so there's no build step between changing a package and using it.

## Commands

Run these from the root:

- `pnpm dev` starts every app's dev task through Turborepo.
- `pnpm build`, `pnpm lint` and `pnpm check-types` do the same for those tasks.
- `pnpm --filter desktop <script>` or `pnpm --filter api <script>` runs one app's script.

## Tests

- `pnpm test` runs every unit test in the monorepo with Vitest. Run it after a change. `pnpm test apps/api` or `pnpm test src/lib/paths` runs only the files whose path matches; `pnpm test --project desktop` runs one project.
- Vitest is installed once, at the root. `vitest.config.ts` there makes every app and package a project, so a `*.test.ts` file next to the code it tests is picked up with no setup. A project has its own `vitest.config.ts` only when it needs more than the defaults (desktop for the `@/` alias, api for its environment variables).
- Test logic, not wiring: pure functions, request handling, anything with edge cases. Tests don't need MySQL, a provider API key or a display. Mock a module with `vi.mock` when it needs a browser (Monaco) or a service.
- `pnpm --filter desktop test:e2e` builds the desktop app and runs one Playwright smoke test that launches it with a fresh profile. Run it after changing how the app starts (`electron/main.ts`, `preload.ts`, the root route). On Linux without a display, prefix it with `xvfb-run -a`.
- CI (`.github/workflows/test.yml`) runs both on every push to `main` and every pull request.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
