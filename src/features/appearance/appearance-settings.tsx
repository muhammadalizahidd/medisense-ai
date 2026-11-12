"use client";

import { Check, Palette, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AiDraft } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { inputClass } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import {
  DEFAULT_APPEARANCE,
  loadAppearance,
  persistAppearance,
  saveAppearance,
  THEMES,
  TYPES,
  type Appearance,
  type ThemeId,
} from "@/app/theme-script";
import {
  accentFills,
  accentIds,
  accentLabel,
  DARK_THEMES,
  generateAccent,
  isHex,
  LIGHT_THEMES,
  nearStatusColour,
  themeOrigin,
  themePreviews,
} from "@/lib/appearance";
import { cn } from "@/lib/cn";

const BASE_KEY = "ms-accent-base";

/* ------------------------------------------------------------------ state */

let cached: Appearance | null = null;
function snapshot() {
  const next = loadAppearance();
  if (!cached || JSON.stringify(cached) !== JSON.stringify(next)) cached = next;
  return cached;
}
function subscribe(listener: () => void) {
  window.addEventListener("ms-appearance", listener);
  return () => window.removeEventListener("ms-appearance", listener);
}

function customBase(): string {
  try {
    return localStorage.getItem(BASE_KEY) ?? "#2B7BC9"; // design-ok: default custom colour
  } catch {
    return "#2B7BC9"; // design-ok: default custom colour
  }
}

/** Current appearance, and a way to change it that applies, saves on this device and to the profile. */
export function useAppearance() {
  const appearance = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_APPEARANCE);
  function update(patch: Partial<Appearance>) {
    let next: Appearance = { ...loadAppearance(), ...patch };
    saveAppearance(next);
    // A custom accent is generated against the theme on screen, so redo it after a theme change.
    if (next.accent === "custom") {
      next = { ...next, custom: generateAccent(customBase()).vars };
      saveAppearance(next);
    }
    persistAppearance(next);
  }
  return [appearance, update] as const;
}

/** The theme actually showing (resolves "Match system"). */
function useActiveTheme(): ThemeId {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme as ThemeId) ?? DEFAULT_APPEARANCE.theme,
    () => DEFAULT_APPEARANCE.theme as ThemeId,
  );
}

/* --------------------------------------------------------------- pieces */

