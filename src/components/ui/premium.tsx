import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { photoFor, type PhotoKind } from "@/lib/avatars";

export function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

/** Initials on a quiet tint. */
export function Avatar({
  name,
  size = 40,
  className,
  kind,
  src,
}: {
  name: string;
  size?: number;
  className?: string;
  /** Some patients share a name with a clinician; say which list to look in. */
  kind?: PhotoKind;
  /** An uploaded photo, which wins over the default one. */
  src?: string | null;
}) {
  const photo = src || photoFor(name, kind);
  if (photo)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small local portrait, no optimisation needed
      <img
        src={photo}
        data-avatar=""
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("flex-none rounded-full object-cover ring-1 ring-border", className)}
      />
    );
  return (
    <span
      aria-hidden="true"
      data-avatar=""
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn(
        "flex flex-none items-center justify-center rounded-full bg-sunken font-semibold text-ink-700",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A progress ring, with its figure in the centre. */
export function Ring({
  percent,
  size = 88,
  stroke = 8,
  label,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label: string;
  children: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <span
      role="img"
      aria-label={label}
      className="relative inline-flex flex-none items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="var(--color-sunken)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="var(--color-accent-fill)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {children}
      </span>
    </span>
  );
}

/** Steps a piece of work moves through, with the current one highlighted. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <li key={step} className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span
            aria-hidden="true"
            className={cn("h-1.5 rounded-full", i <= current ? "bg-accent-fill" : "bg-sunken")}
          />
          <span
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "truncate text-caption",
              i === current ? "font-semibold text-ink-900" : "text-ink-500",
            )}
          >
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}
