/**
 * Appearance: theme previews, accent presets and the custom-accent generator.
 *
 * The preview colours below show what *other* themes look like, so they can't come from the active
 * tokens; they are copied from globals.css. Everything applied to the app still goes through
 * data-* attributes and tokens (see src/app/theme-script.tsx).
 */
import { THEMES, type ACCENTS, type Appearance, type ThemeId } from "@/app/theme-script";

export type ThemePreview = {
  page: string;
  surface: string;
  sidebar: string;
  sidebarActive: string;
  sidebarInk: string;
  ink: string;
  border: string;
  fill: string;
};

const p = (
  page: string,
  surface: string,
  sidebar: string,
  sidebarActive: string,
  ink: string,
  border: string,
  fill: string,
  sidebarInk: string,
): ThemePreview => ({ page, surface, sidebar, sidebarActive, ink, border, fill, sidebarInk });

/* design-ok: previews of other themes, copied from globals.css */
export const themePreviews: Record<ThemeId, ThemePreview> = {
  "premium-light": p(
    "#F6F4EF",
    "#FFFFFF",
    "#EFECE5",
    "#FFFFFF",
    "#1C1A17",
    "#E4E0D7",
    "#1570EF",
    "#2A2723",
  ), // design-ok
  "clinical-blue": p(
    "#F4F8FE",
    "#FFFFFF",
    "#F4F8FE",
    "#1570EF",
    "#0B1533",
    "#E9ECEF",
    "#1570EF",
    "#101C35",
  ), // design-ok
  green: p("#F2FAF5", "#FFFFFF", "#F2FAF5", "#08844A", "#0A2015", "#E6ECE9", "#08844A", "#0A2015"), // design-ok
  "navy-rail": p(
    "#EEF5F2",
    "#FFFFFF",
    "#172B36",
    "#0D7A43",
    "#1F2937",
    "#E8EAEB",
    "#0D7A43",
    "#F3F7F5",
  ), // design-ok
  mint: p("#EEF7F2", "#FFFFFF", "#FFFFFF", "#0D7A43", "#203448", "#E9EBED", "#0D7A43", "#203448"), // design-ok
  sand: p("#F1EADC", "#F8F3E8", "#E9E0CE", "#F8F3E8", "#2B2620", "#DCD1BB", "#1570EF", "#2B2620"), // design-ok
  slate: p("#E6E9EE", "#FFFFFF", "#1E2733", "#334050", "#141A22", "#D5DAE1", "#1570EF", "#E5E9EF"), // design-ok
  "warm-editorial": p(
    "#F5F3EE",
    "#FFFFFF",
    "#0A0B0D",
    "#18191A",
    "#17150F",
    "#ECECEC",
    "#C9A96A",
    "#F5F3EE",
  ), // design-ok
  "olive-green": p(
    "#F5F1EA",
    "#FCFAF6",
    "#EFEAE1",
    "#E3ECE6",
    "#1E1C19",
    "#E2DBCF",
    "#2E5A4C",
    "#1E1C19",
  ), // design-ok
  "high-contrast": p(
    "#FFFFFF",
    "#FFFFFF",
    "#FFFFFF",
    "#000000",
    "#000000",
    "#6B6B6B",
    "#1570EF",
    "#000000",
  ), // design-ok
  "premium-dark": p(
    "#161616",
    "#1E1E1E",
    "#121212",
    "#262626",
    "#ECECEA",
    "#2E2E2E",
    "#2F6BEB",
    "#DEDDD9",
  ), // design-ok
  midnight: p(
    "#0E1626",
    "#152036",
    "#0B1220",
    "#1F2E4C",
    "#E6ECF5",
    "#24324D",
    "#2F6BEB",
    "#D6DEEB",
  ), // design-ok
  oled: p("#000000", "#0B0B0B", "#000000", "#1C1C1C", "#F2F2F2", "#1F1F1F", "#2F6BEB", "#E6E6E6"), // design-ok
};

/** Where each theme came from, shown on its card. */
export const themeOrigin: Record<ThemeId, "current" | "retired" | "new"> = {
  "premium-light": "new",
  "clinical-blue": "current",
  green: "current",
  "navy-rail": "current",
  mint: "current",
  sand: "new",
  slate: "new",
  "warm-editorial": "retired",
  "olive-green": "retired",
  "high-contrast": "new",
  "premium-dark": "new",
  midnight: "new",
  oled: "new",
};

export type AccentId = Exclude<(typeof ACCENTS)[number], "paired" | "custom">;

