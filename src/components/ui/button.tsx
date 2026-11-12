import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm" | "icon" | "icon-sm";

/**
 * One primary action per area. Secondary is the outline default, ghost for the rest, danger for
 * destructive actions (always behind a confirmation). md is 40px, sm 32px.
 */
const base =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control border font-semibold leading-none whitespace-nowrap transition-[background-color,border-color,color,transform] duration-(--duration-fast) ease-(--ease-out) hover:no-underline active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "border-accent-fill bg-accent-fill text-on-accent hover:border-accent-fill-hover hover:bg-accent-fill-hover active:bg-accent-fill-pressed disabled:border-border disabled:bg-sunken disabled:text-ink-500",
  secondary:
    "border-border-strong bg-surface text-ink-900 hover:bg-sunken disabled:text-ink-500 disabled:hover:bg-surface",
  ghost:
    "border-transparent bg-transparent text-accent hover:bg-accent-tint hover:text-accent-hover disabled:text-ink-500 disabled:hover:bg-transparent",
  danger:
    "border-transparent bg-transparent text-over hover:bg-over-bg disabled:text-ink-500 disabled:hover:bg-transparent",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-small",
  sm: "h-8 px-3 text-caption",
  icon: "size-10 px-0",
  "icon-sm": "size-8 px-0",
};

type StyleProps = { variant?: Variant; size?: Size };

export function buttonClasses({ variant = "secondary", size = "md" }: StyleProps = {}) {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant,
  size,
  loading = false,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ComponentProps<"button"> & StyleProps & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size }), className)}
      {...props}
    >
      {loading && (
        <LoaderCircle
          className="size-4 flex-none motion-safe:animate-spin"
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={cn(buttonClasses({ variant, size }), className)} {...props} />;
}
