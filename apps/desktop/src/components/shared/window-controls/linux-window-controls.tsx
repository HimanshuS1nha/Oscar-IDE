import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { WindowControlsProps } from ".";

type TitleButtonProps = {
  label: string;
  isFocused: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** GNOME / Adwaita style: small 24px round button with a dark grey border. */
const TitleButton = ({
  label,
  isFocused,
  onClick,
  children,
}: TitleButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={cn(
      "flex size-6 items-center justify-center rounded-full outline-none",
      "border border-neutral-700/45 dark:border-black/70",
      "bg-neutral-500/15 hover:bg-neutral-500/25 active:bg-neutral-500/40",
      "text-foreground transition-colors duration-100",
      !isFocused && "text-foreground/50",
    )}
  >
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  </button>
);

const LinuxWindowControls = ({
  isMaximized,
  isFocused,
  onClose,
  onMinimize,
  onMaximize,
  className,
}: WindowControlsProps) => (
  <div
    className={cn(
      "flex items-center gap-2.5 app-no-drag",
      className,
    )}
  >
    <TitleButton label="Minimize" isFocused={isFocused} onClick={onMinimize}>
      <path d="M5 10.5h6" />
    </TitleButton>

    <TitleButton
      label={isMaximized ? "Restore" : "Maximize"}
      isFocused={isFocused}
      onClick={onMaximize}
    >
      {isMaximized ? (
        <>
          <rect x="5" y="6.5" width="4.5" height="4.5" rx="0.75" />
          <path d="M7 5h3.25a.75.75 0 0 1 .75.75V9" />
        </>
      ) : (
        <rect x="5" y="5" width="6" height="6" rx="1" />
      )}
    </TitleButton>

    <TitleButton label="Close" isFocused={isFocused} onClick={onClose}>
      <path d="M5.25 5.25l5.5 5.5M10.75 5.25l-5.5 5.5" />
    </TitleButton>
  </div>
);

export default LinuxWindowControls;
