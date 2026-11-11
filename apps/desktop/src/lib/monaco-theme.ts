import type * as Monaco from "monaco-editor";

export const MONACO_THEME = "oscar";

/**
 * Monaco only understands hex colours, while the app's tokens are oklch() CSS
 * variables. Paint each one onto a 1×1 canvas and read the pixel back.
 */
export const createColorReader = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const styles = getComputedStyle(document.documentElement);

  /** `alpha` is 0–1. Returns `#rrggbb` or `#rrggbbaa`. */
  return (variable: string, alpha = 1) => {
    const value = styles.getPropertyValue(variable).trim();

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;

    const hex = (n: number) => n.toString(16).padStart(2, "0");
    const a = Math.round(alpha * 255);
    return `#${hex(r)}${hex(g)}${hex(b)}${a === 255 ? "" : hex(a)}`;
  };
};

const TRANSPARENT = "#00000000";

/** Builds the editor theme from the app's current CSS colour tokens. */
const buildTheme = (): Monaco.editor.IStandaloneThemeData => {
  const color = createColorReader();
  const isDark = document.documentElement.classList.contains("dark");
  const token = (variable: string, alpha?: number) =>
    color(variable, alpha).slice(1); // token rules take hex without '#'

  return {
    base: isDark ? "vs-dark" : "vs",
    // Keep Monaco's per-language syntax colours; only tint the parts that set the mood.
    inherit: true,
    rules: [
      { token: "comment", foreground: token("--muted-foreground", 0.6), fontStyle: "italic" },
      { token: "keyword", foreground: token(isDark ? "--chart-1" : "--primary") },
    ],
    colors: {
      // Canvas
      "editor.background": color("--background"),
      "editor.foreground": color("--foreground"),
      "editorGutter.background": color("--background"),
      "minimap.background": color("--background"),
      focusBorder: color("--ring", 0.6),
      "widget.shadow": "#00000066",

      // Cursor, current line, line numbers
      "editorCursor.foreground": color("--primary"),
      "editor.lineHighlightBackground": color("--muted", 0.7),
      "editor.lineHighlightBorder": TRANSPARENT,
      "editorLineNumber.foreground": color("--muted-foreground", 0.4),
      "editorLineNumber.activeForeground": color("--foreground"),

      // Selection and highlights
      "editor.selectionBackground": color("--accent", 0.55),
      "editor.inactiveSelectionBackground": color("--accent", 0.3),
      "editor.selectionHighlightBackground": color("--accent", 0.25),
      "editor.wordHighlightBackground": color("--accent", 0.25),
      "editor.findMatchBackground": color("--primary", 0.45),
      "editor.findMatchHighlightBackground": color("--primary", 0.2),
      "editorBracketMatch.background": color("--accent", 0.3),
      "editorBracketMatch.border": color("--primary", 0.6),

      // Guides and whitespace
      "editorIndentGuide.background1": color("--border", 0.8),
      "editorIndentGuide.activeBackground1": color("--muted-foreground", 0.4),
      "editorWhitespace.foreground": color("--border"),
      "editorRuler.foreground": color("--border"),

      // Scrollbars
      "scrollbar.shadow": TRANSPARENT,
      "scrollbarSlider.background": color("--muted-foreground", 0.15),
      "scrollbarSlider.hoverBackground": color("--muted-foreground", 0.25),
      "scrollbarSlider.activeBackground": color("--muted-foreground", 0.35),
      "editorOverviewRuler.border": TRANSPARENT,

      // Find widget, hovers, suggestions, context menu
      "editorWidget.background": color("--popover"),
      "editorWidget.foreground": color("--popover-foreground"),
      "editorWidget.border": color("--border"),
      "editorHoverWidget.background": color("--popover"),
      "editorHoverWidget.border": color("--border"),
      "editorSuggestWidget.background": color("--popover"),
      "editorSuggestWidget.border": color("--border"),
      "editorSuggestWidget.selectedBackground": color("--accent"),
      "input.background": color("--background"),
      "input.border": color("--border"),
      "inputOption.activeBorder": color("--primary"),
      "list.hoverBackground": color("--muted"),
      "list.activeSelectionBackground": color("--accent"),
      "list.activeSelectionForeground": color("--accent-foreground"),
      "list.highlightForeground": color("--primary"),
      "menu.background": color("--popover"),
      "menu.foreground": color("--popover-foreground"),
      "menu.selectionBackground": color("--accent"),
      "menu.border": color("--border"),

      // Diagnostics
      "editorError.foreground": color("--destructive"),
    },
  };
};

export const defineMonacoTheme = (monaco: typeof Monaco) => {
  monaco.editor.defineTheme(MONACO_THEME, buildTheme());
};

/** The app's --font-mono, with fallbacks for machines that don't have it. */
export const editorFontFamily = () => {
  const appFont = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();
  return [appFont, '"JetBrains Mono"', "Menlo", "Consolas", "monospace"]
    .filter(Boolean)
    .join(", ");
};
