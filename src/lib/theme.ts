/** The colour palettes a viewer can choose. The choice stays in this browser and survives a reset. */
export const themes = [
  { id: "blue", label: "Blue", swatches: ["#1570ef", "#0e9f8e", "#dbe8fe"] },
  { id: "green", label: "Green", swatches: ["#08844a", "#12b76a", "#e1f5e9"] },
  { id: "navy", label: "Navy rail", swatches: ["#172b36", "#0d7a43", "#dff4e8"] },
  { id: "mint", label: "Mint", swatches: ["#0d7a43", "#18a05e", "#e8f7f0"] },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

const STORAGE_KEY = "medisense-theme";
export const DEFAULT_THEME: ThemeId = "blue";

/** Palettes other than the default, each set as `data-palette` on <html>. */
const alternates: readonly string[] = themes.map((t) => t.id).filter((id) => id !== DEFAULT_THEME);

/** Runs before first paint, so a saved palette never flashes the default one. */
export const themeInitScript = `try{var p=localStorage.getItem("${STORAGE_KEY}");if(${JSON.stringify(alternates)}.indexOf(p)>-1)document.documentElement.dataset.palette=p}catch(e){}`;

const listeners = new Set<() => void>();

function isThemeId(value: string | undefined): value is ThemeId {
  return themes.some((t) => t.id === value);
}

export function currentTheme(): ThemeId {
  const palette = document.documentElement.dataset.palette;
  return isThemeId(palette) ? palette : DEFAULT_THEME;
}

export function setTheme(theme: ThemeId) {
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private windows can block storage; the palette still applies until the page reloads.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
