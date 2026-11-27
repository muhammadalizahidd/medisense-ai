"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Dates are "YYYY-MM-DD" strings, so comparing them as text orders them by day. */
type Range = { from: string; to: string };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const iso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const parts = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return { y: y ?? 2026, m: (m ?? 1) - 1, d: d ?? 1 };
};
const short = (v: string) => {
  const p = parts(v);
  return `${p.d} ${MONTHS[p.m]?.slice(0, 3) ?? ""} ${p.y}`;
};

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

/** What the button says: "1 Nov 2026 – 30 Nov 2026", one day, or "All time". */
export function rangeText({ from, to }: Range) {
  if (from && to) return from === to ? short(from) : `${short(from)} – ${short(to)}`;
  if (from) return `From ${short(from)}`;
  if (to) return `Up to ${short(to)}`;
  return "All time";
}

/**
 * A date range picker in the platform's own style: one button that opens two months side by side.
 * The first click sets the start, the second the end, and the days between light up as you point.
 * Apply sets the range; Escape or a click outside closes it unchanged.
 */
export function DateRangePicker({
  value,
  onChange,
  presets = [],
  variant = "pill",
  id,
}: {
  value: Range;
  onChange: (next: Range) => void;
  /** Quick periods listed beside the months; picking one fills the range. */
  presets?: readonly { label: string; range: Range }[];
  /** `pill` sits on a dark bar; `field` matches the other form fields. */
  variant?: "pill" | "field";
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Range>(value);
  const [hover, setHover] = useState<string | null>(null);
  // Opens towards the side with room, so it never runs off the screen.
  const [toRight, setToRight] = useState(false);
  const start = parts(value.from || todayIso());
  const [view, setView] = useState({ y: start.y, m: start.m });
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const today = todayIso();

  const show = () => {
    const at = parts(value.from || todayIso());
    setDraft(value);
    setHover(null);
    setView({ y: at.y, m: at.m });
    const rect = trigger.current?.getBoundingClientRect();
    setToRight(Boolean(rect && rect.left + (presets.length ? 860 : 700) > window.innerWidth));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const pick = (day: string) => {
    // A finished range (or none) starts again; a second click before the start swaps them.
    if (!draft.from || draft.to) setDraft({ from: day, to: "" });
    else if (day < draft.from) setDraft({ from: day, to: draft.from });
    else setDraft({ from: draft.from, to: day });
  };

  const end = draft.to || (draft.from && hover && hover >= draft.from ? hover : "");
  const step = (n: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + n, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const month = (y: number, m: number) => {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const lead = (first + 6) % 7;
    const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) => iso(y, m, i + 1)),
    ];
    return (
      <div className="flex w-64 flex-col gap-2">
        <p className="text-center text-small font-semibold text-ink-900">
          {MONTHS[m]} {y}
        </p>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="py-1 text-caption font-semibold text-ink-500">
              {w}
            </span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={`blank-${i}`} />;
            const isStart = day === draft.from;
            const isEnd = day === end;
            const between = Boolean(draft.from && end && day > draft.from && day < end);
            const edge = isStart || isEnd;
            return (
              <span
                key={day}
                className={cn(
                  "flex justify-center",
                  between && "bg-accent-tint",
                  isStart && end && end !== draft.from && "rounded-l-full bg-accent-tint",
                  isEnd && draft.from && end !== draft.from && "rounded-r-full bg-accent-tint",
                )}
              >
                <button
                  type="button"
                  onClick={() => pick(day)}
                  onMouseEnter={() => setHover(day)}
                  aria-label={short(day)}
                  aria-pressed={edge}
                  className={cn(
                    "grid size-9 cursor-pointer place-items-center rounded-full text-small tabular-nums transition-colors duration-(--duration-fast)",
                    edge
                      ? "bg-accent-fill font-semibold text-on-accent"
                      : between
                        ? "font-medium text-accent hover:bg-surface"
                        : "text-ink-900 hover:bg-sunken",
                    day === today && !edge && "font-semibold ring-1 ring-accent ring-inset",
                  )}
                >
                  {parts(day).d}
                </button>
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const next = new Date(Date.UTC(view.y, view.m + 1, 1));
  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
        className={cn(
          "flex cursor-pointer items-center gap-2 text-small transition-colors duration-(--duration-fast) focus-visible:shadow-focus",
          variant === "pill"
            ? "h-9 rounded-full bg-surface px-3.5 font-semibold text-ink-900 hover:bg-sunken"
            : "h-10 w-full rounded-control border border-border-strong bg-surface px-3 font-medium text-ink-900 hover:border-accent",
          variant === "field" && open && "border-accent shadow-focus",
        )}
      >
        <CalendarDays
          className={cn("size-4 flex-none", variant === "pill" ? "text-accent" : "text-ink-500")}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-left">{rangeText(value)}</span>
        {variant === "field" && (
          <ChevronDown
            className={cn(
              "size-4 flex-none text-ink-500 transition-transform duration-(--duration-fast)",
              open && "rotate-180 text-accent",
            )}
            aria-hidden="true"
          />
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose dates"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          className={cn(
            "absolute top-full z-40 mt-2 flex flex-col gap-4 rounded-card border border-border bg-raised p-4 text-ink-900 shadow-overlay",
            toRight ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-start gap-6">
            {presets.length > 0 && (
              <div
                role="group"
                aria-label="Quick periods"
                className="flex w-36 flex-none flex-col gap-0.5 border-r border-border pr-4"
              >
                {presets.map((p) => {
                  const on = p.range.from === draft.from && p.range.to === draft.to;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setDraft(p.range);
                        if (p.range.from) {
                          const at = parts(p.range.from);
                          setView({ y: at.y, m: at.m });
                        }
                      }}
                      className={cn(
                        "h-8 cursor-pointer rounded-control px-2.5 text-left text-small transition-colors duration-(--duration-fast)",
                        on
                          ? "bg-accent-tint font-semibold text-accent"
                          : "text-ink-700 hover:bg-sunken hover:text-ink-900",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="grid size-8 flex-none cursor-pointer place-items-center rounded-full text-ink-700 hover:bg-sunken"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <div className="flex flex-col gap-6 sm:flex-row" onMouseLeave={() => setHover(null)}>
              {month(view.y, view.m)}
              <div className="hidden sm:block">
                {month(next.getUTCFullYear(), next.getUTCMonth())}
              </div>
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="grid size-8 flex-none cursor-pointer place-items-center rounded-full text-ink-700 hover:bg-sunken"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-small text-ink-700">
              {draft.from ? (
                <>
                  <span className="font-semibold text-ink-900">
                    {rangeText({ from: draft.from, to: draft.to || draft.from })}
                  </span>
                  {!draft.to && " · now choose the end date"}
                </>
              ) : (
                "Choose the start date"
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft({ from: "", to: "" })}
                disabled={!draft.from}
              >
                Clear
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onChange(draft.from ? { from: draft.from, to: draft.to || draft.from } : draft);
                  close();
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
