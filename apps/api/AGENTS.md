# API

The backend for the Oscar desktop app. It's a Hono server on Node (`@hono/node-server`), on port 3000 under `/api`. It handles sign-in and registration and runs every AI call, so the provider API keys stay on the server.

## Layout

- `src/index.ts` creates the app, sets the error handler (`app.onError(errorMiddleware)`), adds CORS and request logging, and mounts the routers.
- `routers/` defines the routes. `auth.router.ts` serves `/auth/login`, `/auth/register` and `/auth/me`. `ai.router.ts` serves `/ai/models`, `/ai/chat` (POST streams a chat run over SSE; GET loads a saved conversation), `/ai/complete`, `/ai/commit-message` and `/ai/usage` (today's spending against the daily budget). Routers validate input and call a service. They hold no logic.
- `services/` holds the logic, as classes of static methods (`AuthService`, `AiService`, `AiUsageService`).
- `middlewares/` holds `auth.middleware.ts` (checks the bearer JWT, loads the user and puts it on `c.get("user")`), `error.middleware.ts` and `logging.middleware.ts` (adds a `requestId` per request).
- `helpers/` holds JWT signing (jose), password hashing (argon2), the `validator` wrapper and the error-to-response mapping.
- `lib/` holds the pino `logger` and `chat-persistence.ts`, which saves chat transcripts through `MessageDal`.
- `tools/` holds the server-side AI tools, `web_search` and `web_fetch`, which use `@oscar/firecrawl`. Their definitions are in `@oscar/ai/tools`.
- `constants/` holds the system prompts and token limits (`ai.ts`) and response messages.
- `enums/` and `errors/` hold `ErrorType` and `OscarError`.

## Daily AI budget

Each user gets a daily AI budget in dollars, $10 unless `DAILY_BUDGET_USD` says otherwise. `AiUsageService` does the counting:

- Every AI request (chat, inline completion, commit message) calls `assertWithinBudget` first. Once the user's calls since midnight UTC cost the budget or more, it throws `BUDGET_EXCEEDED` (429) with a message for the user. The check comes before the request, so the last one of the day can go a little over.
- `tracker()` returns `chat()` middleware (`withUsage` from `@oscar/ai/usage`) that saves each model call through `AiUsageDal`: its input and output tokens and its cost at the model's price from `@oscar/ai/pricing`, in micro-dollars. A chat run that uses tools saves one row per step. A model with no price is refused.
- A failed save is logged, not thrown, so the user's answer still arrives.

Data goes through `@oscar/dal`. Don't query `@oscar/db` from here. Request schemas come from `@oscar/validators`.

## Error handling

Errors go through neverthrow and `OscarError`. The error middleware turns them into responses.

- Wrap any call that can throw (database calls, external APIs) in `ResultAsync.fromPromise` and map the error to an `OscarError` with the right `ErrorType`. Pass the original error as `cause`.
- On `isErr()`, throw the `OscarError`. For a failed check (user not found, wrong password, already exists), throw a new `OscarError` directly.
- `OscarError` takes `(type, message, options?, entity?)`. `message` is for the logs and can hold details. The client sees it only for `BAD_REQUEST` and `BUDGET_EXCEEDED`. `entity` names the thing for `NOT_FOUND` and `CONFLICT` responses ("User already exists").
- `errorMiddleware` logs every error with its cause, path and `requestId`. For an `OscarError`, it picks the status with `getHttpStatus` and the client message with `getResponseMessage`. For a `ZodError`, it returns 400 with the issue messages. Anything else gets a 500 with `GENERIC_ERROR_MESSAGE`.
- `ErrorType` maps to these statuses: `BAD_REQUEST` 400, `UNAUTHORIZED` 401, `NOT_FOUND` 404, `CONFLICT` 409, `BUDGET_EXCEEDED` 429, `DATABASE_ERROR` and `GENERIC_ERROR` 500. To add a type, add it to `enums/error.enum.ts` and give it a case in both `helpers/get-http-status.ts` and `helpers/get-response-message.ts`.
- Don't build error responses with `c.json` in routes or services. Throw and let the middleware answer.
- `helpers/validator.ts` wraps `zValidator` so a failed validation throws its `ZodError` into the same middleware.

The AI tools in `tools/` are the exception. Errors they throw become the tool's result for the model, so plain `Error`s are fine there.

## Environment

`.env` is loaded with dotenv. It needs `DATABASE_URL`, `JWT_SECRET`, and `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` for the providers you use. The web tools need `FIRECRAWL_API_KEY`. `DAILY_BUDGET_USD` is optional and sets each user's daily AI budget in dollars (default 10; 0 turns the AI features off); a value that isn't a number stops the server from starting. `LOG_LEVEL` is optional and defaults to `debug` in development and `info` otherwise.

## Commands

- `pnpm dev` runs `tsx watch src/index.ts`.
- `pnpm build` compiles with `tsc` into `dist/`.
- `pnpm start` runs the build.
- `pnpm test` from the root runs the tests. `src/app.test.ts` sends requests to `app` (from `src/app.ts`; `src/index.ts` only starts the server) with `app.request()`. Use it for routes that answer before any database call. `vitest.config.ts` sets the environment variables the modules read on load, so no `.env` is needed.
