import { RotateCcwIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { useSetting } from "@/hooks/use-setting";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

import type {
  Settings,
  SettingsSection,
} from "../../../electron/shared/settings";

/** Text fields save this long after the last key press. */
const TEXT_SAVE_DELAY_MS = 400;

/** One setting: its name and explanation on the left, its control on the right. */
export const SettingRow = ({
  id,
  label,
  description,
  preview,
  onReset,
  children,
}: {
  id: string;
  label: string;
  description: string;
  /** Saved, but no feature uses it yet. Says why. */
  preview?: string;
  /** Shown as a reset button while the setting differs from its default. */
  onReset?: () => void;
  children: ReactNode;
}) => (
  <div className="group/row flex items-center justify-between gap-8 py-3">
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {preview && (
          <span
            className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
            title={preview}
          >
            Preview
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {description}
        {preview && <> {preview}</>}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {/* Keeps its space while hidden, so controls don't shift. */}
      <Button
        variant="ghost"
        size="icon-xs"
        title="Reset to default"
        aria-label={`Reset ${label} to default`}
        onClick={onReset}
        className={cn(
          "text-muted-foreground",
          !onReset && "pointer-events-none invisible",
        )}
      >
        <RotateCcwIcon />
      </Button>
      <div className="flex w-48 justify-end">{children}</div>
    </div>
  </div>
);

export const SettingSection = ({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  /** Shown at the right of the heading, e.g. a reset button. */
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section id={id} className="scroll-mt-6 space-y-1">
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-0.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
    <div className="divide-y divide-border/60">{children}</div>
  </section>
);

type RowProps = {
  label: string;
  description: string;
  preview?: string;
};

type KeysOfType<S extends SettingsSection, T> = {
  [K in keyof Settings[S]]: Settings[S][K] extends T ? K : never;
}[keyof Settings[S]];

export const SwitchSetting = <S extends SettingsSection>({
  section,
  setting,
  ...row
}: RowProps & { section: S; setting: KeysOfType<S, boolean> }) => {
  const id = `${section}-${String(setting)}`;
  const { value, isDefault, setValue, reset } = useSetting(section, setting);
  return (
    <SettingRow id={id} {...row} onReset={isDefault ? undefined : reset}>
      <Switch
        id={id}
        checked={value as boolean}
        onCheckedChange={(checked) =>
          setValue(checked as Settings[S][typeof setting])
        }
      />
    </SettingRow>
  );
};

export const SelectSetting = <S extends SettingsSection>({
  section,
  setting,
  options,
  ...row
}: RowProps & {
  section: S;
  setting: keyof Settings[S];
  options: readonly { label: string; value: Settings[S][keyof Settings[S]] }[];
}) => {
  const id = `${section}-${String(setting)}`;
  const { value, isDefault, setValue, reset } = useSetting(section, setting);
  // Base UI's Select compares values by identity; numbers and strings both work.
  const items = options.map((option) => ({
    label: option.label,
    value: option.value as unknown as string,
  }));
  return (
    <SettingRow id={id} {...row} onReset={isDefault ? undefined : reset}>
      <Select
        items={items}
        value={value as unknown as string}
        onValueChange={(next) => {
          if (next !== null) setValue(next as unknown as typeof value);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={String(item.value)} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
};

/**
 * A whole number within `min`–`max`. Saves while typing whenever the text is
 * a valid value; leaving the field puts back the saved value if it isn't.
 */
export const NumberSetting = <S extends SettingsSection>({
  section,
  setting,
  min,
  max,
  step = 1,
  unit,
  ...row
}: RowProps & {
  section: S;
  setting: KeysOfType<S, number>;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) => {
  const id = `${section}-${String(setting)}`;
  const { value, isDefault, setValue, reset } = useSetting(section, setting);
  const [draft, setDraft] = useState(String(value));

  // Follow changes made elsewhere (reset, settings.json).
  useEffect(() => setDraft(String(value)), [value]);

  const isValid = (text: string) => {
    const number = Number(text);
    return (
      text.trim() !== "" &&
      Number.isInteger(number) &&
      number >= min &&
      number <= max
    );
  };

  return (
    <SettingRow id={id} {...row} onReset={isDefault ? undefined : reset}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-invalid={!isValid(draft) || undefined}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (isValid(text)) {
              setValue(Number(text) as Settings[S][typeof setting]);
            }
          }}
          onBlur={() => setDraft(String(value))}
          className="w-24"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </SettingRow>
  );
};

/** Free text, saved shortly after typing stops and when the field loses focus. */
export const TextSetting = <S extends SettingsSection>({
  section,
  setting,
  placeholder,
  ...row
}: RowProps & {
  section: S;
  setting: KeysOfType<S, string>;
  placeholder?: string;
}) => {
  const id = `${section}-${String(setting)}`;
  const { value, isDefault, setValue, reset } = useSetting(section, setting);
  const [draft, setDraft] = useState(value as string);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(value as string), [value]);

  const save = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (text !== value) setValue(text as Settings[S][typeof setting]);
  };

  // Don't lose the last few key presses when leaving the page.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latestDraft.current !== useSettings.getState().settings[section][setting]) {
          useSettings
            .getState()
            .set(section, setting, latestDraft.current as Settings[S][typeof setting]);
        }
      }
    },
    [section, setting],
  );

  return (
    <SettingRow id={id} {...row} onReset={isDefault ? undefined : reset}>
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(text), TEXT_SAVE_DELAY_MS);
        }}
        onBlur={() => save(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") save(draft);
        }}
      />
    </SettingRow>
  );
};
