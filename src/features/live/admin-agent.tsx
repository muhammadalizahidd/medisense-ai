"use client";

import {
  Banknote,
  BrainCircuit,
  CalendarClock,
  ClipboardList,
  Inbox,
  type LucideIcon,
  MessagesSquare,
  Send,
  Sunrise,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconBadge, type BadgeTone } from "@/features/mobile/phone-frame";
import { cn } from "@/lib/cn";
import type { AdminAgentDto, AgentFeature, AgentReply } from "@/lib/live/agent";
import { useResource } from "@/lib/live/client";
import { AgentAnswer, agentCall, RunHistory } from "./agent-ui";

const ENDPOINT = "/api/agent";

const groupLook: Record<string, { icon: LucideIcon; tone: BadgeTone }> = {
  Intake: { icon: Inbox, tone: "blue" },
  Allocation: { icon: Users, tone: "teal" },
  Scheduling: { icon: CalendarClock, tone: "violet" },
  Workforce: { icon: Users, tone: "orange" },
  Funding: { icon: ClipboardList, tone: "green" },
  Finance: { icon: Banknote, tone: "amber" },
  Communication: { icon: MessagesSquare, tone: "indigo" },
  Operations: { icon: Workflow, tone: "ink" },
  Insight: { icon: BrainCircuit, tone: "red" },
};

const SUGGESTIONS = [
  "Which referrals need attention?",
  "Who should take the next waiting patient?",
  "Which invoices are overdue?",
  "Which agreements are unsigned?",
  "Where are referrals delayed?",
];

type Turn = { q: string; reply: AgentReply | null };

