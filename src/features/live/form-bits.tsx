"use client";

import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NoteAssist, wantsAssist } from "@/components/ai/note-assist";
import { Field, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/**
 * A date typed as day, month and year, always in Australian order whatever the device's regional
 * settings. The value is YYYY-MM-DD once all three parts are complete, otherwise empty.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  const split = (v: string) => {
    const [y = "", m = "", d = ""] = v ? v.split("-") : [];
    return { d, m, y };
  };
  const [parts, setParts] = useState(() => split(value));
  const [seen, setSeen] = useState(value);
  // A value set from outside (a saved draft, sample data) replaces what's typed.
  if (seen !== value) {
    setSeen(value);
    if (value) setParts(split(value));
  }
  const update = (next: { d: string; m: string; y: string }) => {
    setParts(next);
    const day = Number(next.d);
    const month = Number(next.m);
    const complete = next.y.length === 4 && day >= 1 && day <= 31 && month >= 1 && month <= 12;
    const iso = complete ? `${next.y}-${next.m.padStart(2, "0")}-${next.d.padStart(2, "0")}` : "";
    setSeen(iso);
    onChange(iso);
  };
  const box = (part: "d" | "m" | "y", name: string, placeholder: string, max: number) => (
    <input
      aria-label={`${label}: ${name}`}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      maxLength={max}
      value={parts[part]}
      aria-invalid={Boolean(error)}
      onChange={(e) => update({ ...parts, [part]: e.target.value.replace(/\D/g, "") })}
      className={cn(inputClass, "text-center tabular-nums", error && "border-over")}
    />
  );
  return (
    <Field label={required ? label : `${label} (optional)`} hint={hint} error={error}>
      <span className="grid grid-cols-[1fr_1fr_1.5fr] gap-2">
        {box("d", "day", "DD", 2)}
        {box("m", "month", "MM", 2)}
        {box("y", "year", "YYYY", 4)}
      </span>
    </Field>
  );
}

/** A text input bound to a value, with its label, hint and error. */
export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  required = false,
  max,
  min,
  placeholder,
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: "text" | "email" | "tel" | "date";
  required?: boolean;
  max?: string;
  min?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <Field label={required ? label : `${label} (optional)`} hint={hint} error={error}>
      <input
        type={type}
        value={value}
        max={max}
        min={min}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, error && "border-over")}
      />
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  error,
  hint,
  rows = 4,
  required = false,
  placeholder,
  maxLength = 3000,
  assist,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Dictation and "Write with AI"; on by default for note fields. */
  assist?: boolean;
}) {
  return (
    <Field label={required ? label : `${label} (optional)`} hint={hint} error={error}>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-auto py-2", error && "border-over")}
      />
      {(assist ?? wantsAssist(label)) && (
        <NoteAssist label={label} value={value} onChange={onChange} className="mt-1.5" />
      )}
    </Field>
  );
}

/** A row of choices as pills: one tap, always visible, works as a radio group. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  options: readonly T[];
  value: T | "";
  onChange: (value: T) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-small transition-colors duration-160",
              value === o
                ? "border-accent-fill bg-accent-fill font-semibold text-on-accent"
                : "border-border-strong bg-surface text-ink-900 hover:border-accent hover:bg-accent-tint",
            )}
          >
            {value === o && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
            {o}
          </button>
        ))}
      </div>
      {error ? (
        <span className="text-caption font-medium text-over">{error}</span>
      ) : (
        hint && <span className="text-caption text-ink-500">{hint}</span>
      )}
    </div>
  );
}

/** A checkbox with a sentence beside it, for declarations and yes/no switches. */
export function Tick({
  checked,
  onChange,
  children,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 text-small",
          checked ? "border-accent bg-accent-tint" : "border-border bg-surface",
          error && !checked && "border-over",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 flex-none accent-(--color-accent-fill)"
        />
        <span className="text-ink-900">{children}</span>
      </label>
      {error && !checked && (
        <span className="mt-1 block text-caption font-medium text-over">{error}</span>
      )}
    </div>
  );
}

/** A titled group inside a form step. */
export function FormGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-t border-border pt-5 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <h3 className="text-body font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-0.5 text-small text-ink-700">{description}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}
