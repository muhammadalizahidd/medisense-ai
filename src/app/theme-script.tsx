// Applies the saved appearance to <html> before first paint (no flash).
// Render <ThemeScript /> as the first child of <head> in src/app/layout.tsx.
//
// Source of truth, in order:
//   1. the signed-in user's saved appearance (server writes it into window.__MS_APPEARANCE__
//      or straight onto the <html> attributes in layout.tsx);
//   2. the device copy in localStorage ("ms-appearance");
//   3. defaults (Premium Light, paired accent, Instrument, comfortable, default size).
// "system" follows prefers-color-scheme using the chosen light/dark pair, and keeps
// following it live while the page is open.

export const THEMES = {
  "premium-light": { dark: false, pair: "blue", name: "Premium Light" },
  "clinical-blue": { dark: false, pair: "blue", name: "Clinical Blue" },
  green: { dark: false, pair: "green", name: "Green" },
  "navy-rail": { dark: false, pair: "evergreen", name: "Navy rail" },
  mint: { dark: false, pair: "evergreen", name: "Mint" },
  sand: { dark: false, pair: "blue", name: "Sand" },
  slate: { dark: false, pair: "blue", name: "Slate" },
  "warm-editorial": { dark: false, pair: "bronze", name: "Warm Editorial" },
  "olive-green": { dark: false, pair: "olive", name: "Olive Green" },
  "high-contrast": { dark: false, pair: "blue", name: "High Contrast" },
  "premium-dark": { dark: true, pair: "blue", name: "Premium Dark" },
  midnight: { dark: true, pair: "blue", name: "Midnight" },
  oled: { dark: true, pair: "blue", name: "OLED Dark" },
} as const;

export type ThemeId = keyof typeof THEMES;
export const ACCENTS = [
  "paired",
  "blue",
  "indigo",
  "violet",
  "purple",
  "emerald",
  "green",
  "teal",
  "cyan",
  "rose",
  "red",
  "orange",
  "amber",
  "evergreen",
  "olive",
  "bronze",
  "custom",
] as const;
export const TYPES = ["instrument", "newsreader", "fraunces", "plex", "inter", "atkinson"] as const;

export type Appearance = {
  theme: ThemeId | "system";
  lightTheme: ThemeId; // used when theme === "system" and the OS is light
  darkTheme: ThemeId; // used when theme === "system" and the OS is dark
  accent: (typeof ACCENTS)[number];
  custom?: Record<string, string>; // six --color-accent* values, generated + contrast-checked
  type: (typeof TYPES)[number];
  density: "comfortable" | "compact";
  text: "default" | "large" | "larger";
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "premium-light",
  lightTheme: "premium-light",
  darkTheme: "premium-dark",
  accent: "paired",
  type: "instrument",
  density: "comfortable",
  text: "default",
};

// Old data-palette values from the current app (saved as "medisense-theme"), migrated once.
const LEGACY_PALETTE: Record<string, ThemeId> = {
  blue: "clinical-blue",
  green: "green",
  navy: "navy-rail",
  mint: "mint",
};

const script = `(function(){try{if(window.self!==window.top)document.documentElement.setAttribute("data-embedded","")}catch(e){}})();(function(){try{
var D=${JSON.stringify(DEFAULT_APPEARANCE)},DK=${JSON.stringify(Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.dark])))},LP=${JSON.stringify(LEGACY_PALETTE)};
var s=window.__MS_APPEARANCE__||null;
if(!s){try{s=JSON.parse(localStorage.getItem("ms-appearance")||"null")}catch(e){}}
if(!s){var lp=null;try{lp=localStorage.getItem("medisense-theme")||localStorage.getItem("palette")||localStorage.getItem("ms-palette")}catch(e){}if(lp&&LP[lp])s={theme:LP[lp]};}
s=Object.assign({},D,s||{});
var h=document.documentElement,mq=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){
  var t=s.theme==="system"?(mq.matches?s.darkTheme:s.lightTheme):s.theme;
  if(!(t in DK))t=D.theme;
  h.setAttribute("data-theme",t);
  h.setAttribute("data-scheme",DK[t]?"dark":"light");
  h.setAttribute("data-accent",s.accent==="custom"?"custom":s.accent);
  h.setAttribute("data-type",s.type);
  h.setAttribute("data-density",s.density);
  h.setAttribute("data-text",s.text);
  if(s.accent==="custom"&&s.custom){for(var k in s.custom)h.style.setProperty(k,s.custom[k]);}
}
apply();
if(s.theme==="system"&&mq.addEventListener)mq.addEventListener("change",apply);
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

/** The appearance saved on this device, merged with the defaults. */
export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(
      localStorage.getItem("ms-appearance") ?? "null",
    ) as Partial<Appearance> | null;
    return { ...DEFAULT_APPEARANCE, ...(saved ?? {}) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Saves to the signed-in person's profile so the choice follows them; quiet if signed out. */
export function persistAppearance(next: Appearance) {
  void fetch("/api/me/appearance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  }).catch(() => undefined);
}

/** Call from the Appearance page / top-bar menu after a change. */
export function saveAppearance(next: Appearance) {
  const h = document.documentElement;
  h.classList.add("theme-transition");
  try {
    localStorage.setItem("ms-appearance", JSON.stringify(next));
  } catch {}
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const t = next.theme === "system" ? (mq.matches ? next.darkTheme : next.lightTheme) : next.theme;
  h.dataset.theme = t;
  h.dataset.scheme = THEMES[t].dark ? "dark" : "light";
  h.dataset.accent = next.accent;
  h.dataset.type = next.type;
  h.dataset.density = next.density;
  h.dataset.text = next.text;
  [
    "--color-accent",
    "--color-accent-hover",
    "--color-accent-tint",
    "--color-accent-fill",
    "--color-accent-fill-hover",
    "--color-accent-fill-pressed",
    "--color-on-accent",
    "--color-focus",
  ].forEach((k) => h.style.removeProperty(k));
  if (next.accent === "custom" && next.custom)
    for (const [k, v] of Object.entries(next.custom)) h.style.setProperty(k, v);
  window.setTimeout(() => h.classList.remove("theme-transition"), 300);
  window.dispatchEvent(new Event("ms-appearance"));
  // Then persist to the user's profile (server action / API) so it follows them across devices.
}
