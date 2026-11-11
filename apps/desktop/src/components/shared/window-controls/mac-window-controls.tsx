import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { WindowControlsProps } from ".";

type TrafficLightProps = {
  label: string;
  color: string;
  border: string;
  glyph: string;
  isFocused: boolean;
  onClick: () => void;
  children: ReactNode;
};

const TrafficLight = ({
  label,
  color,
  border,
  glyph,
  isFocused,
  onClick,
  children,
}: TrafficLightProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    style={
      {
        "--light": color,
        "--light-border": border,
        "--glyph": glyph,
      } as CSSProperties
    }
    className={cn(
      "relative size-3 rounded-full border-[0.5px] outline-none",
      "flex items-center justify-center",
      "active:brightness-75",
      isFocused
        ? "bg-(--light) border-(--light-border)"
        : "bg-[#DDDDDC] border-[#D1D0D2] dark:bg-[#4D4D4F] dark:border-[#3F3F41] group-hover:bg-(--light) group-hover:border-(--light-border)",
    )}
  >
    <svg
      viewBox="0 0 12 12"
      className="size-3 opacity-0 group-hover:opacity-100 text-(--glyph)"
      aria-hidden
    >
      {children}
    </svg>
  </button>
);

const MacWindowControls = ({
  isFullScreen,
  isFocused,
  onClose,
  onMinimize,
  onMaximize,
  className,
}: WindowControlsProps) => (
  <div
    className={cn(
      "group flex items-center gap-2 px-1.5 app-no-drag",
      className,
    )}
  >
    <TrafficLight
      label="Close"
      color="#FF5F57"
      border="#E2463F"
      glyph="#4D0000"
      isFocused={isFocused}
      onClick={onClose}
    >
      <path
        d="M3.75 3.75 8.25 8.25M8.25 3.75 3.75 8.25"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </TrafficLight>

    <TrafficLight
      label="Minimize"
      color="#FEBC2E"
      border="#E1A116"
      glyph="#985712"
      isFocused={isFocused}
      onClick={onMinimize}
    >
      <path
        d="M3.25 6h5.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </TrafficLight>

    <TrafficLight
      label={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
      color="#28C840"
      border="#12AC28"
      glyph="#0B650D"
      isFocused={isFocused}
      onClick={onMaximize}
    >
      {isFullScreen ? (
        <path
          d="M5.6 5.6V2.7L2.7 5.6ZM6.4 6.4V9.3L9.3 6.4Z"
          fill="currentColor"
        />
      ) : (
        <path d="M3.3 3.3H7.1L3.3 7.1ZM8.7 8.7H4.9L8.7 4.9Z" fill="currentColor" />
      )}
    </TrafficLight>
  </div>
);

export default MacWindowControls;
