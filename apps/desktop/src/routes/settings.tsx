import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, FileJsonIcon, RotateCcwIcon } from "lucide-react";
import { z } from "zod";

import ModelPicker from "@/components/ai/model-picker";
import { KeyboardShortcuts } from "@/components/settings/keyboard-shortcuts";
import {
  NumberSetting,
  SelectSetting,
  SettingRow,
  SettingSection,
  SwitchSetting,
  TextSetting,
} from "@/components/settings/setting-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { useSetting } from "@/hooks/use-setting";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

import {
  FONT_SIZE,
  SCROLLBACK,
  type SettingsSection,
} from "../../electron/shared/settings";

const tabs = [
  { value: "general", label: "General" },
  { value: "shortcuts", label: "Keyboard Shortcuts" },
] as const;

export const Route = createFileRoute("/settings")({
  validateSearch: z.object({
    tab: z.enum(["general", "shortcuts"]).catch("general").optional(),
  }),
  component: SettingsPage,
});

/** The model inline completions ask, picked as the chat's model is. */
const InlineCompletionsModelSetting = () => {
  const { value, setValue, isDefault, reset } = useSetting(
    "ai",
    "inlineCompletionsModel",
  );
  return (
    <SettingRow
      id="ai-inline-completions-model"
      label="Inline completions model"
      description="The model that suggests code as you type. A small, fast model keeps suggestions quick."
      onReset={isDefault ? undefined : reset}
    >
      <ModelPicker
        id="ai-inline-completions-model"
        value={value}
        onChange={setValue}
        noneOption="Same as chat"
        side="bottom"
        variant="outline"
      />
    </SettingRow>
  );
};

const themes = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
  { label: "Match system", value: "system" },
] as const;

const tabSizes = [
  { label: "2 spaces", value: 2 },
  { label: "4 spaces", value: 4 },
  { label: "8 spaces", value: 8 },
] as const;

const editorCursorStyles = [
  { label: "Line", value: "line" },
  { label: "Block", value: "block" },
  { label: "Underline", value: "underline" },
] as const;

const terminalCursorStyles = [
  { label: "Bar", value: "bar" },
  { label: "Block", value: "block" },
  { label: "Underline", value: "underline" },
] as const;

/** Monaco picks its TypeScript support once, at startup (see lib/monaco). */
const TypescriptServerSetting = () => {
  const enabled = useSettings(
    (state) => state.settings.languages.typescriptServer,
  );
  const atStartup = window.electron.settings.initial.languages.typescriptServer;
  return (
    <SwitchSetting
      section="languages"
      setting="typescriptServer"
      label="TypeScript language server"
      description="Use the folder's tsconfig and TypeScript for completions, errors, go to definition, rename and quick fixes across files. Off uses Monaco's built-in, single-file support."
      preview={
        enabled === atStartup ? undefined : "Takes effect when Oscar restarts."
      }
    />
  );
};

const ResetSectionButton = ({ section }: { section: SettingsSection }) => (
  <Button
    variant="ghost"
    size="xs"
    className="text-muted-foreground"
    onClick={() => useSettings.getState().reset(section)}
  >
    Reset section
  </Button>
);

