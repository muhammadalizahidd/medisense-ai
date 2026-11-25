"use client";

import { Check, ChevronRight, Diamond, ListPlus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useNow, useResource } from "@/lib/live/client";
import { statusTone, type TaskRow } from "@/lib/live/coord";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { NewTask, type Options } from "./coord-hub";
import { KpiBand, dueIn, ops } from "./ops-bits";

const BASE = "/therapist/coordination";
const DAY = 86_400_000;
const dayKey = (ms: number) => new Date(ms + 36e6).toISOString().slice(0, 10);
const bne = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", ...o }).format(new Date(iso));

type Show = "mine" | "overdue" | "waiting" | "done" | "team";
const isOpen = (r: TaskRow) => r.status !== "Completed" && r.status !== "Cancelled";
const isWaiting = (r: TaskRow) => r.status.startsWith("Waiting") || r.status === "Pending Review";

/** "Waiting on Patient" reads as "Waiting on patient". */
const plainStatus = (s: string) =>
  s.replace(/ (Patient|Admin|Clinician|Review|Progress)$/, (m) => m.toLowerCase());

/** The therapist's tasks: what's late, what's due today, what's waiting on someone else. */
export function TasksPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useResource<{ rows: TaskRow[]; options: Options }>(
    "/api/care/coordination",
    (e) => e.type === "care",
  );
  const now = useNow();
  const [show, setShow] = useState<Show>("mine");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const view = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => r.suggestion !== "pending");
    const mine = rows.filter((r) => r.mine);
    const open = mine.filter(isOpen);
    const today = now === null ? "" : dayKey(now);
    return {
      rows,
      mine,
      open,
      overdue: open.filter((r) => r.overdue),
      dueToday: open.filter(
        (r) => !r.overdue && r.dueAt !== null && dayKey(Date.parse(r.dueAt)) === today,
      ),
      waiting: open.filter(isWaiting),
      suggestions: (data?.rows ?? []).filter((r) => r.suggestion === "pending"),
    };
  }, [data, now]);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data || now === null) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
        <Skeleton className="h-[520px]" />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const base =
    show === "mine"
      ? view.open
      : show === "overdue"
        ? view.overdue
        : show === "waiting"
          ? view.waiting
          : show === "done"
            ? view.mine.filter((r) => !isOpen(r))
            : view.rows.filter(isOpen);
  const shown = base
    .filter(
      (r) =>
        !q ||
        `${r.ref} ${r.title} ${r.participant ?? ""} ${r.participantId} ${r.category}`
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) =>
      show === "done"
        ? (b.dueAt ?? "").localeCompare(a.dueAt ?? "")
        : (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"),
    );

  const today = dayKey(now);
  const groups: [string, TaskRow[]][] =
    show === "done"
      ? [["Completed and cancelled", shown]]
      : [
          ["Overdue", shown.filter((r) => r.overdue)],
          [
            "Today",
            shown.filter((r) => !r.overdue && r.dueAt && dayKey(Date.parse(r.dueAt)) === today),
          ],
          [
            "This week",
            shown.filter(
              (r) =>
                !r.overdue &&
                r.dueAt &&
                dayKey(Date.parse(r.dueAt)) > today &&
                Date.parse(r.dueAt) - now < 7 * DAY,
            ),
          ],
          ["Later", shown.filter((r) => r.dueAt && Date.parse(r.dueAt) - now >= 7 * DAY)],
          ["No due date", shown.filter((r) => !r.dueAt)],
        ];

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Tasks"
        description="Follow-ups, handovers, referrals and requests, each with a due date. Overdue first."
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <ListPlus className="size-4" aria-hidden="true" />
              New task
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-6">
        {view.suggestions.length > 0 && (
          <button
            type="button"
            onClick={() => setSuggesting(true)}
            className="flex cursor-pointer items-center gap-4 rounded-card px-5 py-4 text-left surface-draft"
          >
            <span className="flex size-10 flex-none items-center justify-center rounded-control bg-surface text-ink-900">
              <Diamond className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-section font-semibold text-ink-900">
                AI suggested {view.suggestions.length} task
                {view.suggestions.length === 1 ? "" : "s"}
              </span>
              <span className="block text-small text-ink-700">
                Suggestions only. Nothing becomes a task until you accept it.
              </span>
            </span>
            <span className="flex items-center gap-1 text-small font-semibold text-accent">
              Review
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </button>
        )}

        <KpiBand
          label="My tasks"
          items={[
            {
              label: "Open tasks",
              value: view.open.length,
              sub: "Assigned to you",
              onClick: () => setShow("mine"),
            },
            {
              label: "Overdue",
              value: view.overdue.length,
              sub: view.overdue.length ? "Past their due date" : "Nothing late",
              tone: view.overdue.length ? "over" : undefined,
              onClick: () => setShow("overdue"),
            },
            {
              label: "Due today",
              value: view.dueToday.length,
              sub: "Before the end of the day",
              tone: view.dueToday.length ? "watch" : undefined,
              onClick: () => setShow("mine"),
            },
            {
              label: "Waiting on someone",
              value: view.waiting.length,
              sub: "Patient, office or colleague",
              onClick: () => setShow("waiting"),
            },
          ]}
        />

        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
            <Segmented<Show>
              label="Show"
              value={show}
              onChange={setShow}
              options={[
                { id: "mine", label: `My open (${view.open.length})` },
                { id: "overdue", label: "Overdue" },
                { id: "waiting", label: "Waiting" },
                { id: "done", label: "Done" },
                { id: "team", label: "Whole team" },
              ]}
            />
            <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
              <Search className="size-4 text-ink-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search tasks"
                placeholder="Task, patient or reference"
                className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="cursor-pointer text-ink-500 hover:text-ink-900"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </label>
          </div>

          {shown.length === 0 ? (
            <div className="p-5">
              <EmptyNote
                title={q ? "No tasks match." : show === "done" ? "Nothing done yet." : "All clear."}
              >
                {q ? "Try another word or reference." : "New tasks appear here as they arrive."}
              </EmptyNote>
            </div>
          ) : (
            groups
              .filter(([, rows]) => rows.length > 0)
              .map(([title, rows]) => (
                <section key={title} aria-label={title}>
                  <h2
                    className={cn(
                      "flex items-baseline justify-between border-b border-border bg-sunken px-5 py-2 text-small font-semibold",
                      title === "Overdue" ? "text-over" : "text-ink-700",
                    )}
                  >
                    {title}
                    <span className="text-caption font-medium text-ink-500">
                      {rows.length} task{rows.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <ul className="divide-y divide-border">
                    {rows.map((r) => (
                      <TaskLine
                        key={r.id}
                        r={r}
                        now={now}
                        team={show === "team"}
                        onOpen={() => router.push(`${BASE}/${r.id}`)}
                      />
                    ))}
                  </ul>
                </section>
              ))
          )}
        </section>
      </div>

      {suggesting && (
        <Modal
          title="Suggested tasks"
          description="AI suggestions only. Accept the ones that are right; they become open tasks."
          size="lg"
          onClose={() => setSuggesting(false)}
        >
          <ul className="divide-y divide-border">
            {view.suggestions.map((r, i) => (
              <SuggestionRow
                key={r.id}
                r={r}
                onDone={reload}
                duplicate={view.suggestions
                  .slice(0, i)
                  .some((o) => o.title === r.title && o.participant === r.participant)}
              />
            ))}
          </ul>
        </Modal>
      )}
      {creating && (
        <NewTask
          options={data.options}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`${BASE}/${id}`)}
        />
      )}
    </>
  );
}

