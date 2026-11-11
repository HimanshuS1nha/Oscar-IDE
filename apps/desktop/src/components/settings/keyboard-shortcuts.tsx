import {
  areHotkeysEqual,
  useAppHotkeyList,
  useCustomHotkeys,
  useFormatForDisplay,
  useHotkeyRecorder,
  type AppHotkeyId,
  type AppHotkeyListItem,
  type Hotkey,
  type HotkeyChordRecorderValidationContext,
} from "@tanstack/react-hotkeys";
import { LockIcon, RotateCcwIcon, SearchIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";

import {
  editorHotkeyNames,
  editorHotkeys,
  hotkeyPlatform,
} from "@/constants/app-hotkeys";
import { cn } from "@/lib/utils";

const platform = hotkeyPlatform();

/** Keys the editor or terminal handle themselves, which shortcuts can't take. */
const reservedHotkeys: { hotkey: Hotkey; name: string }[] = [
  ...(Object.keys(editorHotkeys) as (keyof typeof editorHotkeys)[]).map(
    (key) => ({ hotkey: editorHotkeys[key], name: editorHotkeyNames[key] }),
  ),
  // Terminal copy and paste outside macOS (see lib/terminal-sessions).
  ...(platform === "mac"
    ? []
    : [
        { hotkey: "Control+Shift+C" as Hotkey, name: "Terminal Copy" },
        { hotkey: "Control+Shift+V" as Hotkey, name: "Terminal Paste" },
      ]),
];

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

/**
 * The recorder captures the key's position (`Mod+[KeyS]`), so Option+S on
 * macOS records S rather than "ß". For a plain letter or digit, store the
 * character instead (`Mod+S`): that matches the defaults' form, so conflicts
 * are found, and it follows the user's layout.
 */
const preferCharacter = (hotkey: Hotkey, event: KeyboardEvent): Hotkey => {
  if (typeof hotkey !== "string") return hotkey;
  const match = /^(.*)\[(Key[A-Z]|Digit[0-9])\]$/.exec(hotkey);
  if (!match || !/^[a-z0-9]$/i.test(event.key)) return hotkey;
  return `${match[1]}${event.key.toUpperCase()}` as Hotkey;
};

type Item = AppHotkeyListItem;

const ShortcutRow = ({ item }: { item: Item }) => {
  const { appHotkey, isCustom } = item;
  const id = appHotkey.id as AppHotkeyId;
  const name = appHotkey.meta?.name ?? id;
  const format = useFormatForDisplay();
  const { findConflicts, setCustomHotkey, resetCustomHotkey } =
    useCustomHotkeys();
  const [error, setError] = useState<string | null>(null);
  /** The accepted hotkey in the form to save, set by `validate` just before `onRecord`. */
  const accepted = useRef<Hotkey | null>(null);

  const validate = (
    recorded: Hotkey,
    { event, parsedChord }: HotkeyChordRecorderValidationContext,
  ): true | string => {
    const key = "key" in parsedChord ? parsedChord.key : undefined;
    const hasModifier = parsedChord.ctrl || parsedChord.alt || parsedChord.meta;
    if (!hasModifier && !(key && FUNCTION_KEY.test(key))) {
      return platform === "mac"
        ? "Include ⌘, ⌃ or ⌥. Plain keys are for typing."
        : "Include Ctrl or Alt. Plain keys are for typing.";
    }

    const candidate = preferCharacter(recorded, event);
    const reserved = reservedHotkeys.find(
      (entry) =>
        areHotkeysEqual(candidate, entry.hotkey, platform) ||
        areHotkeysEqual(recorded, entry.hotkey, platform),
    );
    if (reserved) return `${format(candidate)} is the editor's ${reserved.name}.`;

    // Defaults are written both ways (`Mod+O`, `Control+[Backquote]`), so check both.
    const [conflict] = [
      ...findConflicts(id, candidate),
      ...findConflicts(id, recorded),
    ];
    if (conflict) {
      return `${format(candidate)} is already used by ${conflict.meta?.name ?? conflict.id}.`;
    }

    accepted.current = candidate;
    return true;
  };

  const recorder = useHotkeyRecorder({
    validate,
    onReject: (rejection) => setError(rejection.message),
    onRecord: (recorded) => {
      const hotkey = accepted.current ?? recorded;
      accepted.current = null;
      const [conflict] = setCustomHotkey(id, hotkey);
      setError(
        conflict
          ? `${format(hotkey)} is already used by ${conflict.meta?.name ?? conflict.id}.`
          : null,
      );
    },
    onCancel: () => setError(null),
    onClear: () => {
      setCustomHotkey(id, null);
      setError(null);
      recorder.stopRecording();
    },
  });

  const current = appHotkey.hotkey;
  const label = current ? format(current) : null;

  return (
    <div className="flex items-center justify-between gap-6 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate">{name}</span>
          {isCustom && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary"
              title="Changed from the default"
            />
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (recorder.isRecording) recorder.cancelRecording();
            else recorder.startRecording();
          }}
          // Leaving the button ends recording, as Escape does.
          onBlur={() => {
            if (recorder.isRecording) recorder.cancelRecording();
          }}
          aria-label={
            recorder.isRecording
              ? `Recording a shortcut for ${name}`
              : `Change shortcut for ${name}, currently ${label ?? "not set"}`
          }
          title={
            recorder.isRecording
              ? "Press the new shortcut. Esc cancels; Backspace removes it."
              : "Click to change"
          }
          className={cn(
            "flex h-7 min-w-36 items-center justify-end rounded-md border border-transparent px-2 text-xs outline-none hover:border-border focus-visible:ring-3 focus-visible:ring-ring/50",
            recorder.isRecording && "border-primary bg-primary/5 hover:border-primary",
          )}
        >
          {recorder.isRecording ? (
            <span className="text-primary">Press keys…</span>
          ) : label ? (
            <Kbd>{label}</Kbd>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Remove shortcut"
          aria-label={`Remove shortcut for ${name}`}
          disabled={!current}
          onClick={() => {
            setCustomHotkey(id, null);
            setError(null);
          }}
          className={cn("text-muted-foreground", !current && "invisible")}
        >
          <XIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={
            appHotkey.defaultHotkey
              ? `Reset to ${format(appHotkey.defaultHotkey)}`
              : "Reset to no shortcut"
          }
          aria-label={`Reset shortcut for ${name}`}
          disabled={!isCustom}
          onClick={() => {
            resetCustomHotkey(id);
            setError(null);
          }}
          className={cn("text-muted-foreground", !isCustom && "invisible")}
        >
          <RotateCcwIcon />
        </Button>
      </div>
    </div>
  );
};

/** Monaco's own shortcuts: listed for reference, not changeable. */
const FixedShortcutRow = ({ name, hotkey }: { name: string; hotkey: Hotkey }) => {
  const format = useFormatForDisplay();
  return (
    <div className="flex items-center justify-between gap-6 py-2 text-sm">
      <span className="truncate">{name}</span>
      <div className="flex shrink-0 items-center gap-1">
        <span
          className="flex h-7 min-w-36 items-center justify-end gap-2 px-2"
          title="Built into the editor; can't be changed"
        >
          <LockIcon className="size-3 text-muted-foreground" />
          <Kbd>{format(hotkey)}</Kbd>
        </span>
        {/* Line up with the editable rows' two buttons. */}
        <span className="size-6" />
        <span className="size-6" />
      </div>
    </div>
  );
};

const matches = (query: string, ...texts: (string | null | undefined)[]) =>
  texts.some((text) => text?.toLowerCase().includes(query));

/**
 * Every app shortcut, grouped as in the menu. Click a shortcut and press the
 * new keys to change it; changes are saved with the other settings.
 */
export const KeyboardShortcuts = () => {
  const items = useAppHotkeyList();
  const { customHotkeys, resetCustomHotkeys } = useCustomHotkeys();
  const format = useFormatForDisplay();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const changedCount = Object.keys(customHotkeys).length;

  const groups = useMemo(() => {
    const byGroup = new Map<string, Item[]>();
    for (const item of items) {
      const { meta, hotkey } = item.appHotkey;
      if (
        query &&
        !matches(query, meta?.name, meta?.group, hotkey && format(hotkey))
      ) {
        continue;
      }
      const group = meta?.group ?? "Other";
      byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
    }
    return [...byGroup];
  }, [items, query, format]);

  const fixed = (
    Object.keys(editorHotkeys) as (keyof typeof editorHotkeys)[]
  ).filter((key) =>
    !query ||
    matches(query, editorHotkeyNames[key], "editor", format(editorHotkeys[key])),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by command or key"
            aria-label="Search shortcuts"
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={changedCount === 0}
          onClick={resetCustomHotkeys}
        >
          <RotateCcwIcon />
          Reset all
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Click a shortcut, then press the new keys. Esc cancels; Backspace
        removes the shortcut.
        {changedCount > 0 &&
          ` ${changedCount} changed from the default${changedCount === 1 ? "" : "s"}.`}
      </p>

      {groups.map(([group, groupItems]) => (
        <section key={group} className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">{group}</h3>
          <div className="divide-y divide-border/60">
            {groupItems.map((item) => (
              <ShortcutRow key={item.appHotkey.id} item={item} />
            ))}
          </div>
        </section>
      ))}

      {fixed.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">
            Editor (built in)
          </h3>
          <div className="divide-y divide-border/60">
            {fixed.map((key) => (
              <FixedShortcutRow
                key={key}
                name={editorHotkeyNames[key]}
                hotkey={editorHotkeys[key]}
              />
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 && fixed.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No shortcuts match “{search.trim()}”.
        </p>
      )}
    </div>
  );
};
