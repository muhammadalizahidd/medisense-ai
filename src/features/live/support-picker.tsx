"use client";

import {
  Accessibility,
  Apple,
  Brain,
  Check,
  ClipboardList,
  Dumbbell,
  Footprints,
  Hand,
  HeartHandshake,
  Home,
  Building2,
  MessageSquareText,
  PersonStanding,
  Plus,
  Speech,
  Stethoscope,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  frequencies,
  nursingTypes,
  practitioner,
  supportCatalogue,
  type Support,
} from "@/lib/live/catalogue";
import type { ReferralSupportInput } from "@/lib/live/referral";
import { cn } from "@/lib/cn";
import { Choice, TextField } from "./form-bits";

const icons: Record<Support, LucideIcon> = {
  "Functional Capacity Assessment": ClipboardList,
  "SIL/ILO Housing Assessment": Home,
  "SDA Housing Assessment": Building2,
  "Home Modification Assessment": Wrench,
  "Assistive Technology Assessment": Accessibility,
  "Occupational Therapy": Hand,
  "Speech Therapy": Speech,
  "Swallowing Assessment": Utensils,
  "Speech/Language Assessment": MessageSquareText,
  "Exercise Physiology": Dumbbell,
  Physiotherapy: PersonStanding,
  "Psychological Assessment": Brain,
  "Psychological Therapy": Brain,
  "Trauma Therapy": HeartHandshake,
  Nursing: Stethoscope,
  Podiatry: Footprints,
  Dietetics: Apple,
  Other: Plus,
};

const groups = [
  { title: "Assessments", kind: "assessment" as const },
  { title: "Therapy and ongoing services", kind: "treatment" as const },
];

const blank = (support: Support): ReferralSupportInput => ({
  support,
  frequency:
    supportCatalogue.find((s) => s.name === support)?.kind === "assessment"
      ? "Assessment"
      : "Weekly",
  frequencyOther: "",
  nursingType: "",
  details: "",
});

/**
 * The 17 supports on the referral form, plus Dietetics. Each one chosen becomes its own service
 * request; how often is a preference, not a clinical dose.
 */
export function SupportPicker({
  value,
  onChange,
  errorFor,
}: {
  value: ReferralSupportInput[];
  onChange: (next: ReferralSupportInput[]) => void;
  errorFor: (path: string) => string | undefined;
}) {
  const indexOf = (s: Support) => value.findIndex((v) => v.support === s);
  const toggle = (s: Support) =>
    onChange(indexOf(s) >= 0 ? value.filter((v) => v.support !== s) : [...value, blank(s)]);
  const patch = (s: Support, part: Partial<ReferralSupportInput>) =>
    onChange(value.map((v) => (v.support === s ? { ...v, ...part } : v)));

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.kind} aria-label={g.title}>
          <h3 className="mb-3 text-caption font-semibold tracking-wide text-ink-500 uppercase">
            {g.title}
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {supportCatalogue
              .filter((s) => s.kind === g.kind)
              .map((s) => {
                const i = indexOf(s.name);
                const chosen = i >= 0 ? value[i] : null;
                const Icon = icons[s.name];
                return (
                  <li
                    key={s.name}
                    className={cn(
                      "rounded-card border transition-colors duration-160",
                      chosen
                        ? "border-accent bg-accent-tint shadow-hairline md:col-span-2"
                        : "border-border bg-surface hover:border-border-strong",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={Boolean(chosen)}
                      onClick={() => toggle(s.name)}
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
                        <span className="block text-small font-semibold text-ink-900">
                          {s.name}
                        </span>
                        <span className="block text-caption text-ink-500">
                          {s.discipline ? practitioner[s.discipline] : "Tell us what's needed"}
                        </span>
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
                      <div className="grid gap-4 border-t border-accent/20 px-3.5 py-3.5 md:grid-cols-2">
                        {s.name === "Nursing" && (
                          <Choice
                            label="Type of nursing support"
                            options={nursingTypes}
                            value={chosen.nursingType}
                            onChange={(v) => patch(s.name, { nursingType: v })}
                            error={errorFor(`supports.${i}.nursingType`)}
                          />
                        )}
                        {s.kind === "treatment" && s.name !== "Nursing" && (
                          <Choice
                            label="How often (preferred)"
                            options={frequencies}
                            value={chosen.frequency}
                            onChange={(v) => patch(s.name, { frequency: v })}
                            hint="A preference: the therapist confirms the plan after assessing."
                          />
                        )}
                        {s.kind === "assessment" && (
                          <p className="text-small text-ink-700 md:col-span-2">
                            Booked as a single assessment visit. Ongoing therapy can follow if the
                            clinician recommends it.
                          </p>
                        )}
                        {chosen.frequency === "Other" && s.name !== "Nursing" && (
                          <TextField
                            label="Describe how often"
                            required
                            value={chosen.frequencyOther}
                            onChange={(v) => patch(s.name, { frequencyOther: v })}
                            error={errorFor(`supports.${i}.frequencyOther`)}
                            placeholder="For example, twice a week for a month"
                          />
                        )}
                        {(s.name === "Other" ||
                          (s.name === "Nursing" && chosen.nursingType === "Other")) && (
                          <TextField
                            label={s.name === "Other" ? "Support needed" : "Nursing support needed"}
                            required
                            value={chosen.details}
                            onChange={(v) => patch(s.name, { details: v })}
                            error={errorFor(`supports.${i}.details`)}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
