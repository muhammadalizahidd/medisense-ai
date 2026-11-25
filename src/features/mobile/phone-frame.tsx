"use client";

import {
  ArrowLeft,
  ChevronLeft,
  BatteryFull,
  Check,
  HeartPulse,
  LockKeyhole,
  Signal,
  Smartphone,
  Tablet,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/live/client";

/*
 * Which device the apps are drawn in on a large screen: a phone, or a tablet in landscape. The
 * choice is shared by every app and remembered in this browser. On a real phone it is always the
 * phone, because the app fills the screen.
 */
export type Device = "phone" | "tablet";

const DEVICE_KEY = "medisense-device";
const LARGE_SCREEN = "(min-width: 48rem)";
const listeners = new Set<() => void>();
let chosen: Device | null = null;

function readDevice(): Device {
  try {
    if (!window.matchMedia(LARGE_SCREEN).matches) return "phone";
    const stored = chosen ?? localStorage.getItem(DEVICE_KEY);
    return stored === "tablet" ? "tablet" : "phone";
  } catch {
    return chosen ?? "phone";
  }
}

function subscribeDevice(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia(LARGE_SCREEN);
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function chooseDevice(device: Device) {
  chosen = device;
  try {
    localStorage.setItem(DEVICE_KEY, device);
  } catch {
    // Private windows can refuse storage; the choice still holds until the page is closed.
  }
  listeners.forEach((l) => l());
}

export function useDevice(): Device {
  return useSyncExternalStore(subscribeDevice, readDevice, () => "phone");
}

/** The device the current app is drawn in, for parts that lay out differently on a tablet. */
const DeviceContext = createContext<Device>("phone");
export const useFrameDevice = () => useContext(DeviceContext);

const devices: { id: Device; label: string; icon: LucideIcon }[] = [
  { id: "phone", label: "Phone", icon: Smartphone },
  { id: "tablet", label: "Tablet", icon: Tablet },
];

function DeviceSwitch({ value }: { value: Device }) {
  return (
    // Drawn in the device's own dark finish, with a light thumb that slides to the chosen one.
    <div
      role="group"
      aria-label="Show the app on"
      className="relative grid grid-cols-2 rounded-full bg-ink-900 p-1 shadow-overlay"
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-page transition-transform duration-300 ease-out motion-reduce:transition-none",
          value === "tablet" && "translate-x-full",
        )}
      />
      {devices.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => chooseDevice(id)}
          className={cn(
            "relative z-10 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-small font-semibold whitespace-nowrap transition-colors duration-300 active:scale-[0.98]",
            value === id ? "text-ink-900" : "text-page/65 hover:text-page",
          )}
        >
          <Icon className="size-4" strokeWidth={value === id ? 2 : 1.75} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** One section button: along the bottom on a phone, down the side rail on a tablet. */
function SectionButton({
  label,
  icon: Icon,
  badge,
  current,
  onClick,
  className,
}: {
  label: string;
  icon: LucideIcon;
  badge?: number;
  current: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-1 transition-transform duration-150 active:scale-95",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex h-8 w-15 items-center justify-center rounded-full transition-colors duration-200",
          current
            ? "bg-accent-tint text-accent"
            : "text-ink-500 group-hover:bg-canvas group-hover:text-ink-900",
        )}
      >
        <Icon
          className="size-5.5 flex-none"
          strokeWidth={current ? 2.25 : 1.75}
          aria-hidden="true"
        />
        {badge ? (
          <span className="absolute -top-1 right-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-surface bg-over-dot px-1 text-label leading-none font-bold text-white">
            {badge > 9 ? "9+" : badge}
            <span className="sr-only"> unread</span>
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-label",
          current ? "font-bold text-accent" : "font-medium text-ink-500",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** The device's status bar, shown only when the app is drawn inside a phone on a large screen. */
function StatusBar() {
  const now = useNow();
  const time = now
    ? new Intl.DateTimeFormat("en-AU", {
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
        timeZone: "Australia/Brisbane",
      }).format(now)
    : "";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden h-11 items-center justify-between bg-page px-7 text-caption font-semibold text-ink-900 md:flex"
    >
      <span>{time}</span>
      <span className="flex items-center gap-1">
        <Signal className="size-3.5" strokeWidth={2.5} />
        <Wifi className="size-3.5" strokeWidth={2.5} />
        <BatteryFull className="size-4" strokeWidth={2} />
      </span>
    </div>
  );
}

/** Full-screen on a phone. On a larger screen, a device beside a short description of the app. */
export function PhoneFrame({
  name,
  description,
  features,
  tabs,
  active,
  onTab,
  overlay,
  children,
}: {
  name: string;
  description: string;
  features: string[];
  tabs: { id: string; label: string; icon: LucideIcon; badge?: number }[];
  active: string;
  onTab: (id: string) => void;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const device = useDevice();
  const tablet = device === "tablet";
  const sections = tabs.map(({ id, label, icon, badge }) => ({
    id,
    label,
    icon,
    badge,
    current: active === id,
    onClick: () => onTab(id),
  }));
  return (
    <DeviceContext value={device}>
      <div
        className={cn(
          "flex min-h-dvh items-center justify-center gap-16 bg-canvas md:pt-20 md:pb-6 lg:px-10",
          tablet && "md:px-6",
        )}
      >
        <div className="fixed top-4 left-4 z-10 hidden md:block">
          <ButtonLink href="/">
            <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Back to Medisense
          </ButtonLink>
        </div>
        <div className="fixed top-4 left-1/2 z-10 hidden -translate-x-1/2 md:block">
          <DeviceSwitch value={device} />
        </div>

        <div className={cn("hidden max-w-96", !tablet && "lg:block")}>
          <p className="flex items-center gap-2.5 text-label font-semibold tracking-[0.12em] text-ink-500 uppercase">
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-control bg-ink-900 text-page"
            >
              <HeartPulse className="size-3.5" strokeWidth={2} />
            </span>
            Medisense
          </p>
          <h1 className="mt-6 type-display text-[52px] leading-[1.02] tracking-tight">{name}</h1>
          <p className="mt-4 text-body leading-relaxed text-ink-700">{description}</p>
          <ul className="mt-8 flex flex-col divide-y divide-border border-y border-border">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 py-3 text-small text-ink-900">
                <span
                  aria-hidden="true"
                  className="flex size-6 flex-none items-center justify-center rounded-full bg-accent-tint text-accent"
                >
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-center gap-2 text-caption text-ink-500">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            Private to you and your care team. Clinical notes stay with your clinicians.
          </p>
        </div>

        {tablet ? (
          <div className="relative flex h-[min(52rem,calc(100dvh-7rem))] w-[min(80rem,100%)] overflow-hidden rounded-[40px] border-[14px] border-ink-900 bg-page shadow-overlay ring-1 ring-border-strong">
            <span
              aria-hidden="true"
              className="absolute top-1/2 -left-[9px] z-30 size-1.5 -translate-y-1/2 rounded-full bg-ink-700"
            />
            <StatusBar />
            <nav
              aria-label="App sections"
              className="no-scrollbar flex w-24 flex-none flex-col items-center gap-1 overflow-y-auto border-r border-border bg-surface pt-14 pb-4"
            >
              {sections.map(({ id, ...section }) => (
                <SectionButton key={id} {...section} className="h-17 w-full flex-none" />
              ))}
            </nav>
            <div className="relative flex min-w-0 flex-1 flex-col">
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-10">
                <div className="@container mx-auto w-full max-w-5xl px-2">{children}</div>
              </div>
              {overlay}
            </div>
          </div>
        ) : (
          <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-page md:h-197 md:max-h-[calc(100dvh-7rem)] md:w-95 md:rounded-[48px] md:border-[11px] md:border-ink-900 md:shadow-overlay md:ring-1 md:ring-border-strong">
            <span
              aria-hidden="true"
              className="absolute top-2.5 left-1/2 z-30 hidden h-6 w-24 -translate-x-1/2 rounded-full bg-ink-900 md:block"
            />
            <StatusBar />
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">
              {children}
            </div>
            <nav
              aria-label="App sections"
              className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-surface/90 backdrop-blur-xl"
            >
              <div className="flex px-1.5 pt-1.5 pb-1">
                {sections.map(({ id, ...section }) => (
                  <SectionButton key={id} {...section} className="h-15 min-w-0 flex-1" />
                ))}
              </div>
              <span
                aria-hidden="true"
                className="mx-auto mb-2 hidden h-1.5 w-32 rounded-full bg-ink-900 md:block"
              />
              <span
                aria-hidden="true"
                className="block h-[env(safe-area-inset-bottom)] md:hidden"
              />
            </nav>
            {overlay}
          </div>
        )}
      </div>
    </DeviceContext>
  );
}

/** The gradient heading at the top of a phone screen. */
export function AppHeader({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="bg-page px-5 pt-14 pb-5 md:pt-16">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-1.5 type-display text-[30px] leading-9 tracking-tight">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </header>
  );
}

export function AppCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("mb-3 rounded-card border border-border bg-surface p-4 shadow-lift", className)}
    >
      {(title || action) && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          {title && <h3 className="text-section font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A small uppercase heading between groups of cards. */
export function AppSection({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mt-5 mb-2.5 flex items-center justify-between gap-2 px-1">
      <h3 className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">{title}</h3>
      {action}
    </div>
  );
}

/** What a screen shows when there is nothing yet: never a blank screen. */
export function AppEmpty({
  icon: Icon,
  title,
  children,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface text-center",
        compact ? "px-5 py-5" : "px-6 py-9",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full bg-accent-tint text-accent ring-8 ring-accent-tint/40",
          compact ? "mb-3 size-10" : "mb-4 size-12",
        )}
      >
        <Icon className={compact ? "size-4.5" : "size-5.5"} strokeWidth={1.75} />
      </span>
      <p className="text-body font-semibold text-ink-900">{title}</p>
      {children && <p className="mt-1 max-w-68 text-small text-ink-700">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A panel that rises from the bottom, inside the phone. */
export function AppSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const tablet = useFrameDevice() === "tablet";
  return (
    <div
      className={cn(
        "absolute inset-0 z-30 flex flex-col",
        tablet ? "items-center justify-center p-8" : "justify-end",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex flex-col bg-raised",
          tablet
            ? "max-h-[85%] w-full max-w-xl rounded-[28px] shadow-overlay"
            : "max-h-[88%] rounded-t-[28px]",
        )}
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h3 className="text-section font-semibold text-ink-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-canvas text-ink-700"
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <footer className="flex gap-2 border-t border-border px-5 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
}

/**
 * A full portal screen inside the app: the same screen and data as the web, with the app's own
 * back button. Pages opened here hide the desktop sidebar and top bar (html[data-embedded]).
 */
export function AppWebView({
  title,
  href,
  onClose,
}: {
  title: string;
  href: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-page">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 pt-12 pb-3">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-sunken"
        >
          <ChevronLeft className="size-4.5" aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 truncate text-body font-semibold text-ink-900">{title}</p>
      </header>
      <div className="relative min-h-0 flex-1">
        {/* Behind the page: it shows until the page paints over it, not until every file loads. */}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col gap-3 p-4" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-card bg-sunken" />
            <div className="h-40 animate-pulse rounded-card bg-sunken" />
            <div className="h-40 animate-pulse rounded-card bg-sunken" />
          </div>
        )}
        <iframe
          title={title}
          src={`${href}${href.includes("?") ? "&" : "?"}embed=1`}
          onLoad={() => setLoaded(true)}
          allow="camera; microphone; display-capture; autoplay"
          className="absolute inset-0 size-full border-0 bg-transparent"
        />
      </div>
    </div>
  );
}

export type BadgeTone =
  "blue" | "orange" | "teal" | "violet" | "green" | "amber" | "red" | "indigo" | "ink";

const badgeTones: Record<BadgeTone, string> = {
  blue: "bg-series-1",
  orange: "bg-series-2",
  teal: "bg-series-3",
  violet: "bg-series-4",
  green: "bg-healthy",
  amber: "bg-watch",
  red: "bg-over",
  indigo: "bg-available",
  ink: "bg-ink-900",
};

/** A filled, rounded-square icon in one of the palette's colours: each kind of thing keeps its own. */
export function IconBadge({
  icon: Icon,
  tone = "blue",
  size = 40,
  className,
}: {
  icon: LucideIcon;
  tone?: BadgeTone;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        "flex flex-none items-center justify-center rounded-control text-page ring-1 ring-ink-900/5",
        badgeTones[tone],
        className,
      )}
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2} />
    </span>
  );
}
