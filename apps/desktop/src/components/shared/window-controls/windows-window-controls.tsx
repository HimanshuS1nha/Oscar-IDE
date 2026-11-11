import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { WindowControlsProps } from ".";

type CaptionButtonProps = {
  label: string;
  isClose?: boolean;
  isFocused: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** Windows 11 caption button: 46px wide, full title bar height, 10px glyph. */
const CaptionButton = ({
  label,
  isClose,
  isFocused,
  onClick,
  children,
}: CaptionButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={cn(
      "flex h-full min-h-8 w-11.5 items-center justify-center outline-none",
      "text-foreground transition-colors duration-100",
      !isFocused && "text-foreground/40",
      isClose
        ? "hover:bg-[#C42B1C] hover:text-white active:bg-[#C42B1C]/90 active:text-white/80"
        : "hover:bg-foreground/6 active:bg-foreground/4 active:text-foreground/60",
    )}
  >
    <svg
      viewBox="0 0 10 10"
      width={10}
      height={10}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      aria-hidden
    >
      {children}
    </svg>
  </button>
);

const WindowsWindowControls = ({
  isMaximized,
  isFocused,
  onClose,
  onMinimize,
  onMaximize,
  className,
}: WindowControlsProps) => (
  <div
    className={cn(
      "flex items-stretch self-stretch app-no-drag",
      className,
    )}
  >
    <CaptionButton label="Minimize" isFocused={isFocused} onClick={onMinimize}>
      <path d="M0 5.5h10" />
    </CaptionButton>

    <CaptionButton
      label={isMaximized ? "Restore Down" : "Maximize"}
      isFocused={isFocused}
      onClick={onMaximize}
    >
      {isMaximized ? (
        <>
          <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
          <path d="M2.5 2.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
        </>
      ) : (
        <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
      )}
    </CaptionButton>

    <CaptionButton
      label="Close"
      isClose
      isFocused={isFocused}
      onClick={onClose}
    >
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
    </CaptionButton>
  </div>
);

export default WindowsWindowControls;
