import { z } from "zod";

import { aiProviderIdValidator } from "@oscar/validators";

/*
 * The user's settings, saved as `settings.json` in the app's data folder.
 *
 * Every field falls back to its default on its own, so a hand-edited file with
 * one bad value keeps the rest. Add new fields with a `.catch(default)` the
 * same way; files saved before they existed then load with the default.
 */

export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const CURSOR_STYLES = ["line", "block", "underline"] as const;
export type CursorStyle = (typeof CURSOR_STYLES)[number];

export const FONT_SIZE = { min: 8, max: 32 } as const;
export const TAB_SIZE = { min: 1, max: 8 } as const;
export const SCROLLBACK = { min: 100, max: 100_000 } as const;

const fontSize = (fallback: number) =>
  z.number().int().min(FONT_SIZE.min).max(FONT_SIZE.max).catch(fallback);

/** Parses `{}` to get a section's defaults when the whole section is missing or wrong. */
const section = <T extends z.ZodRawShape>(shape: T) => {
  const schema = z.object(shape);
  return schema.catch(() => schema.parse({}));
};

export const settingsSchema = z.object({
  appearance: section({
    theme: z.enum(THEMES).catch("dark"),
  }),
  editor: section({
    /** CSS font-family list. Empty uses the app's monospace font. */
    fontFamily: z.string().max(500).catch(""),
    fontSize: fontSize(13),
    fontLigatures: z.boolean().catch(true),
    tabSize: z.number().int().min(TAB_SIZE.min).max(TAB_SIZE.max).catch(2),
    insertSpaces: z.boolean().catch(true),
    /** Guess the indentation from each file's contents, overriding the two above. */
    detectIndentation: z.boolean().catch(true),
    wordWrap: z.boolean().catch(false),
    minimap: z.boolean().catch(true),
    lineNumbers: z.boolean().catch(true),
    cursorStyle: z.enum(CURSOR_STYLES).catch("line"),
    cursorBlinking: z.boolean().catch(true),
    /** Formats with the language's formatter (if it has one) before saving. */
    formatOnSave: z.boolean().catch(false),
  }),
  terminal: section({
    /** Program new terminals start. Empty uses the login shell. */
    shell: z.string().max(1000).catch(""),
    /** Empty uses the editor's font. */
    fontFamily: z.string().max(500).catch(""),
    fontSize: fontSize(13),
    cursorStyle: z.enum(["bar", "block", "underline"]).catch("block"),
    cursorBlink: z.boolean().catch(true),
    scrollback: z
      .number()
      .int()
      .min(SCROLLBACK.min)
      .max(SCROLLBACK.max)
      .catch(5000),
  }),
  languages: section({
    /**
     * Use the TypeScript language server (the opened folder's own TypeScript
     * and tsconfig) instead of Monaco's built-in, single-file TypeScript.
     * Read at startup: Monaco can't swap its built-in providers later.
     */
    typescriptServer: z.boolean().catch(true),
    /**
     * Use Pyright for Python: completions, type errors, go to definition and
     * rename across files, with the folder's virtual environment if it has one.
     */
    pythonServer: z.boolean().catch(true),
  }),
  ai: section({
    inlineCompletions: z.boolean().catch(false),
    /** The model inline completions ask. `null` uses the chat's model. */
    inlineCompletionsModel: z
      .object({
        provider: aiProviderIdValidator,
        id: z.string().min(1).max(255),
      })
      .nullable()
      .catch(null),
    /** A button in the Source Control view that drafts a commit message. */
    commitMessages: z.boolean().catch(false),
  }),
  /**
   * Shortcuts the user changed, keyed by app hotkey id (see
   * `src/constants/app-hotkeys.ts`). `null` means removed. Only changes are
   * kept, so users still get new defaults.
   */
  keybindings: z
    .record(
      z.string(),
      z.union([z.string(), z.array(z.string()), z.null()]),
    )
    .catch({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsSection = Exclude<keyof Settings, "keybindings">;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Reads anything (parsed JSON, an IPC argument) as settings, defaulting what's invalid. */
export const parseSettings = (value: unknown): Settings =>
  settingsSchema.parse(
    value && typeof value === "object" && !Array.isArray(value) ? value : {},
  );

/** A change to some of the settings. Sections merge; `keybindings` is replaced whole. */
export type SettingsPatch = {
  [K in SettingsSection]?: Partial<Settings[K]>;
} & { keybindings?: Settings["keybindings"] };

export const applySettingsPatch = (
  current: Settings,
  patch: SettingsPatch,
): Settings => {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    merged[key] =
      key === "keybindings"
        ? value
        : { ...(current[key as SettingsSection] ?? {}), ...value };
  }
  return parseSettings(merged);
};
