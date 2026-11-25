/*
 * The look of every Medisense PDF: the Navy rail colours from the platform's Appearance tab, in
 * Inter. A PDF can't read CSS variables, so the values live here, and a test checks them against
 * the navy-rail theme in globals.css so the two can't drift apart. This is the one place in the
 * PDF code that holds colour values.
 */
export const pdfColour = {
  navy: "#172b36",
  navyMuted: "#9fb3bc",
  accent: "#0d7a43",
  accentTint: "#dff4e8",
  mint: "#eef5f2",
  mintSoft: "#f3f8f6",
  ink900: "#1f2937",
  ink700: "#4b5563",
  ink500: "#525d6b",
  border: "#e8eaeb",
  borderStrong: "#d1d5d7",
  white: "#ffffff",
  healthy: "#0a6b3c",
  healthyBg: "#e1f3ea",
  watch: "#a8480a",
  watchBg: "#fef1df",
  over: "#c0271c",
  overBg: "#feeceb",
} as const;

/** The navy-rail tokens each colour above must equal. */
export const parity: Record<keyof typeof pdfColour, string | null> = {
  navy: "--color-sidebar",
  navyMuted: "--color-sidebar-muted",
  accent: "--color-sidebar-active",
  accentTint: "--color-accent-tint",
  mint: "--color-page",
  mintSoft: "--color-sunken",
  ink900: "--color-ink-900",
  ink700: "--color-ink-700",
  ink500: "--color-ink-500",
  border: "--color-border",
  borderStrong: "--color-border-strong",
  white: "--color-surface",
  healthy: "--color-healthy",
  healthyBg: "--color-healthy-bg",
  watch: "--color-watch",
  watchBg: "--color-watch-bg",
  over: "--color-over",
  overBg: "--color-over-bg",
};

/** Points. A4 with generous margins; type sizes step by a clear ratio so hierarchy reads at a glance. */
export const pdfSize = {
  page: { top: 64, bottom: 56, side: 40 },
  title: 22,
  section: 11,
  body: 9,
  small: 8,
  tiny: 7,
  value: 20,
} as const;

export const FONT = "Inter";
