"use client";

import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_APPEARANCE,
  saveAppearance,
  THEMES,
  type Appearance,
  type ThemeId,
} from "@/app/theme-script";
import { cn } from "@/lib/cn";

/**
 * Page, sidebar and accent of each theme, for the swatches only. These preview other themes, so
 * they can't come from the active tokens.
 */
const swatches: Record<ThemeId, [string, string, string]> = {
  "premium-light": ["#F6F4EF", "#EFECE5", "#1570EF"], // design-ok: preview of another theme
  "clinical-blue": ["#F4F8FE", "#F4F8FE", "#1570EF"], // design-ok: preview of another theme
  green: ["#F2FAF5", "#F2FAF5", "#08844A"], // design-ok: preview of another theme
  "navy-rail": ["#EEF5F2", "#172B36", "#0D7A43"], // design-ok: preview of another theme
  mint: ["#EEF7F2", "#FFFFFF", "#0D7A43"], // design-ok: preview of another theme
  sand: ["#F1EADC", "#E9E0CE", "#1570EF"], // design-ok: preview of another theme
  slate: ["#E6E9EE", "#1E2733", "#1570EF"], // design-ok: preview of another theme
  "warm-editorial": ["#F5F3EE", "#0A0B0D", "#C9A96A"], // design-ok: preview of another theme
  "olive-green": ["#F5F1EA", "#EFEAE1", "#2E5A4C"], // design-ok: preview of another theme
  "high-contrast": ["#FFFFFF", "#FFFFFF", "#1570EF"], // design-ok: preview of another theme
  "premium-dark": ["#161616", "#121212", "#2F6BEB"], // design-ok: preview of another theme
  midnight: ["#0E1626", "#0B1220", "#2F6BEB"], // design-ok: preview of another theme
  oled: ["#000000", "#000000", "#2F6BEB"], // design-ok: preview of another theme
};

const ids = Object.keys(THEMES) as ThemeId[];
const groups = [
  { label: "Light", ids: ids.filter((id) => !THEMES[id].dark) },
  { label: "Dark", ids: ids.filter((id) => THEMES[id].dark) },
];

/** The saved appearance on this device, merged with the defaults. */
function savedAppearance(): Appearance {
  try {
    const saved = JSON.parse(
      localStorage.getItem("ms-appearance") ?? "null",
    ) as Partial<Appearance>;
    return { ...DEFAULT_APPEARANCE, ...saved };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** The theme on <html>, kept in step by watching its data-theme attribute. */
function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const activeTheme = () => document.documentElement.dataset.theme ?? DEFAULT_APPEARANCE.theme;

/**
 * Quick theme choice from any screen. The full Appearance settings (accent, typeface, density,
 * text size, match system) come with the Appearance page.
 */
export function ThemeMenu() {
  const theme = useSyncExternalStore(subscribe, activeTheme, () => DEFAULT_APPEARANCE.theme);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function choose(id: ThemeId) {
    // Choosing a theme brings its paired accent with it.
    saveAppearance({ ...savedAppearance(), theme: id, accent: "paired" });
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-label="Appearance"
        title="Appearance"
        onClick={() => setOpen(!open)}
        className="flex size-9 cursor-pointer items-center justify-center rounded-control border border-border bg-surface hover:bg-canvas"
      >
        <Palette className="size-4 text-ink-700" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          className="absolute top-11 right-0 z-30 max-h-[70vh] w-64 overflow-y-auto rounded-card border border-border bg-raised p-1.5 shadow-overlay"
        >
          <h2 className="px-2.5 pt-1.5 pb-1 text-small font-semibold">Theme</h2>
          {groups.map((group) => (
            <div key={group.label} role="radiogroup" aria-label={`${group.label} themes`}>
              <p className="px-2.5 pt-2 pb-1 label-caps">{group.label}</p>
              {group.ids.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={theme === id}
                  onClick={() => choose(id)}
                  className={cn(
                    "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left text-small text-ink-900",
                    theme === id ? "bg-accent-tint font-semibold" : "hover:bg-canvas",
                  )}
                >
                  <span aria-hidden="true" className="flex flex-none -space-x-1">
                    {swatches[id].map((colour, i) => (
                      <i
                        key={i}
                        style={{ backgroundColor: colour }}
                        className="size-4 rounded-full ring-2 ring-raised"
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{THEMES[id].name}</span>
                  {theme === id && (
                    <Check
                      className="size-4 flex-none text-accent"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
