"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/live/client";

/** Fired by "Take the tour" in the account menu. */
export const TOUR_EVENT = "medisense:tour";

const DONE_KEY = "medisense-tour:v1:";
const CARD_W = 340;
const GAP = 14;

type Step = { target: string; title: string; body: string };

function stepsFor(first: string, therapist: boolean): Step[] {
  return [
    {
      target: "menu",
      title: first ? `Welcome, ${first}. This is your menu` : "This is your menu",
      body: therapist
        ? "Everything for your day is here. Start at Today: your visits and what to do next, most urgent first."
        : "It shows only the pages your role uses, grouped by job. Your usual work is at the top.",
    },
    {
      target: "ask",
      title: "Ask Medisense",
      body: "Ask in plain words, like “Who is waiting for a therapist?”. Press Ctrl K to jump here from any page.",
    },
    {
      target: "guide",
      title: "Not sure what a page does?",
      body: "Open the Guide. Every page has one: what the page is for and how to use it, step by step.",
    },
    {
      target: "account",
      title: "Your account",
      body: "Your profile, appearance and sign out. You can take this tour again from here at any time.",
    },
  ];
}

/** The element for a step, if it is on screen; hidden parts (small screens, AI off) are skipped. */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

const doneFor = (id: string) => {
  try {
    return localStorage.getItem(DONE_KEY + id) === "1";
  } catch {
    // Storage can be blocked in private windows; then the tour simply doesn't start by itself.
    return true;
  }
};
const markDone = (id: string) => {
  try {
    localStorage.setItem(DONE_KEY + id, "1");
  } catch {
    // See above.
  }
};

/**
 * A four-step welcome the first time someone signs in: the menu, Ask Medisense, the Guide and
 * the account menu. Each step lights up the real part of the screen. It runs once per person per
 * browser and can be replayed from the account menu.
 */
export function WelcomeTour() {
  const { user } = useSession();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  const start = useCallback(() => {
    const first = user?.name.split(" ")[0] ?? "";
    const shown = stepsFor(first, user?.role === "therapist").filter((s) => findTarget(s.target));
    if (shown.length === 0) return;
    setIndex(0);
    setSteps(shown);
  }, [user]);

  const finish = useCallback(() => {
    if (user) markDone(user.id);
    setSteps(null);
  }, [user]);

  // First sign-in: wait a moment so the page has laid out before pointing at it.
  useEffect(() => {
    if (!user || user.role === "client" || doneFor(user.id)) return undefined;
    const t = window.setTimeout(start, 900);
    return () => window.clearTimeout(t);
  }, [user, start]);

  useEffect(() => {
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [start]);

  const step = steps?.[index];

  // Follow the target through resizes and scrolling.
  useLayoutEffect(() => {
    if (!step) return undefined;
    const measure = () => setRect(findTarget(step.target)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (step) primary.current?.focus();
  }, [step]);

  if (!steps || !step) return null;

  const last = index === steps.length - 1;
  const next = () => (last ? finish() : setIndex(index + 1));
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  const hole = rect
    ? {
        top: Math.max(rect.top - 4, 0),
        left: Math.max(rect.left - 4, 0),
        right: Math.min(rect.right + 4, vw),
        bottom: Math.min(rect.bottom + 4, vh),
      }
    : null;

  // A tall, narrow target (the menu) gets the card beside it; anything else gets it underneath.
  const beside = Boolean(rect && rect.height > vh * 0.5);
  const width = Math.min(CARD_W, vw - 32);
  const position = !rect
    ? { top: vh / 2 - 100, left: vw / 2 - width / 2 }
    : beside
      ? { top: Math.min(Math.max(rect.top + 96, 16), vh - 260), left: rect.right + GAP }
      : {
          top: rect.bottom + GAP,
          left: Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 16), vw - width - 16),
        };

  return createPortal(
    <div className="fixed inset-0 z-50 print:hidden">
      {/* The dim surround in four pieces, so the target stays fully visible and clickable-looking. */}
      {hole ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-scrim" style={{ height: hole.top }} />
          <div className="absolute inset-x-0 bottom-0 bg-scrim" style={{ top: hole.bottom }} />
          <div
            className="absolute left-0 bg-scrim"
            style={{ top: hole.top, height: hole.bottom - hole.top, width: hole.left }}
          />
          <div
            className="absolute right-0 bg-scrim"
            style={{ top: hole.top, height: hole.bottom - hole.top, left: hole.right }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-control ring-2 ring-accent transition-all duration-(--duration-base) motion-reduce:transition-none"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.right - hole.left,
              height: hole.bottom - hole.top,
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-scrim" />
      )}

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            finish();
          }
          if (e.key === "Tab") {
            const items = card.current?.querySelectorAll<HTMLElement>("button");
            if (!items?.length) return;
            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            if (e.shiftKey && document.activeElement === firstItem) {
              e.preventDefault();
              lastItem?.focus();
            } else if (!e.shiftKey && document.activeElement === lastItem) {
              e.preventDefault();
              firstItem?.focus();
            }
          }
        }}
        className="absolute flex flex-col gap-3 rounded-card border border-border bg-raised p-5 shadow-overlay transition-[top,left] duration-(--duration-base) motion-reduce:transition-none"
        style={{ ...position, width }}
      >
        <p className="label-caps text-accent">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="text-section font-semibold text-ink-900">
          {step.title}
        </h2>
        <p id="tour-body" className="text-small text-ink-700">
          {step.body}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.target}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-(--duration-base) motion-reduce:transition-none",
                  i === index ? "w-5 bg-accent-fill" : "w-1.5 bg-border-strong",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {last ? null : (
              <Button size="sm" variant="ghost" onClick={finish}>
                Skip
              </Button>
            )}
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button ref={primary} size="sm" variant="primary" onClick={next}>
              {last ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