/** The admin AI operations agent: daily briefing, 32 features, answers with proposals, run history. */
export function AdminAgent({ embedded = false }: { embedded?: boolean }) {
  const r = useResource<AdminAgentDto>(ENDPOINT, (e) => e.type === "care");
  const d = r.data;
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const end = useRef<HTMLDivElement>(null);
  // The newest answer sits at the bottom, next to the box, as in chat apps.
  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState<string>("All");

  async function ask(q: string, feature?: AgentFeature) {
    const question = q.trim() || feature?.title || "";
    if (!question || busy) return;
    setBusy(true);
    setText("");
    setTurns((t) => [...t, { q: question, reply: null }]);
    const out = await agentCall<{ reply: AgentReply }>(ENDPOINT, {
      type: "ask",
      text: question,
      ...(feature ? { feature: feature.no } : {}),
    });
    setTurns((t) =>
      t.map((x, i) => (i === t.length - 1 ? { ...x, reply: out?.reply ?? null } : x)),
    );
    setBusy(false);
    r.reload();
  }

  const groups = d ? ["All", ...Array.from(new Set(d.features.map((f) => f.group)))] : ["All"];
  const shown = d ? d.features.filter((f) => group === "All" || f.group === group) : [];

  return (
    <div className="flex flex-col gap-6">
      <header
        className={cn("flex flex-wrap items-end justify-between gap-4", embedded && "sr-only")}
      >
        <div>
          <p className="label-caps text-ink-500">Live care · AI operations agent</p>
          <h1 className="type-display text-h1 text-ink-900">Operations agent</h1>
          <p className="mt-1 max-w-180 text-small text-ink-700">
            Ask about intake, allocation, scheduling, funding, billing or today&apos;s priorities.
            Answers come from live records and approved sources; any change is shown as a proposal
            you confirm. Clinical decisions stay with clinicians.
          </p>
        </div>
      </header>

      <section
        aria-label="Daily operations briefing"
        className="rounded-card border border-border bg-surface p-5"
      >
        <div className="flex items-center gap-3">
          <IconBadge icon={Sunrise} tone="orange" />
          <div className="flex-1">
            <p className="text-section text-ink-900">Today&apos;s operations briefing</p>
            <p className="text-caption text-ink-500">
              Ordered by the daily operations SOP · counts link to the records
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => ask("Give me today's briefing")}>
            Explain the briefing
          </Button>
        </div>
        {!d ? (
          <div className="mt-4 h-24 animate-pulse rounded-card bg-sunken" />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {d.briefing.map((b) => (
              <Link
                key={b.label}
                href={b.href}
                className={cn(
                  "rounded-card border p-3 transition-shadow duration-140 hover:shadow-lift",
                  b.tone === "over"
                    ? "border-over bg-over-bg"
                    : b.tone === "watch"
                      ? "border-border bg-watch-bg"
                      : "border-border bg-sunken",
                )}
              >
                <p className="type-display text-h2 text-ink-900">{b.value}</p>
                <p className="mt-0.5 text-caption font-semibold text-ink-700">{b.label}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section
          className="flex h-[min(720px,calc(100dvh-10rem))] min-h-[480px] flex-col overflow-hidden rounded-card border border-border bg-surface xl:col-span-7"
          aria-label="Ask the agent"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="label-caps text-ink-500">Ask the operations agent</span>
          </div>
          <div
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4"
          >
            {turns.length === 0 && (
              <p className="my-auto rounded-card border border-dashed border-border-strong p-6 text-center text-small text-ink-500">
                Ask a question or pick a feature. Answers appear here with their facts, sources and
                any proposed change.
              </p>
            )}
            {turns.map((t, i) => (
              <div key={`${i}-${t.q}`} className="flex flex-col gap-2">
                <p className="self-end rounded-card bg-accent-tint px-3 py-2 text-small font-semibold text-accent">
                  {t.q}
                </p>
                {t.reply ? (
                  <AgentAnswer reply={t.reply} endpoint={ENDPOINT} onRun={r.reload} />
                ) : (
                  <div
                    role="status"
                    className="h-24 animate-pulse rounded-card border border-dashed border-draft-rule bg-draft"
                  >
                    <span className="sr-only">The agent is checking live records</span>
                  </div>
                )}
              </div>
            ))}
            <div ref={end} aria-hidden="true" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
            className="border-t border-border bg-page p-3"
          >
            {turns.length === 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void ask(q)}
                    className="cursor-pointer rounded-full border border-border-strong bg-surface px-3 py-1 text-caption text-ink-700 transition-colors duration-140 hover:border-accent-fill hover:text-accent"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-card border border-border-strong bg-surface p-1.5 pl-3 shadow-lift focus-within:border-accent-fill">
              <label htmlFor="agent-q" className="sr-only">
                Ask the operations agent
              </label>
              <input
                id="agent-q"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Which referrals are missing information?"
                className="h-9 min-w-0 flex-1 bg-transparent text-body text-ink-900 outline-none placeholder:text-ink-500 focus-visible:shadow-none"
              />
              <Button type="submit" variant="primary" loading={busy} aria-label="Ask">
                <Send className="size-4" aria-hidden="true" />
                Ask
              </Button>
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-4 xl:col-span-5" aria-label="Agent features">
          <div className="rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <p className="text-section text-ink-900">
                {d ? d.features.length : 32} agent features
              </p>
              <div
                role="radiogroup"
                aria-label="Feature group"
                className="mt-2 flex flex-wrap gap-1"
              >
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={group === g}
                    onClick={() => setGroup(g)}
                    className={cn(
                      "rounded-tag px-2 py-1 text-caption font-semibold transition-colors duration-140",
                      group === g ? "bg-accent-tint text-accent" : "text-ink-500 hover:bg-sunken",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <ul className="max-h-130 divide-y divide-border overflow-y-auto">
              {shown.map((f) => {
                const look = groupLook[f.group] ?? { icon: Workflow, tone: "ink" as const };
                return (
                  <li key={f.no}>
                    <button
                      type="button"
                      onClick={() => void ask("", f)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-140 hover:bg-sunken disabled:opacity-60"
                    >
                      <IconBadge icon={look.icon} tone={look.tone} size={30} />
                      <span className="w-9 flex-none font-mono text-caption text-ink-500">
                        {f.no}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-ink-900">
                          {f.title}
                        </span>
                        <span className="block text-caption text-ink-500">{f.module}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {d && <RunHistory runs={d.runs} endpoint={ENDPOINT} onRun={r.reload} />}
        </section>
      </div>
    </div>
  );
}
