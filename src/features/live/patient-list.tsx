"use client";

import { ChevronRight, MessageCircle, Search, ShieldAlert, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useNow, useResource } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { TherapistHomeDto } from "@/lib/live/types";
import type { WorkspaceDto } from "@/lib/live/workspace";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { KpiBand } from "./ops-bits";
import { RequestCard } from "./therapist-home";

type Show = "all" | "week" | "todo" | "precaution";

const DAY = 86_400_000;

/** "Today 1:00 pm", "Tomorrow 9:30 am", "Fri, 27 Nov". */
function nextLabel(iso: string, now: number) {
  const key = (ms: number) => new Date(ms + 36e6).toISOString().slice(0, 10);
  const at = Date.parse(iso);
  if (key(at) === key(now)) return `Today ${timeOfDay(iso)}`;
  if (key(at) === key(now + DAY)) return `Tomorrow ${timeOfDay(iso)}`;
  return shortDate(iso);
}

/** Everyone on the therapist's caseload, with when they're next seen and what's left to do. */
export function PatientList() {
  const { data, error, loading, reload } = useResource<WorkspaceDto>(
    "/api/care/workspace",
    (e) => e.type === "care" || e.type === "notification",
  );
  const home = useResource<TherapistHomeDto>(
    "/api/care/therapist",
    (e) => e.type === "care" || e.type === "notification",
  );
  const now = useNow() ?? (data ? Date.parse(data.now) : 0);
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.clients
      .map((c) => {
        const notes = data.notes.filter(
          (n) => n.clientName === c.name && n.status !== "Signed",
        ).length;
        const tasks = data.tasks.filter(
          (t) =>
            t.participant === c.name &&
            !t.delegated &&
            t.overdue &&
            t.status !== "Completed" &&
            t.status !== "Cancelled",
        ).length;
        const assessments = data.assessments.filter(
          (a) => a.clientId === c.id && (a.status === "In Progress" || a.status === "Paused"),
        ).length;
        const nextAt = c.nextVisit ? Date.parse(c.nextVisit) : null;
        return {
          ...c,
          notes,
          tasks,
          assessments,
          todo: notes + tasks + assessments,
          thisWeek: nextAt !== null && nextAt - now < 7 * DAY,
        };
      })
      .sort(
        (a, b) =>
          (a.nextVisit ? Date.parse(a.nextVisit) : Infinity) -
            (b.nextVisit ? Date.parse(b.nextVisit) : Infinity) || a.name.localeCompare(b.name),
      );
  }, [data, now]);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (show === "all" ||
        (show === "week" && r.thisWeek) ||
        (show === "todo" && r.todo > 0) ||
        (show === "precaution" && r.safetyFlag)) &&
      (!q ||
        `${r.name} ${r.mrn} ${r.suburb} ${r.episodes.map((e) => e.support).join(" ")}`
          .toLowerCase()
          .includes(q)),
  );
  const requests = home.data?.requests.length ?? 0;
  const count = (s: Show) =>
    rows.filter((r) =>
      s === "week" ? r.thisWeek : s === "todo" ? r.todo > 0 : s === "precaution" && r.safetyFlag,
    ).length;

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Patients"
        description="Everyone on your caseload. Open a patient to see their visits, notes, assessments, plan and progress in one place."
        actions={<LiveBadge />}
      />
      <div className="flex flex-col gap-6">
        {requests > 0 && (
          <section
            aria-label="New patient requests"
            className="overflow-hidden rounded-card border border-available bg-surface"
          >
            <header className="flex items-center gap-3 border-b border-border bg-available-bg px-5 py-3.5">
              <UserPlus className="size-5 flex-none text-available" aria-hidden="true" />
              <h2 className="flex-1 text-section font-semibold text-ink-900">
                {requests} new patient request{requests === 1 ? "" : "s"}
              </h2>
              <span className="text-caption text-ink-700">Accept or decline</span>
            </header>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {(home.data?.requests ?? []).map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  onDone={() => {
                    home.reload();
                    reload();
                  }}
                />
              ))}
            </div>
          </section>
        )}

        <KpiBand
          label="My caseload"
          items={[
            {
              label: "My patients",
              value: rows.length,
              sub: `${rows.reduce((s, r) => s + r.episodes.length, 0)} services`,
              onClick: () => setShow("all"),
            },
            {
              label: "Seeing this week",
              value: count("week"),
              sub: "Visit in the next 7 days",
              onClick: () => setShow("week"),
            },
            {
              label: "Need something",
              value: count("todo"),
              sub: "A note, task or assessment",
              tone: count("todo") ? "watch" : undefined,
              onClick: () => setShow("todo"),
            },
            {
              label: "Precautions",
              value: count("precaution"),
              sub: "Read before visiting",
              tone: count("precaution") ? "over" : undefined,
              onClick: () => setShow("precaution"),
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
                { id: "all", label: `All (${rows.length})` },
                { id: "week", label: "This week" },
                { id: "todo", label: "Need something" },
                { id: "precaution", label: "Precautions" },
              ]}
            />
            <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
              <Search className="size-4 text-ink-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search patients"
                placeholder="Name, MRN, suburb or service"
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
              <EmptyNote title={rows.length ? "Nobody matches." : "No patients yet."}>
                {rows.length
                  ? "Try another name or show everyone."
                  : "Patients appear here when you accept a request."}
              </EmptyNote>
            </div>
          ) : (
            sections(shown).map(([title, list]) => (
              <section key={title} aria-label={title}>
                <h2 className="flex items-baseline justify-between border-b border-border bg-sunken px-5 py-2 text-small font-semibold text-ink-700">
                  {title}
                  <span className="text-caption font-medium text-ink-500">
                    {list.length} patient{list.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <ul className="divide-y divide-border">
                  {list.map((r) => (
                    <PatientRow key={r.id} r={r} now={now} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </section>
      </div>
    </>
  );
}

type Row = WorkspaceDto["clients"][number] & {
  notes: number;
  tasks: number;
  assessments: number;
  todo: number;
  thisWeek: boolean;
};

/** Who you see soonest comes first, so the list reads like the week ahead. */
function sections(list: Row[]) {
  const groups: [string, Row[]][] = [
    ["Seeing this week", list.filter((r) => r.thisWeek)],
    ["Later", list.filter((r) => r.nextVisit && !r.thisWeek)],
    ["No visit booked", list.filter((r) => !r.nextVisit)],
  ];
  return groups.filter(([, rows]) => rows.length > 0);
}

const bne = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", ...o }).format(new Date(iso));

/** The next visit as a small calendar leaf: the date is what a therapist scans for. */
function DateLeaf({ iso, now }: { iso: string | null; now: number }) {
  if (!iso) {
    return (
      <span className="flex h-16 w-15 flex-none flex-col items-center justify-center rounded-control border border-dashed border-border-strong text-caption text-ink-500">
        None
      </span>
    );
  }
  const soon = Date.parse(iso) - now < DAY;
  return (
    <span
      className={cn(
        "flex h-16 w-15 flex-none flex-col items-center justify-center rounded-control border",
        soon ? "border-accent bg-accent-tint" : "border-border bg-surface",
      )}
    >
      <span className={cn("text-label font-semibold", soon ? "text-accent" : "text-ink-500")}>
        {bne(iso, { weekday: "short" })}
      </span>
      <span className="type-display text-h2 leading-none text-ink-900">
        {bne(iso, { day: "numeric" })}
      </span>
      <span className="text-label text-ink-500">{bne(iso, { month: "short" })}</span>
    </span>
  );
}

function PatientRow({ r, now }: { r: Row; now: number }) {
  const router = useRouter();
  const href = `/therapist/patients/${r.id}`;
  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        aria-label={`Open ${r.name}`}
        onClick={() => router.push(href)}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(href);
        }}
        className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.3fr)_auto]"
      >
        <DateLeaf iso={r.nextVisit} now={now} />
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} kind="patient" size={44} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-section font-semibold text-ink-900">
              <span className="truncate">{r.name}</span>
              {r.safetyFlag && (
                <ShieldAlert className="size-4 flex-none text-over" aria-label="Has a precaution" />
              )}
            </p>
            <p className="truncate text-small text-ink-500">
              {r.nextVisit ? nextLabel(r.nextVisit, now) : "No visit booked"}
              {r.age ? `, ${r.age}` : ""}, {r.suburb}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.episodes.map((e) => (
                <span
                  key={e.needId}
                  className="rounded-tag border border-border-strong px-2 py-0.5 text-caption text-ink-700"
                >
                  {e.support}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="col-span-3 flex flex-wrap gap-1.5 md:col-span-1">
          {r.todo === 0 ? (
            <Tag tone="healthy">Up to date</Tag>
          ) : (
            <>
              {r.notes > 0 && (
                <Tag tone="watch">
                  {r.notes} note{r.notes === 1 ? "" : "s"} to finish
                </Tag>
              )}
              {r.tasks > 0 && (
                <Tag tone="over">
                  {r.tasks} overdue task{r.tasks === 1 ? "" : "s"}
                </Tag>
              )}
              {r.assessments > 0 && (
                <Tag tone="available">
                  {r.assessments} assessment{r.assessments === 1 ? "" : "s"} open
                </Tag>
              )}
            </>
          )}
        </div>
        <div className="col-start-3 row-start-1 flex items-center gap-1 md:col-start-auto md:row-start-auto">
          {r.conversationId && (
            <ButtonLink
              href={`/messages?c=${r.conversationId}`}
              size="sm"
              variant="ghost"
              aria-label={`Message ${r.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
            </ButtonLink>
          )}
          <ChevronRight
            className="size-5 text-ink-500 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </li>
  );
}