const GeneralSettings = () => (
  <div className="space-y-8">
    <SettingSection
      id="appearance"
      title="Appearance"
      action={<ResetSectionButton section="appearance" />}
    >
      <SelectSetting
        section="appearance"
        setting="theme"
        label="Theme"
        description="Colours for the whole app, editor and terminal."
        options={themes}
      />
    </SettingSection>

    <Separator />

    <SettingSection
      id="editor"
      title="Editor"
      action={<ResetSectionButton section="editor" />}
    >
      <TextSetting
        section="editor"
        setting="fontFamily"
        label="Font family"
        description="A CSS font list, e.g. “JetBrains Mono”, monospace. Empty uses the app's font."
        placeholder="Fira Code"
      />
      <NumberSetting
        section="editor"
        setting="fontSize"
        label="Font size"
        description="Size of the code in the editor."
        min={FONT_SIZE.min}
        max={FONT_SIZE.max}
        unit="px"
      />
      <SwitchSetting
        section="editor"
        setting="fontLigatures"
        label="Font ligatures"
        description="Join character pairs like => and != if the font supports it."
      />
      <SelectSetting
        section="editor"
        setting="tabSize"
        label="Tab size"
        description="How many spaces a tab is shown as and inserts."
        options={tabSizes}
      />
      <SwitchSetting
        section="editor"
        setting="insertSpaces"
        label="Indent with spaces"
        description="Pressing Tab inserts spaces instead of a tab character."
      />
      <SwitchSetting
        section="editor"
        setting="detectIndentation"
        label="Detect indentation"
        description="Match each file's existing indentation; the two settings above apply to new files and files without any."
      />
      <SwitchSetting
        section="editor"
        setting="wordWrap"
        label="Word wrap"
        description="Wrap long lines to fit the editor's width."
      />
      <SwitchSetting
        section="editor"
        setting="lineNumbers"
        label="Line numbers"
        description="Show line numbers beside the code."
      />
      <SwitchSetting
        section="editor"
        setting="minimap"
        label="Minimap"
        description="Show an overview of the file beside the scrollbar."
      />
      <SelectSetting
        section="editor"
        setting="cursorStyle"
        label="Cursor style"
        description="The shape of the text cursor."
        options={editorCursorStyles}
      />
      <SwitchSetting
        section="editor"
        setting="cursorBlinking"
        label="Blinking cursor"
        description="Blink the text cursor."
      />
      <SwitchSetting
        section="editor"
        setting="formatOnSave"
        label="Format on save"
        description="Format the file with its language's formatter each time it's saved."
      />
    </SettingSection>

    <Separator />

    <SettingSection
      id="languages"
      title="Languages"
      action={<ResetSectionButton section="languages" />}
    >
      <TypescriptServerSetting />
      <SwitchSetting
        section="languages"
        setting="pythonServer"
        label="Python language server"
        description="Use Pyright for completions, type errors, go to definition and rename across files. Imports resolve with the folder's .venv, venv or env if it has one, otherwise the python on your PATH."
      />
    </SettingSection>

    <Separator />

    <SettingSection
      id="terminal"
      title="Terminal"
      action={<ResetSectionButton section="terminal" />}
    >
      <TextSetting
        section="terminal"
        setting="shell"
        label="Shell"
        description="Program new terminals start. Empty uses your login shell."
        placeholder={
          window.electron.platform === "win32" ? "powershell.exe" : "/bin/bash"
        }
      />
      <TextSetting
        section="terminal"
        setting="fontFamily"
        label="Font family"
        description="Empty uses the editor's font."
        placeholder="Same as editor"
      />
      <NumberSetting
        section="terminal"
        setting="fontSize"
        label="Font size"
        description="Size of the text in terminals."
        min={FONT_SIZE.min}
        max={FONT_SIZE.max}
        unit="px"
      />
      <SelectSetting
        section="terminal"
        setting="cursorStyle"
        label="Cursor style"
        description="The shape of the terminal's cursor."
        options={terminalCursorStyles}
      />
      <SwitchSetting
        section="terminal"
        setting="cursorBlink"
        label="Blinking cursor"
        description="Blink the terminal's cursor."
      />
      <NumberSetting
        section="terminal"
        setting="scrollback"
        label="Scrollback"
        description="Lines of output kept for scrolling back."
        min={SCROLLBACK.min}
        max={SCROLLBACK.max}
        step={100}
        unit="lines"
      />
    </SettingSection>

    <Separator />

    <SettingSection
      id="ai"
      title="AI"
      action={<ResetSectionButton section="ai" />}
    >
      <SwitchSetting
        section="ai"
        setting="inlineCompletions"
        label="Inline completions"
        description="Suggest code as you type, at the end of a line. Press Tab to accept. Needs you to be signed in."
      />
      <InlineCompletionsModelSetting />
      <SwitchSetting
        section="ai"
        setting="commitMessages"
        label="Commit message suggestions"
        description="Show a button in Source Control that drafts a commit message from your staged changes (or all changes, if nothing is staged). Uses the chat's model and needs you to be signed in."
      />
    </SettingSection>
  </div>
);

function SettingsPage() {
  const { tab = "general" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <header className="space-y-4">
          <Link
            to="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "-ml-2.5 text-muted-foreground",
            )}
          >
            <ArrowLeftIcon />
            Back to editor
          </Link>
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Changes apply and save as you make them.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {tab === "general" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => useSettings.getState().reset()}
                >
                  <RotateCcwIcon />
                  Reset all
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                title="Edit the settings as JSON. Changes saved there apply here too."
                onClick={() =>
                  void window.electron.settings
                    .openFile()
                    .catch((error) =>
                      console.error("Couldn't open settings.json", error),
                    )
                }
              >
                <FileJsonIcon />
                Open settings.json
              </Button>
            </div>
          </div>
        </header>

        <div role="tablist" className="flex gap-1 border-b">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() =>
                void navigate({ search: { tab: item.value }, replace: true })
              }
              className={cn(
                "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                tab === item.value && "border-primary text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === "general" ? <GeneralSettings /> : <KeyboardShortcuts />}
        </div>
      </div>
    </div>
  );
}
