"use client";

import {
  Apple,
  Brain,
  Check,
  Dumbbell,
  Footprints,
  Hand,
  HeartHandshake,
  PersonStanding,
  Speech,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import {
  disciplines,
  frequencies,
  practitioner,
  type Discipline,
  type Frequency,
} from "@/lib/live/catalogue";
import { cn } from "@/lib/cn";

const icons: Record<Discipline, LucideIcon> = {
  "Occupational Therapy": Hand,
  "Speech Pathology": Speech,
  Physiotherapy: PersonStanding,
  "Exercise Physiology": Dumbbell,
  Psychology: Brain,
  "Trauma Therapy": HeartHandshake,
  Dietetics: Apple,
  Podiatry: Footprints,
  Nursing: Stethoscope,
};

const frequencyHint: Record<Frequency, string> = {
  Assessment: "First visit only",
  Weekly: "8 visits",
  Fortnightly: "6 visits",
  Monthly: "4 visits",
};

export type Needs = Partial<Record<Discipline, Frequency>>;

/** Pick each therapy as a card, then how often, in one tap each. */
export function TherapyPicker({
  value,
  onChange,
}: {
  value: Needs;
  onChange: (next: Needs) => void;
}) {
  function toggle(d: Discipline) {
    const next = { ...value };
    if (next[d]) delete next[d];
    else next[d] = "Weekly";
    onChange(next);
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {disciplines.map((d) => {
        const chosen = value[d];
        const Icon = icons[d];
        return (
          <li
            key={d}
            className={cn(
              "rounded-card border transition-colors duration-160",
              chosen
                ? "border-accent bg-accent-tint shadow-hairline"
                : "border-border bg-surface hover:border-border-strong",
            )}
          >
            <button
              type="button"
              aria-pressed={Boolean(chosen)}
              onClick={() => toggle(d)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-card px-3.5 py-3 text-left"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-10 flex-none items-center justify-center rounded-control",
                  chosen ? "bg-accent-fill text-on-accent" : "bg-canvas text-accent",
                )}
              >
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold text-ink-900">{d}</span>
                <span className="block text-caption text-ink-500">{practitioner[d]}</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 flex-none items-center justify-center rounded-full border",
                  chosen
                    ? "border-accent-fill bg-accent-fill text-on-accent"
                    : "border-border-strong",
                )}
              >
                {chosen && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
            {chosen && (
              <div
                role="radiogroup"
                aria-label={`How often for ${d}`}
                className="grid grid-cols-4 gap-1 border-t border-accent/20 p-2"
              >
                {frequencies.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={chosen === f}
                    onClick={() => onChange({ ...value, [d]: f })}
                    className={cn(
                      "flex cursor-pointer flex-col items-center rounded-control px-1 py-1.5 text-center",
                      chosen === f
                        ? "bg-accent-fill text-on-accent"
                        : "bg-surface text-ink-900 hover:bg-canvas",
                    )}
                  >
                    <span className="text-caption font-semibold">{f}</span>
                    <span
                      className={cn(
                        "text-eyebrow",
                        chosen === f ? "text-on-accent/85" : "text-ink-500",
                      )}
                    >
                      {frequencyHint[f]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
