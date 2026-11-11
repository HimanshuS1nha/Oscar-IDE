# Oscar

Oscar is a desktop code editor with an AI assistant built in. The editor is an Electron app with Monaco, Git, terminals and language servers. A small Hono API runs every AI call, so the provider keys never leave the server. The chat works with OpenAI, Anthropic and Gemini models and can read, search and change the code in your open folder.

## Screenshots

![Landing page](https://github.com/user-attachments/assets/e73bbc6b-b2ea-4bc0-ae88-8150000b1a2d)

## Setup

### What you need

- Node.js 24 or newer.
- pnpm 11. Running `corepack enable` installs the version the repo asks for.
- A MySQL 8 server you can create a database on.
- An API key for at least one of OpenAI, Anthropic or Gemini.
- Git, for the Git features.
- A Firecrawl API key if you want the AI to search the web and read pages. Everything else works without it.

On Linux, the terminal's native module (node-pty) builds from source during install, so you also need Python 3, `make` and a C++ compiler. On Debian or Ubuntu, `sudo apt install build-essential python3` covers it. macOS and Windows get prebuilt binaries.

### 1. Install

```sh
git clone https://github.com/HimanshuS1nha/Oscar-IDE.git oscar
cd oscar
pnpm install
```

### 2. Create the database

Create an empty database for Oscar:

```sql
CREATE DATABASE oscar;
```

### 3. Set up the env files

Oscar reads three `.env` files. Each has a `.env.example` next to it to copy:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/desktop/.env.example apps/desktop/.env
cp packages/db/.env.example packages/db/.env
```

Then fill them in.

| File                | Variable                                                | Value                                                                        |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/api/.env`     | `DATABASE_URL`                                          | Your database, e.g. `mysql://user:password@localhost:3306/oscar`             |
|                     | `JWT_SECRET`                                            | Any long random string. `openssl rand -base64 32` makes one.                 |
|                     | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | The keys of the providers you use. Leave the others empty.                   |
|                     | `FIRECRAWL_API_KEY`                                     | Optional. Turns on the web search and page reading tools.                    |
|                     | `DAILY_BUDGET_USD`                                      | Optional. Each user's AI spending limit per day, in dollars. Defaults to 10. |
| `apps/desktop/.env` | `VITE_API_URL`                                          | `http://localhost:3000`                                                      |
| `packages/db/.env`  | `DATABASE_URL`                                          | The same database URL as in `apps/api/.env`                                  |

### 4. Create the tables

```sh
pnpm --filter @oscar/db db:push
```

Run it again after pulling changes to the schema.

### 5. Run it

```sh
pnpm dev
```

This starts the API on port 3000 and opens the editor. Register an account from the sign-in page, open a folder, and pick a model in the chat panel.

## Features

### Editor

- Monaco editor with tabs. A single-clicked file opens in a preview tab, which the next file replaces. Double-clicking or editing the file keeps its tab open. The last folder and its tabs come back on the next launch, and the File menu lists recent folders.
- File explorer that creates, renames and moves files to the trash. It stays fast in folders with tens of thousands of files, asks before opening very large files, and previews images.
- Find and replace across files.
- Language servers for TypeScript and JavaScript (using the folder's own TypeScript and tsconfig) and for Python (Pyright, with the folder's virtual environment). They give completions, errors, go to definition, find references, rename, quick fixes, organize imports and formatting, with optional format on save.
- Quick Open, a command palette and keyboard shortcuts you can change.
- Settings for theme (dark, light or system), editor and terminal fonts, indentation, word wrap, minimap and more.

### Git

- Stage, unstage, discard, commit, pull, push and switch branches.
- Diffs for the working tree, staged changes and past commits.
- Commit history graph.
- Stashes, with or without untracked files, to apply, pop or drop.
- Blame for the current line.
- Merge conflicts highlighted in the editor, with buttons to step through and resolve them.

### Terminal

- Several integrated terminals (xterm.js on node-pty) in a panel under the editor, with a configurable shell.

### AI

- Chat beside the editor with any OpenAI, Anthropic or Gemini model. Conversations are saved to your account.
- The AI reads, writes and edits files, finds files, searches code and runs shell commands in the open folder. With a Firecrawl key, it can also search the web and read pages.
- Two access modes. In approval mode, each file change opens as a diff in an editor tab and waits for you to approve or deny it, and so does each command. In full access mode, changes and commands run without asking.
- Destructive commands still ask in full access mode. That covers `rm -rf`, `git reset --hard`, `git push --force`, `sudo` and similar commands.
- Under each reply, a list of the files it changed with lines added and removed. Each file opens as a diff, and Undo All puts everything back. Undo skips any file that changed again since, so it never overwrites later work.
- Add selected code to the chat, or ask the AI to explain an error from the editor or the output of a terminal.
- Inline completions as you type.
- Commit message suggestions based on the staged changes and the style of the repository's recent commits.
- A daily spending limit per user. The API counts each call's tokens at the model's price and stops AI requests once a user hits the limit. The chat header shows how much of today's budget is used.

### Accounts

- Register and sign in. The app keeps the sign-in token encrypted with the operating system's keychain where one is available.

## Tech stack

### Desktop app

- Electron, with Vite and `vite-plugin-electron` for the build.
- React 19 and TypeScript.
- TanStack Router, Query, Form, Virtual and Hotkeys.
- Zustand for state.
- Tailwind CSS 4, shadcn with Base UI, cmdk, Allotment for the split panes, Lucide icons.
- Monaco Editor.
- xterm.js on node-pty for the terminals.
- simple-git for Git, chokidar for file watching, conf for settings.
- typescript-language-server and Pyright for the language servers.

### API

- Hono on Node.js.
- jose for JWTs and argon2 for password hashing.
- neverthrow for error handling and pino for logging.

### Shared

- TanStack AI, with the OpenAI, Anthropic and Gemini adapters.
- Drizzle ORM on MySQL.
- Zod for validation.
- Firecrawl for web search and page reading.

### Tooling

- pnpm workspaces and Turborepo.
- Vitest for unit tests and Playwright for the end-to-end test.
- ESLint and Prettier.

## Demo

Live Demo - [Click Here](https://www.youtube.com/watch?v=tee2WcyY4bA)

## 🚀 About Me

My name is Himanshu Sinha and I'm a full stack developer.