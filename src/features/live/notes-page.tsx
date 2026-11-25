"use client";

import { ChevronRight, Diamond, PenLine, Search, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useNow, useResource } from "@/lib/live/client";
import type { DocOption, DocRow, DocStatus } from "@/lib/live/docs";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { NewNote } from "./doc-queue";
import { KpiBand } from "./ops-bits";

const BASE = "/therapist/documentation";
const DAY = 86_400_000;
const bne = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", ...o }).format(new Date(iso));

/** Each stage in plain words, with the one thing to do next. */
const stage: Record<DocStatus, { label: string; tone: TagTone; action: string }> = {
  Capturing: { label: "Started", tone: "neutral", action: "Continue" },
  "AI Draft": { label: "AI draft to check", tone: "watch", action: "Check draft" },
  Editing: { label: "Draft", tone: "watch", action: "Continue" },
  "Needs Review": { label: "Needs your review", tone: "watch", action: "Review" },
  "Awaiting Co-sign": { label: "With supervisor", tone: "available", action: "View" },
  Signed: { label: "Signed", tone: "healthy", action: "View" },
  Addendum: { label: "Signed, with addendum", tone: "healthy", action: "View" },
};

type Show = "todo" | "supervisor" | "signed" | "all";
const isSigned = (r: DocRow) => r.status === "Signed" || r.status === "Addendum";
const isTodo = (r: DocRow) => !isSigned(r) && r.status !== "Awaiting Co-sign";

/** The therapist's notes: what to write or sign first, then what's with the supervisor and signed. */
export function NotesPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useResource<{ rows: DocRow[]; options: DocOption[] }>(
    "/api/care/documentation",
    (e) => e.type === "care",
  );
  const now = useNow();
  const [show, setShow] = useState<Show>("todo");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      todo: rows.filter(isTodo).length,
      late: rows.filter((r) => isTodo(r) && r.overdue).length,
      supervisor: rows.filter((r) => r.status === "Awaiting Co-sign").length,
      signedWeek: rows.filter(
        (r) => isSigned(r) && now !== null && now - Date.parse(r.encounterAt) < 7 * DAY,
      ).length,
      signed: rows.filter(isSigned).length,
      all: rows.length,
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
  const shown = data.rows
    .filter((r) =>
      show === "todo"
        ? isTodo(r)
        : show === "supervisor"
          ? r.status === "Awaiting Co-sign"
          : show === "signed"
            ? isSigned(r)
            : true,
    )
    .filter(
      (r) =>
        !q ||
        `${r.participant} ${r.participantId} ${r.ref} ${r.noteType}`.toLowerCase().includes(q),
    )
    .sort((a, b) =>
      show === "todo"
        ? Date.parse(a.encounterAt) - Date.parse(b.encounterAt)
        : Date.parse(b.encounterAt) - Date.parse(a.encounterAt),
    );

  /* To-do notes group by how late they are; everything else by when the visit was. */
  const groups: [string, DocRow[]][] =
    show === "todo"
      ? [
          ["Late", shown.filter((r) => r.overdue)],
          ["To finish", shown.filter((r) => !r.overdue)],
        ]
      : [
          ["This week", shown.filter((r) => now - Date.parse(r.encounterAt) < 7 * DAY)],
          ["Earlier", shown.filter((r) => now - Date.parse(r.encounterAt) >= 7 * DAY)],
        ];

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Notes"
        description="Write, check and sign your clinical notes. The oldest unsigned note is at the top."
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <PenLine className="size-4" aria-hidden="true" />
              New note
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-6">
        <KpiBand
          label="My notes"
          items={[
            {
              label: "Notes to finish",
              value: counts.todo,
              sub: counts.todo ? "Write, check or sign" : "Nothing waiting",
              tone: counts.todo ? "watch" : undefined,
              onClick: () => setShow("todo"),
            },
            {
              label: "Late",
              value: counts.late,
              sub: "More than 2 days since the visit",
              tone: counts.late ? "over" : undefined,
              onClick: () => setShow("todo"),
            },
            {
              label: "With supervisor",
              value: counts.supervisor,
              sub: "Waiting for their sign-off",
              onClick: () => setShow("supervisor"),
            },
            {
              label: "Signed this week",
              value: counts.signedWeek,
              sub: `${counts.signed} signed in all`,
              onClick: () => setShow("signed"),
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
                { id: "todo", label: `To finish (${counts.todo})` },
                { id: "supervisor", label: "With supervisor" },
                { id: "signed", label: "Signed" },
                { id: "all", label: "All" },
              ]}
            />
            <label className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
              <Search className="size-4 text-ink-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search notes"
                placeholder="Patient, MRN or note reference"
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
                title={
                  q
                    ? "No notes match."
                    : show === "todo"
                      ? "All your notes are signed."
                      : "No notes here yet."
                }
              >
                {q ? "Try another name or reference." : "New notes appear here after each visit."}
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
                      title === "Late" ? "text-over" : "text-ink-700",
                    )}
                  >
                    {title}
                    <span className="text-caption font-medium text-ink-500">
                      {rows.length} note{rows.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <ul className="divide-y divide-border">
                    {rows.map((r) => (
                      <NoteRow
                        key={r.id}
                        r={r}
                        now={now}
                        onOpen={() => router.push(`${BASE}/${r.id}`)}
                      />
                    ))}
                  </ul>
                </section>
              ))
          )}
        </section>
      </div>

      {creating && (
        <NewNote
          options={data.options}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`${BASE}/${id}`)}
        />
      )}
    </>
  );
}

