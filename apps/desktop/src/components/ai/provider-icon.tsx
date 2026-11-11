import type { AiProviderType } from "@oscar/validators";

import claudeLogo from "@/assets/providers/claude.png";
import geminiLogo from "@/assets/providers/gemini.png";
import openaiLogo from "@/assets/providers/openai.png";
import { cn } from "@/lib/utils";

/**
 * The providers' logos, trimmed to their edges on a transparent background.
 * OpenAI's is a single-color shape, painted in the text color (see below).
 */
const LOGOS = {
  openai: openaiLogo,
  anthropic: claudeLogo,
  gemini: geminiLogo,
} satisfies Record<AiProviderType["id"], string>;

/** Shapes without colors of their own: painted in the text color. */
const MONOCHROME = new Set<AiProviderType["id"]>(["openai"]);

/** A provider's logo, 16px unless `className` sets another size. */
const ProviderIcon = ({
  provider,
  className,
}: {
  provider: AiProviderType["id"];
  className?: string;
}) => {
  const classes = cn("inline-block size-4 shrink-0", className);

  // Black in the file; used as a mask so it shows white in the dark theme
  // and dark in the light one, like the text around it.
  if (MONOCHROME.has(provider)) {
    const mask = `url(${LOGOS[provider]}) center / contain no-repeat`;
    return (
      <span
        aria-hidden
        className={cn("bg-current", classes)}
        style={{ mask, WebkitMask: mask }}
      />
    );
  }

  return (
    <img
      src={LOGOS[provider]}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("object-contain", classes)}
    />
  );
};

export default ProviderIcon;