function ThemeCard({
  id,
  selected,
  onPick,
}: {
  id: ThemeId;
  selected: boolean;
  onPick: () => void;
}) {
  const t = themePreviews[id];
  const origin = themeOrigin[id];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={cn(
        "group flex cursor-pointer flex-col gap-2 rounded-card p-1.5 text-left transition-colors duration-(--duration-fast)",
        selected ? "ring-2 ring-accent-fill" : "ring-1 ring-border hover:ring-border-strong",
      )}
    >
      <span
        aria-hidden="true"
        className="relative flex h-20 overflow-hidden rounded-control"
        style={{ background: t.page, boxShadow: `inset 0 0 0 1px ${t.border}` }}
      >
        <span className="flex w-1/4 flex-col gap-1 p-1.5" style={{ background: t.sidebar }}>
          <span
            className="h-1.5 w-3/4 rounded-full opacity-60"
            style={{ background: t.sidebarInk }}
          />
          <span className="h-2.5 rounded-sm" style={{ background: t.sidebarActive }} />
          <span
            className="h-1.5 w-2/3 rounded-full opacity-40"
            style={{ background: t.sidebarInk }}
          />
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-2">
          <span className="h-1.5 w-1/2 rounded-full" style={{ background: t.ink }} />
          <span
            className="flex flex-1 flex-col justify-between rounded-md p-1.5"
            style={{ background: t.surface, boxShadow: `inset 0 0 0 1px ${t.border}` }}
          >
            <span className="h-1 w-3/4 rounded-full opacity-50" style={{ background: t.ink }} />
            <span className="h-2.5 w-8 rounded-sm" style={{ background: t.fill }} />
          </span>
        </span>
        {selected && (
          <span className="absolute top-1 right-1 flex size-4.5 items-center justify-center rounded-full bg-accent-fill text-on-accent">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="px-1 pb-0.5">
        <span className="block text-small font-semibold text-ink-900">{THEMES[id].name}</span>
        <span className="block text-caption text-ink-500">
          {origin === "current"
            ? "Your current palette"
            : origin === "retired"
              ? "Retired original"
              : "New"}
        </span>
      </span>
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border py-5 first:border-0 first:pt-0">
      <h3 className="text-small font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-0.5 text-caption text-ink-500">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

const typeSamples: Record<(typeof TYPES)[number], { name: string; display: string; note: string }> =
  {
    instrument: {
      name: "Instrument",
      display: "var(--ff-instrument-serif)",
      note: "Current · editorial",
    },
    newsreader: { name: "Newsreader", display: "var(--ff-newsreader)", note: "Bookish, warm" },
    fraunces: { name: "Fraunces", display: "var(--ff-fraunces)", note: "Soft, characterful" },
    plex: { name: "Plex", display: "var(--ff-source-serif)", note: "Technical, precise" },
    inter: { name: "Inter", display: "var(--ff-inter-tight)", note: "All sans, neutral" },
    atkinson: { name: "Atkinson", display: "var(--ff-literata)", note: "Most legible" },
  };

/* --------------------------------------------------------------- preview */

function LivePreview() {
  return (
    <div
      aria-label="Live preview"
      role="img"
      className="flex flex-col gap-4 overflow-hidden rounded-card border border-border bg-page p-4"
    >
      <div className="flex gap-3">
        <div className="hidden w-36 flex-none flex-col gap-1 rounded-control bg-sidebar p-2 sm:flex">
          <span className="px-1.5 pb-1 label-caps">Live care</span>
          <span className="flex h-8 items-center rounded-control bg-sidebar-active px-2 text-small font-semibold text-sidebar-active-ink shadow-[inset_3px_0_0_var(--color-accent-fill)]">
            My new patients
          </span>
          <span className="flex h-8 items-center px-2 text-small text-sidebar-ink">Messages</span>
        </div>
        <div className="min-w-0 flex-1">
          <MetricBand
            label="Preview figures"
            size="stat-sm"
            metrics={[
              { label: "Visits today", value: 4, caption: "2 to record" },
              { label: "Notes to sign", value: 2, caption: "Oldest 2 days", tone: "watch" },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2.5">
        <span className="text-small font-semibold text-ink-900">Leo Harrison</span>
        <span className="flex gap-1.5">
          <Tag tone="healthy">Confirmed</Tag>
          <Tag tone="meta">Telehealth</Tag>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value="Focused field"
          aria-label="Preview field"
          className={cn(inputClass, "max-w-56 border-accent shadow-focus")}
        />
        <Button variant="primary" size="sm">
          Sign note
        </Button>
        <Button size="sm">Save draft</Button>
      </div>
      <div className="flex h-14 items-end gap-1.5" aria-hidden="true">
        {[40, 62, 55, 78, 70, 88, 66].map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-sm"
            style={{ height: `${h}%`, background: `var(--color-series-${(i % 2) + 1})` }}
          />
        ))}
      </div>
      <AiDraft label="AI draft · SOAP note" meta="Just now">
        <p className="text-small text-ink-700">S: Mum reports mornings are easier…</p>
      </AiDraft>
    </div>
  );
}

/* ------------------------------------------------------------- settings */

/** Appearance: theme, accent, typeface, density and text size, with a live preview. */
export function AppearanceSettings() {
  const [a, update] = useAppearance();
  const active = useActiveTheme();
  const dark = THEMES[active]?.dark ?? false;
  const [base, setBase] = useState("#2B7BC9"); // design-ok: default custom colour
  const [draftHex, setDraftHex] = useState("#2B7BC9"); // design-ok: default custom colour
  const [check, setCheck] = useState<ReturnType<typeof generateAccent> | null>(null);

  useEffect(() => {
    const b = customBase();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the saved colour once after mount
    setBase(b);
    setDraftHex(b);
  }, []);

  useEffect(() => {
    // Contrast results describe the custom colour on the theme showing now.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recompute when the theme changes
    setCheck(a.accent === "custom" ? generateAccent(base) : null);
  }, [a.accent, base, active]);

  function pickCustom(hex: string) {
    if (!isHex(hex)) return;
    setBase(hex);
    try {
      localStorage.setItem(BASE_KEY, hex);
    } catch {
      // Private windows can block storage.
    }
    update({ accent: "custom" });
  }

  const system = a.theme === "system";
  const pickTheme = (id: ThemeId) =>
    system
      ? update(THEMES[id].dark ? { darkTheme: id } : { lightTheme: id })
      : update({ theme: id });
  const isSelected = (id: ThemeId) =>
    system ? id === a.lightTheme || id === a.darkTheme : id === a.theme;
  const near = a.accent === "custom" ? nearStatusColour(base) : null;

  return (
    <section
      id="appearance"
      aria-labelledby="appearance-title"
      className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2
            id="appearance-title"
            className="flex items-center gap-2 text-section font-semibold text-ink-900"
          >
            <Palette className="size-4 text-ink-500" aria-hidden="true" /> Appearance
          </h2>
          <p className="text-caption text-ink-500">
            Saved to your profile, so it follows you to other devices. The video room always stays
            dark.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            update(DEFAULT_APPEARANCE);
            toast("Appearance reset", { detail: "Premium Light, paired accent, default text." });
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset to defaults
        </Button>
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Section title="Theme" description="Choosing a theme brings its paired accent with it.">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-small text-ink-700">
              <Switch
                on={system}
                label="Match system"
                onToggle={() =>
                  update(
                    system
                      ? { theme: dark ? a.darkTheme : a.lightTheme }
                      : {
                          theme: "system",
                          lightTheme: THEMES[active].dark ? a.lightTheme : active,
                          darkTheme: THEMES[active].dark ? active : a.darkTheme,
                        },
                  )
                }
              />
              Match system (light by day, dark at night)
              {system && (
                <span className="text-caption text-ink-500">
                  · pick one light and one dark theme below
                </span>
              )}
            </div>
            {[
              { label: "Light", ids: LIGHT_THEMES },
              { label: "Dark", ids: DARK_THEMES },
            ].map((g) => (
              <div key={g.label} className="mb-4 last:mb-0">
                <p className="mb-2 label-caps">{g.label}</p>
                <div
                  role="radiogroup"
                  aria-label={`${g.label} themes`}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                >
                  {g.ids.map((id) => (
                    <ThemeCard
                      key={id}
                      id={id}
                      selected={isSelected(id)}
                      onPick={() => pickTheme(id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </Section>

          <Section
            title="Accent"
            description="For the main button, links, selection and focus. Status colours never change."
          >
            <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={a.accent === "paired"}
                onClick={() => update({ accent: "paired" })}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-small",
                  a.accent === "paired"
                    ? "border-accent-fill bg-accent-tint font-semibold text-ink-900"
                    : "border-border-strong text-ink-700 hover:bg-sunken",
                )}
              >
                <span aria-hidden="true" className="size-4 rounded-full bg-accent-fill" />
                Paired
              </button>
              {accentIds.map((id) => {
                const selected = a.accent === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={accentLabel(id)}
                    title={accentLabel(id)}
                    onClick={() => update({ accent: id })}
                    className={cn(
                      "flex size-9 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow",
                      selected
                        ? "ring-2 ring-ink-900"
                        : "ring-1 ring-border hover:ring-border-strong",
                    )}
                    style={{ background: accentFills[id][dark ? 1 : 0] }}
                  >
                    {selected && (
                      <Check className="size-4 text-on-accent" strokeWidth={3} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
              <label
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-small",
                  a.accent === "custom"
                    ? "border-accent-fill bg-accent-tint font-semibold text-ink-900"
                    : "border-border-strong text-ink-700 hover:bg-sunken",
                )}
              >
                <input
                  type="color"
                  value={base}
                  onChange={(e) => {
                    setDraftHex(e.target.value.toUpperCase());
                    pickCustom(e.target.value.toUpperCase());
                  }}
                  aria-label="Custom accent colour"
                  className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                />
                Custom
              </label>
            </div>
            {a.accent === "custom" && (
              <div className="mt-3 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-small text-ink-700">
                  Hex
                  <input
                    value={draftHex}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setDraftHex(v);
                      if (isHex(v)) pickCustom(v.toUpperCase());
                    }}
                    aria-invalid={!isHex(draftHex)}
                    className={cn(inputClass, "h-9 w-32 font-mono")}
                  />
                </label>
                {check && (
                  <p className="text-caption text-ink-500">
                    Button text {check.fillContrast.toFixed(1)}:1 · accent text{" "}
                    {check.textContrast.toFixed(1)}:1 on this theme
                    {check.adjusted && " · text shade adjusted to stay readable"}
                  </p>
                )}
                {near && (
                  <p className="flex items-center gap-1.5 text-caption font-medium text-watch">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    Close to the {near}. People may read it as a status.
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section
            title="Typeface"
            description="Display face for titles and figures, with its interface face."
          >
            <div
              role="radiogroup"
              aria-label="Typeface"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {TYPES.map((t) => {
                const sample = typeSamples[t];
                const selected = a.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update({ type: t })}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-left",
                      selected
                        ? "border-accent-fill bg-accent-tint"
                        : "border-border hover:bg-sunken",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="text-[28px] leading-none text-ink-900"
                      style={{ fontFamily: sample.display }}
                    >
                      Aa
                    </span>
                    <span className="min-w-0">
                      <span className="block text-small font-semibold text-ink-900">
                        {sample.name}
                      </span>
                      <span className="block truncate text-caption text-ink-500">
                        {sample.note}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Density and text size">
            <div className="flex flex-wrap items-center gap-4">
              <Segmented
                label="Density"
                value={a.density}
                onChange={(density) => update({ density })}
                options={[
                  { id: "comfortable", label: "Comfortable" },
                  { id: "compact", label: "Compact" },
                ]}
              />
              <Segmented
                label="Text size"
                value={a.text}
                onChange={(text) => update({ text })}
                options={[
                  { id: "default", label: "Default" },
                  { id: "large", label: "Large" },
                  { id: "larger", label: "Larger" },
                ]}
              />
            </div>
          </Section>

          {system && (
            <Section title="Match system pair">
              <div className="flex flex-wrap gap-4 text-small">
                <label className="flex items-center gap-2">
                  Light
                  <Select
                    aria-label="Light theme"
                    value={a.lightTheme}
                    onChange={(e) => update({ lightTheme: e.target.value as ThemeId })}
                  >
                    {LIGHT_THEMES.map((id) => (
                      <option key={id} value={id}>
                        {THEMES[id].name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex items-center gap-2">
                  Dark
                  <Select
                    aria-label="Dark theme"
                    value={a.darkTheme}
                    onChange={(e) => update({ darkTheme: e.target.value as ThemeId })}
                  >
                    {DARK_THEMES.map((id) => (
                      <option key={id} value={id}>
                        {THEMES[id].name}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </Section>
          )}
        </div>

        <div className="xl:col-span-5">
          <div className="xl:sticky xl:top-[calc(var(--topbar-h)+1.5rem)]">
            <p className="mb-2 label-caps">Live preview · {THEMES[active].name}</p>
            <LivePreview />
          </div>
        </div>
      </div>
    </section>
  );
}