/** A due date as a small leaf: red when it has passed, dashed when there isn't one. */
function DueLeaf({ r }: { r: TaskRow }) {
  if (!r.dueAt) {
    return (
      <span className="flex h-16 w-14 flex-none items-center justify-center rounded-control border border-dashed border-border-strong text-center text-label text-ink-500">
        No date
      </span>
    );
  }
  const late = r.overdue && isOpen(r);
  return (
    <span
      className={cn(
        "flex h-16 w-14 flex-none flex-col items-center justify-center rounded-control border",
        late ? "border-over bg-over-bg" : "border-border bg-surface",
      )}
    >
      <span className={cn("text-label font-semibold", late ? "text-over" : "text-ink-500")}>
        {bne(r.dueAt, { weekday: "short" })}
      </span>
      <span className="type-display text-h2 leading-none text-ink-900">
        {bne(r.dueAt, { day: "numeric" })}
      </span>
      <span className="text-label text-ink-500">{bne(r.dueAt, { month: "short" })}</span>
    </span>
  );
}

function TaskLine({
  r,
  now,
  team,
  onOpen,
}: {
  r: TaskRow;
  now: number;
  team: boolean;
  onOpen: () => void;
}) {
  const open = isOpen(r);
  const urgent = r.priority === "High" || r.priority === "Urgent";
  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        aria-label={`Open ${r.title}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.2fr)_auto]"
      >
        <DueLeaf r={r} />
        <div className="min-w-0">
          <p className="truncate text-section font-semibold text-ink-900">{r.title}</p>
          <p className="truncate text-small text-ink-500">
            {[r.participant, r.category, team ? r.assignee : null].filter(Boolean).join(", ")}
          </p>
          {r.dueAt && open && (
            <p
              className={cn("text-caption", r.overdue ? "font-semibold text-over" : "text-ink-500")}
            >
              {r.overdue
                ? `Due ${dueIn(r.dueAt, now).replace(" overdue", "")} ago`
                : `Due ${dueIn(r.dueAt, now)}`}
            </p>
          )}
        </div>
        <div className="col-span-3 flex flex-wrap items-center gap-1.5 md:col-span-1">
          <Tag tone={statusTone[r.status]}>{plainStatus(r.status)}</Tag>
          {urgent && open && <Tag tone="over">{r.priority} priority</Tag>}
        </div>
        <div className="col-start-3 row-start-1 flex items-center gap-2 md:col-start-auto md:row-start-auto">
          <span
            className={cn(
              "hidden h-8 items-center rounded-control px-3 text-small font-semibold sm:inline-flex",
              open && r.overdue
                ? "bg-accent-fill text-on-accent group-hover:bg-accent-fill-hover"
                : "border border-border-strong text-ink-900",
            )}
          >
            Open
          </span>
          <ChevronRight
            className="size-5 text-ink-500 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </li>
  );
}

/** One AI suggestion: what it proposes, for whom and why, and a person's decision. */
function SuggestionRow({
  r,
  onDone,
  duplicate,
}: {
  r: TaskRow;
  onDone: () => void;
  duplicate: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function decide(decision: "accept" | "reject") {
    setBusy(true);
    const ok = await ops(
      `/api/care/coordination/${r.id}`,
      { type: "suggestion", decision, title: decision === "accept" ? r.title : "" },
      decision === "accept" ? "Accepted" : "Dismissed",
      decision === "accept" ? "Now an open task" : undefined,
    );
    setBusy(false);
    if (ok) onDone();
  }
  return (
    <li className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
      <span className="flex size-9 flex-none items-center justify-center rounded-control border border-dashed border-draft-rule bg-draft text-ink-900">
        <Diamond className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-section font-semibold text-ink-900">{r.title}</p>
        <p className="text-small text-ink-500">
          {[r.participant, r.category].filter(Boolean).join(", ")}
        </p>
        {duplicate && (
          <p className="mt-1.5 inline-flex rounded-tag bg-watch-bg px-2 py-0.5 text-caption font-semibold text-watch">
            Looks like a repeat of the one above
          </p>
        )}
      </div>
      <div className="flex flex-none gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide("accept")}>
          <Check className="size-4" aria-hidden="true" />
          Accept
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide("reject")}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}
