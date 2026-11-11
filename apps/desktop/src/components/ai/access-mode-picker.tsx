import {
  CheckIcon,
  ChevronDownIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import type { AiAccessModeType } from "@oscar/validators";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MODES: {
  id: AiAccessModeType;
  icon: LucideIcon;
  name: string;
  description: string;
}[] = [
  {
    id: "approval",
    icon: ShieldCheckIcon,
    name: "Ask for approval",
    description:
      "Changes to files and commands wait for you to approve or deny them.",
  },
  {
    id: "full-access",
    icon: ShieldOffIcon,
    name: "Full access",
    description:
      "Changes files and runs commands in the opened folder without asking.",
  },
];

/**
 * Picks whether the chat's file changes and commands wait for approval or
 * run straight away. Beside the model picker, under the message box.
 */
const AccessModePicker = ({
  value,
  onChange,
  disabled,
  disabledReason,
}: {
  value: AiAccessModeType;
  onChange: (mode: AiAccessModeType) => void;
  disabled?: boolean;
  /** Shown as the button's tooltip while it's disabled. */
  disabledReason?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const current = MODES.find((mode) => mode.id === value) ?? MODES[0];
  const isFullAccess = current.id === "full-access";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            disabled={disabled}
            className={cn(
              "shrink-0",
              isFullAccess
                ? "text-amber-600 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-500"
                : "text-muted-foreground",
            )}
            title={
              disabled && disabledReason
                ? disabledReason
                : `${current.name}: ${current.description}`
            }
          />
        }
      >
        <current.icon />
        <span className="truncate">
          {isFullAccess ? "Full access" : "Approval"}
        </span>
        <ChevronDownIcon />
      </PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-72 gap-0 p-1">
        {MODES.map((mode) => {
          const isSelected = mode.id === value;
          return (
            <button
              key={mode.id}
              type="button"
              className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted",
                isSelected && "bg-muted",
              )}
              onClick={() => {
                onChange(mode.id);
                setIsOpen(false);
              }}
            >
              <mode.icon
                className={cn(
                  "mt-px size-3.5 shrink-0",
                  mode.id === "full-access"
                    ? "text-amber-600 dark:text-amber-500"
                    : "text-muted-foreground",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{mode.name}</span>
                <span className="block text-muted-foreground">
                  {mode.description}
                </span>
              </span>
              <CheckIcon
                className={cn(
                  "mt-px size-3 shrink-0",
                  !isSelected && "invisible",
                )}
              />
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};

export default AccessModePicker;