/** Primary-button fill of each preset in light and dark themes (from globals.css). */
export const accentFills: Record<AccentId, [light: string, dark: string]> = {
  blue: ["#1570EF", "#2F6BEB"], // design-ok
  indigo: ["#4F46E5", "#5850E8"], // design-ok
  violet: ["#7C3AED", "#7C3AED"], // design-ok
  purple: ["#A21CAF", "#A925B6"], // design-ok
  emerald: ["#047857", "#10B981"], // design-ok
  green: ["#08844A", "#6CC24A"], // design-ok
  teal: ["#0F766E", "#14B8A6"], // design-ok
  cyan: ["#0E7490", "#22B8DA"], // design-ok
  rose: ["#C81E5E", "#E8457F"], // design-ok
  red: ["#C62828", "#E5484D"], // design-ok
  orange: ["#C2410C", "#F07A2E"], // design-ok
  amber: ["#F2B01E", "#F2B01E"], // design-ok
  evergreen: ["#0D7A43", "#18A05E"], // design-ok
  olive: ["#2E5A4C", "#6F9E8A"], // design-ok
  bronze: ["#C9A96A", "#C9A96A"], // design-ok
};

export const accentIds = Object.keys(accentFills) as AccentId[];

export const accentLabel = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/* ---------------------------------------------------------------- colour maths */

const WHITE = "#FFFFFF"; // design-ok
const BLACK = "#000000"; // design-ok
const INK = "#1C1A17"; // design-ok

function rgb(h: string): number[] {
  const v = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
function hex(a: number[]) {
  return `#${a
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}
function lum(h: string) {
  return rgb(h)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
}
/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a: string, b: string, t: number) {
  const p0 = rgb(a);
  const q = rgb(b);
  return hex(p0.map((v, i) => v + (q[i]! - v) * t));
}
function hueOf(h: string) {
  const [r, g, b] = rgb(h).map((x) => x / 255) as [number, number, number];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return { h: 0, s: 0 };
  let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hh *= 60;
  if (hh < 0) hh += 360;
  return { h: hh, s: d / (1 - Math.abs(mx + mn - 1)) };
}

export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/** The surfaces of the theme on screen now, read from the live tokens. */
function activeSurfaces() {
  const css = getComputedStyle(document.documentElement);
  const read = (k: string) => css.getPropertyValue(k).trim();
  return {
    dark: document.documentElement.dataset.scheme === "dark",
    backgrounds: ["--color-page", "--color-surface", "--color-sunken"].map(read).filter(isHex),
    surface: read("--color-surface"),
  };
}

export type CustomAccent = {
  vars: Record<string, string>;
  /** Contrast of the button text on the fill, and of accent text on the page surfaces. */
  fillContrast: number;
  textContrast: number;
  adjusted: boolean;
};

/**
 * The six accent values from one colour, checked against the active theme: button text reaches
 * 4.5:1 on the fill, and accent text reaches 4.5:1 on page, surface and sunken.
 */
export function generateAccent(base: string): CustomAccent {
  const { dark, backgrounds, surface } = activeSurfaces();
  const bgs = backgrounds.length ? backgrounds : [dark ? BLACK : WHITE];
  let fill = base;
  let on = WHITE;
  if (contrast(fill, on) < 4.5) {
    let found = false;
    let f = fill;
    for (let i = 1; i <= 6 && !dark; i++) {
      f = mix(base, BLACK, i * 0.05);
      if (contrast(f, WHITE) >= 4.5) {
        found = true;
        break;
      }
    }
    if (found) fill = f;
    else {
      on = INK;
      let g = base;
      for (let i = 1; i <= 8 && contrast(g, INK) < 4.5; i++) g = mix(base, WHITE, i * 0.06);
      fill = g;
    }
  }
  let text = base;
  let adjusted = false;
  const target = dark ? WHITE : BLACK;
  for (let i = 1; i <= 20 && bgs.some((b) => contrast(text, b) < 4.5); i++) {
    text = mix(base, target, i * 0.05);
    adjusted = true;
  }
  return {
    vars: {
      "--color-accent": text,
      "--color-accent-hover": mix(text, target, 0.15),
      "--color-accent-fill": fill,
      "--color-accent-fill-hover": mix(fill, dark ? WHITE : BLACK, 0.08),
      "--color-accent-fill-pressed": mix(fill, BLACK, 0.16),
      "--color-accent-tint": dark
        ? mix(base, isHex(surface) ? surface : BLACK, 0.78)
        : mix(base, WHITE, 0.9),
      "--color-on-accent": on,
      "--color-focus": fill,
    },
    fillContrast: contrast(fill, on),
    textContrast: Math.min(...bgs.map((b) => contrast(text, b))),
    adjusted,
  };
}

/** A warning when a custom accent sits within 18° of a status colour and could be mistaken for it. */
export function nearStatusColour(base: string): string | null {
  const { h, s } = hueOf(base);
  if (s <= 0.3) return null;
  const near = (
    [
      [4, "At Risk red"],
      [40, "Watch amber"],
      [140, "Healthy green"],
    ] as const
  ).find(([x]) => Math.min(Math.abs(h - x), 360 - Math.abs(h - x)) < 18);
  return near ? near[1] : null;
}

export const LIGHT_THEMES = (Object.keys(THEMES) as ThemeId[]).filter((t) => !THEMES[t].dark);
export const DARK_THEMES = (Object.keys(THEMES) as ThemeId[]).filter((t) => THEMES[t].dark);

export type { Appearance, ThemeId };
