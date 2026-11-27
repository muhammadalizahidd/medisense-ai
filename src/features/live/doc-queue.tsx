"use client";

import { Paged } from "@/components/ui/table-pager";
import { ModeTag } from "./session-list";
import { FilePlus2, Lock, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import {
  captureMethods,
  docStatuses,
  noteTypes,
  statusTone,
  type DocOption,
  type DocRow,
} from "@/lib/live/docs";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { td, th } from "./funding-bits";
import { KpiBand, ops, tableBox, tableHead, when } from "./ops-bits";

const DAY = 86_400_000;
type Range = "all" | "today" | "7" | "30";

/** Module 15 screen 3.1: My Documentation Queue. */
export function DocQueue({
  base,
  embedded = false,
}: {
  base: "/therapist/documentation" | "/care/documentation";
  /** Inside Sessions and notes, which brings its own title. */
  embedded?: boolean;
}) {
  const { data, error, loading, reload } = useResource<{ rows: DocRow[]; options: DocOption[] }>(
    "/api/care/documentation",
    (e) => e.type === "care",
  );
  const clock = useNow();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [q, setQ] = useState("");
  const [wizard, setWizard] = useState(false);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data || clock === null) return <Skeleton className="h-[760px]" />;
  const now = clock;
  const all = data.rows;
  const disciplines = [...new Set(all.map((r) => r.discipline))].sort();
  const query = q.trim().toLowerCase();
  const rows = all
    .filter((r) => !status || (status === "Overdue" ? r.overdue : r.status === status))
    .filter((r) => (!type || r.noteType === type) && (!discipline || r.discipline === discipline))
    .filter((r) => (!priority || r.priority === priority) && (!source || r.capture === source))
    .filter((r) => {
      const age = now - new Date(r.encounterAt).getTime();
      return range === "all" || (range === "today" ? age < DAY : age < Number(range) * DAY);
    })
    .filter(
      (r) =>
        !query ||
        `${r.ref} ${r.participant} ${r.participantId} ${r.noteType}`.toLowerCase().includes(query),
    );
  const open = all.filter((r) => !["Signed", "Addendum"].includes(r.status));
  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="Live care"
          title={base === "/therapist/documentation" ? "My documentation" : "Documentation"}
          description="Capture, draft with AI, verify and sign every clinical note"
          actions={
            <div className="flex items-center gap-2">
              {base === "/therapist/documentation" && (
                <Button variant="primary" onClick={() => setWizard(true)}>
                  <FilePlus2 className="size-4" aria-hidden="true" /> New note
                </Button>
              )}
              <LiveBadge />
            </div>
          }
        />
      )}
      <KpiBand
        label="Documentation figures"
        items={[
          {
            label: "Open notes",
            value: open.length,
            sub: "not yet signed",
            onClick: () => setStatus(""),
          },
          {
            label: "Overdue",
            value: all.filter((r) => r.overdue).length,
            sub: "unsigned after 48 hours",
            tone: all.some((r) => r.overdue) ? "over" : undefined,
            onClick: () => setStatus("Overdue"),
          },
          {
            label: "AI drafts",
            value: all.filter((r) => r.status === "AI Draft").length,
            sub: "waiting for your review",
            tone: "watch",
            onClick: () => setStatus("AI Draft"),
          },
          {
            label: "Warnings",
            value: all.reduce((n, r) => n + r.warnings, 0),
            sub: "conflicts and unsupported claims",
            tone: all.some((r) => r.warnings) ? "over" : undefined,
          },
          {
            label: "Awaiting co-sign",
            value: all.filter((r) => r.status === "Awaiting Co-sign").length,
            sub: "with the supervisor",
            onClick: () => setStatus("Awaiting Co-sign"),
          },
          {
            label: "Signed",
            value: all.filter((r) => ["Signed", "Addendum"].includes(r.status)).length,
            sub: `${all.filter((r) => r.aiUsed).length} used AI, all verified`,
            onClick: () => setStatus("Signed"),
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <Segmented<Range>
          label="Date range"
          value={range}
          onChange={setRange}
          options={[
            { id: "all", label: "All" },
            { id: "today", label: "Today" },
            { id: "7", label: "7 days" },
            { id: "30", label: "30 days" },
          ]}
        />
        <div className="w-44">
          <Select
            aria-label="Status"
            className="h-9"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {[...docStatuses, "Overdue"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            aria-label="Document type"
            className="h-9"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Any document type</option>
            {noteTypes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        {disciplines.length > 1 && (
          <div className="w-48">
            <Select
              aria-label="Discipline"
              className="h-9"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
            >
              <option value="">Any discipline</option>
              {disciplines.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-44">
          <Select
            aria-label="Capture method"
            className="h-9"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Any capture method</option>
            {captureMethods.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            aria-label="Priority"
            className="h-9"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Any priority</option>
            {["Routine", "Due Soon", "Overdue", "Escalated"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search notes"
            placeholder="Patient, MRN, DOC reference or note title"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQ("")}
              className="cursor-pointer text-ink-500"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
      </div>
      <Paged
        key={`${status}|${type}|${discipline}|${priority}|${source}|${range}|${query}`}
        rows={rows}
        noun="notes"
      >
        {(page) => (
          <div className={tableBox}>
            <table className="w-full text-left text-small">
              <thead className={tableHead}>
                <tr>
                  <th className={th}>Note</th>
                  <th className={th}>Patient</th>
                  <th className={th}>Encounter</th>
                  <th className={th}>Capture</th>
                  <th className={th}>Checks</th>
                  <th className={th}>Priority</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {page.map((r) => (
                  <tr key={r.id} className="hover:bg-canvas">
                    <td className={td}>
                      <a
                        href={`${base}/${r.id}`}
                        className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                      >
                        {r.noteType}
                      </a>
                      <span className="flex items-center gap-1.5 font-mono text-caption text-ink-500">
                        {r.restricted && <Lock className="size-3" aria-label="Protected note" />}
                        {r.ref}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="block text-ink-900">{r.participant}</span>
                      <span className="font-mono text-caption text-ink-500">{r.participantId}</span>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span className="block text-ink-900">{when(r.encounterAt)}</span>
                      <span className="text-caption text-ink-500">
                        {r.discipline}
                        {base === "/care/documentation" ? ` · ${r.clinician}` : ""}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="flex flex-col items-start gap-1">
                        <ModeTag mode={r.mode} />
                        <Tag tone="outline">{r.capture}</Tag>
                        {r.aiUsed && (
                          <span className="text-caption text-ink-500">AI draft used</span>
                        )}
                      </span>
                    </td>
                    <td className={td}>
                      {r.warnings ? (
                        <Tag tone="over">{r.warnings} to resolve</Tag>
                      ) : r.supervised ? (
                        <Tag tone="outline">Supervised</Tag>
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <Tag
                        tone={
                          r.priority === "Overdue" || r.priority === "Escalated"
                            ? "over"
                            : r.priority === "Routine"
                              ? "neutral"
                              : "watch"
                        }
                      >
                        {r.priority}
                      </Tag>
                    </td>
                    <td className={td}>
                      <Tag tone={statusTone[r.status]}>{r.status}</Tag>
                    </td>
                  </tr>
                ))}
                {!page.length && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-small text-ink-500">
                      No notes match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Paged>
      {wizard && (
        <NewNote
          options={data.options}
          onClose={() => setWizard(false)}
          onCreated={(id) => router.push(`${base}/${id}`)}
        />
      )}
    </>
  );
}

/** Screen 3.2: New Note Wizard. Choosing the visit pre-fills the participant, mode and date. */
export function NewNote({
  options,
  onClose,
  onCreated,
}: {
  options: DocOption[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [episode, setEpisode] = useState(
    options[0] ? `${options[0].clientId}:${options[0].needId}` : "",
  );
  const opt = options.find((o) => `${o.clientId}:${o.needId}` === episode);
  const [appointmentId, setAppointmentId] = useState(opt?.appointments[0]?.id ?? "");
  const [unlinkedReason, setUnlinkedReason] = useState("");
  const [noteType, setNoteType] = useState<string>("SOAP");
  const [capture, setCapture] = useState<string>("Typed");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const appt = opt?.appointments.find((a) => a.id === appointmentId);
  return (
    <Sheet
      title="New note"
      description="Choose the patient and visit; everything else is filled in for you"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          loading={busy}
          disabled={!opt || !confirm}
          onClick={async () => {
            if (!opt) return;
            setBusy(true);
            const res = await ops<{ id: string }>(
              "/api/care/documentation",
              {
                clientId: opt.clientId,
                needId: opt.needId,
                appointmentId,
                unlinkedReason,
                noteType,
                capture,
                confirmIdentity: true,
              },
              "Note started",
            );
            setBusy(false);
            if (res?.id) onCreated(res.id);
          }}
        >
          Start note
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Patient and service">
          <Select
            aria-label="Patient and service"
            value={episode}
            onChange={(e) => {
              setEpisode(e.target.value);
              const o = options.find((x) => `${x.clientId}:${x.needId}` === e.target.value);
              setAppointmentId(o?.appointments[0]?.id ?? "");
            }}
          >
            {options.map((o) => (
              <option key={`${o.clientId}:${o.needId}`} value={`${o.clientId}:${o.needId}`}>
                {o.participant} · {o.discipline}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Visit">
          <Select
            aria-label="Visit"
            value={appointmentId}
            onChange={(e) => setAppointmentId(e.target.value)}
          >
            {(opt?.appointments ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {when(a.when)} · {a.mode} · {a.ref}
              </option>
            ))}
            <option value="">Not linked to a visit</option>
          </Select>
        </Field>
        {!appointmentId && (
          <Field label="Why isn't it linked to a visit?">
            <input
              className={inputClass}
              value={unlinkedReason}
              onChange={(e) => setUnlinkedReason(e.target.value)}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Note type">
            <Select
              aria-label="Note type"
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
            >
              {noteTypes.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
          <Field label="Capture method">
            <Select
              aria-label="Capture method"
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
            >
              {captureMethods.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
        </div>
        {opt && (
          <div className="rounded-card border border-border bg-sunken p-4 text-small">
            <p className="font-semibold text-ink-900">{opt.participant}</p>
            <p className="font-mono text-caption text-ink-500">{opt.participantId}</p>
            <p className="mt-1 text-ink-700">
              {opt.discipline}
              {appt ? ` · ${appt.mode} · ${when(appt.when)}` : " · no visit linked"}
            </p>
          </div>
        )}
        <label className="flex items-start gap-2 text-small">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>This is the right patient and encounter.</span>
        </label>
      </div>
    </Sheet>
  );
}