function since(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  if (days <= 0) return "Visit today";
  if (days === 1) return "Visit yesterday";
  return `Visit ${days} days ago`;
}

function NoteRow({ r, now, onOpen }: { r: DocRow; now: number; onOpen: () => void }) {
  const s = stage[r.status];
  const late = isTodo(r) && r.overdue;
  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        aria-label={`Open the note for ${r.participant}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.2fr)_auto]"
      >
        <span
          className={cn(
            "flex h-16 w-14 flex-none flex-col items-center justify-center rounded-control border",
            late ? "border-over bg-over-bg" : "border-border bg-surface",
          )}
        >
          <span className={cn("text-label font-semibold", late ? "text-over" : "text-ink-500")}>
            {bne(r.encounterAt, { weekday: "short" })}
          </span>
          <span className="type-display text-h2 leading-none text-ink-900">
            {bne(r.encounterAt, { day: "numeric" })}
          </span>
          <span className="text-label text-ink-500">{bne(r.encounterAt, { month: "short" })}</span>
        </span>

        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.participant} kind="patient" size={40} />
          <div className="min-w-0">
            <p className="truncate text-section font-semibold text-ink-900">{r.participant}</p>
            <p className="truncate text-small text-ink-500">
              {r.noteType}, {r.mode.toLowerCase()}
            </p>
            <p className={cn("text-caption", late ? "font-semibold text-over" : "text-ink-500")}>
              {since(r.encounterAt, now)}
            </p>
          </div>
        </div>

        <div className="col-span-3 flex flex-wrap items-center gap-1.5 md:col-span-1">
          <Tag tone={s.tone}>{s.label}</Tag>
          {r.aiUsed && (
            <span className="inline-flex items-center gap-1 rounded-tag border border-border-strong px-2 py-0.5 text-caption text-ink-700">
              <Diamond className="size-3" aria-hidden="true" />
              AI helped
            </span>
          )}
          {r.warnings > 0 && (
            <span className="inline-flex items-center gap-1 text-caption font-semibold text-over">
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              {r.warnings} to check
            </span>
          )}
        </div>

        <div className="col-start-3 row-start-1 flex items-center gap-2 md:col-start-auto md:row-start-auto">
          <span
            className={cn(
              "hidden h-8 items-center rounded-control px-3 text-small font-semibold sm:inline-flex",
              isTodo(r)
                ? "bg-accent-fill text-on-accent group-hover:bg-accent-fill-hover"
                : "border border-border-strong text-ink-900",
            )}
          >
            {s.action}
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
