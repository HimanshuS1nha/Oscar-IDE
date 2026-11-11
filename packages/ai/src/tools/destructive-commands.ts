/**
 * Shell commands that ask for the user's approval even in full access mode:
 * ones that delete or overwrite work, rewrite or force-push git history, run
 * as root, or reach outside the project in ways that are hard to undo.
 *
 * A guard against the model's mistakes, not a sandbox: it reads the command
 * as written, so a command hidden in a script, a variable or `eval` gets
 * through. It errs towards asking. A pattern that appears inside a quoted
 * string, such as a commit message, asks too.
 */
const RULES: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  // Files
  {
    // Not `docker run --rm`.
    pattern:
      /(?<![-\w])rm\s+(?:\S+\s+)*?(?:-[a-zA-Z]*[rRf]\b|--recursive\b|--force\b)/,
    reason: "deletes files recursively or without asking",
  },
  {
    pattern: /\bfind\b.*\s-delete\b|\bfind\b.*-exec(?:dir)?\s+rm\b/,
    reason: "deletes every file it finds",
  },
  { pattern: /\bxargs\s+(?:\S+\s+)*?rm\b/, reason: "deletes files in bulk" },
  { pattern: /\b(?:shred|wipefs)\b/, reason: "destroys data for good" },
  {
    pattern: /\b(?:chmod|chown)\s+(?:\S+\s+)*?(?:-[a-zA-Z]*R|--recursive\b)/,
    reason: "changes the permissions of a whole tree",
  },
  // Windows
  {
    pattern: /\b(?:rd|rmdir|del|erase)\s+(?:.*\s)?\/[sq]\b/i,
    reason: "deletes files recursively or without asking",
  },
  {
    pattern: /\bRemove-Item\b.*\s-Recurse\b/i,
    reason: "deletes files recursively",
  },
  // Git
  {
    pattern: /\bgit\s+(?:\S+\s+)*?reset\s+(?:.*\s)?--hard\b/,
    reason: "discards uncommitted changes",
  },
  {
    pattern: /\bgit\s+(?:\S+\s+)*?clean\b/,
    reason: "deletes untracked files",
  },
  {
    pattern: /\bgit\s+(?:\S+\s+)*?checkout\s+(?:.*\s)?(?:--\s|\.(?:\s|$))/,
    reason: "discards uncommitted changes",
  },
  {
    pattern: /\bgit\s+(?:\S+\s+)*?restore\b(?!.*--staged\b)/,
    reason: "discards uncommitted changes",
  },
  {
    pattern:
      /\bgit\s+(?:\S+\s+)*?push\b.*(?:\s(?:-f|--force(?:-with-lease)?(?:=\S*)?|--mirror|--delete|-d)\b|\s\+\S|\s:\S)/,
    reason: "overwrites or deletes history on the remote",
  },
  {
    pattern:
      /\bgit\s+(?:\S+\s+)*?branch\s+(?:.*\s)?(?:-D|--delete\s+--force|-df|-fd)\b/,
    reason: "deletes a branch that may not be merged",
  },
  {
    pattern: /\bgit\s+(?:\S+\s+)*?stash\s+(?:drop|clear)\b/,
    reason: "deletes stashed changes",
  },
  {
    pattern: /\bgit\s+(?:\S+\s+)*?(?:rebase|filter-branch|filter-repo)\b/,
    reason: "rewrites git history",
  },
  {
    pattern: /\bgit\s+(?:\S+\s+)*?commit\b.*\s--amend\b/,
    reason: "rewrites the last commit",
  },
  // System
  { pattern: /(?:^|[\s;&|(])sudo\s/, reason: "runs as root" },
  {
    pattern: /\b(?:mkfs(?:\.\w+)?|fdisk|parted|diskpart|format\s+[a-z]:)/i,
    reason: "formats or repartitions a disk",
  },
  {
    pattern: /\bdd\s+(?:.*\s)?of=/,
    reason: "writes raw data over a file or disk",
  },
  {
    // As a command, not a word in a search.
    pattern: /(?:^|[;&|]\s*|sudo\s+)(?:shutdown|reboot|poweroff|halt)\b/,
    reason: "shuts down or restarts the computer",
  },
  {
    pattern:
      /\b(?:curl|wget)\b.*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python3?|node)\b/,
    reason: "runs a script straight from the internet",
  },
  // Publishing and shared state
  {
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:\S+\s+)*?publish\b/,
    reason: "publishes a package",
  },
  {
    pattern: /\b(?:drop\s+(?:table|database|schema)|truncate\s+table)\b/i,
    reason: "deletes database data",
  },
  {
    pattern: /\bdocker\s+(?:\S+\s+)*?(?:prune|rm\s+(?:.*\s)?-f|volume\s+rm)\b/,
    reason: "deletes Docker containers, images or volumes",
  },
];

/**
 * Why the command needs the user's approval even in full access mode, or
 * undefined when it can run straight away.
 */
export const destructiveCommandReason = (command: string) =>
  RULES.find(({ pattern }) => pattern.test(command))?.reason;
