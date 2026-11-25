"use client";

import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { toCsv, type Row } from "@/lib/live/report-catalogue";
import { dayKey, formatValue, metricById } from "@/lib/live/reports";
import {
  patientRows,
  patientSummary,
  populationHint,
  populationLabel,
  populations,
  relation,
  type PatientRow,
  type Population,
} from "@/lib/live/therapist-reports";
import { Activity, Tile, areaById, type Area, type AreaId } from "./reports-areas";
import { Card, Kpi, KpiGrid, NA, td, th, type Ctx } from "./reports-bits";
import { Charts, useSection } from "./reports-section";

/*
 * The therapist's areas. Sessions, clinical work and time reuse the organisation's area pages,
 * which already read only the facts they are given. What is new is the patient area: caseload and
 * appointments side by side, because a therapist thinks about both. "On my caseload" is who they
 * are responsible for. "Seen in the period" is who they delivered a session to. They differ for
 * cover, for new patients not yet visited, and for patients who have gone quiet.
 */

/* ------------------------------------------------------------------ shared state */

type Therapist = {
  population: Population;
  setPopulation: (p: Population) => void;
  openPatient: (id: string) => void;
  /** Where a patient's record lives, when the viewer may open it. */
  recordHref: (id: string) => string | null;
  subject: string;
};
const TherapistContext = createContext<Therapist | null>(null);
export const TherapistProvider = TherapistContext.Provider;
function useTherapist() {
  const t = useContext(TherapistContext);
  if (!t) throw new Error("Therapist areas need a TherapistProvider.");
  return t;
}

const dayLabel = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
    : "—";

const RELATION_TONE: Record<string, TagTone> = {
  "On caseload": "healthy",
  "On caseload, not seen": "watch",
  "Seen, not on caseload": "outline",
};

const useRows = (c: Ctx) => {
  const { population } = useTherapist();
  return useMemo(
    () =>
      patientRows(
        c.facts,
        { from: c.f.from, to: c.f.to },
        { today: c.hub.today, now: c.hub.now },
        population,
      ),
    [c.facts, c.f.from, c.f.to, c.hub.today, c.hub.now, population],
  );
};

/** A patient needs a look when they have gone quiet or have notes waiting for a signature. */
const needsLook = (r: PatientRow, today: string) =>
  r.notesToSign > 0 ||
  (r.onCaseload &&
    (!r.lastSeen || r.lastSeen < dayKey(new Date(Date.parse(today) - 29 * 86_400_000))));

/* ------------------------------------------------------------------ choosing who to show */

function PopulationPicker() {
  const { population, setPopulation } = useTherapist();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Segmented
        label="Patients shown"
        value={population}
        onChange={setPopulation}
        options={populations.map((p) => ({ id: p, label: populationLabel[p] }))}
      />
      <p className="text-caption text-ink-500">{populationHint[population]}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ the patients area */

function lastSeenBuckets(rows: PatientRow[], today: string) {
  const days = (iso: string | null) =>
    iso ? Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000) : null;
  const count = (test: (d: number | null) => boolean) =>
    rows.filter((r) => test(days(r.lastSeen))).length;
  return [
    { id: "w", label: "Within 7 days", value: count((d) => d !== null && d <= 7) },
    { id: "m", label: "8 to 30 days", value: count((d) => d !== null && d > 7 && d <= 30) },
    { id: "o", label: "Over 30 days", value: count((d) => d !== null && d > 30) },
    { id: "n", label: "Not seen yet", value: count((d) => d === null) },
  ];
}

function PatientsTab({ c }: { c: Ctx }) {
  const s = useSection();
  const t = useTherapist();
  const rows = useRows(c);
  if (s.kind === "table")
    return s.id === "patients-list" ? <PatientTable c={c} rows={rows} /> : null;
  const byDiscipline = new Map<string, number>();
  for (const r of rows)
    for (const d of r.disciplines) byDiscipline.set(d, (byDiscipline.get(d) ?? 0) + 1);
  const check = rows.filter((r) => needsLook(r, c.hub.today)).slice(0, 5);
  return (
    <div className="flex flex-col gap-4">
      <PopulationPicker />
      <KpiGrid>
        <Kpi r={c.run("caseload")} />
        <Kpi r={c.run("patients-seen")} />
        <Kpi r={c.run("caseload-not-seen")} />
        <Kpi r={c.run("seen-off-caseload")} />
        <Kpi r={c.run("quiet-patients")} />
        <Kpi r={c.run("attendance-rate")} />
      </KpiGrid>
      <Charts cols="xl:grid-cols-2">
        <Card
          title="When patients were last seen"
          sub={`${populationLabel[t.population]} · to the end of the period`}
        >
          {rows.length ? (
            <BarList
              label="Last seen"
              data={lastSeenBuckets(rows, c.hub.today).map((b, i) => ({
                ...b,
                colour: [colour.series1, colour.series2, colour.watch, colour.stone][i] as string,
              }))}
              labelWidth={120}
            />
          ) : (
            <NA>No patients in this view.</NA>
          )}
        </Card>
        <Card
          title="Patients by discipline"
          sub={`${populationLabel[t.population]} · a patient with two services counts in both`}
        >
          {byDiscipline.size ? (
            <BarList
              label="Patients by discipline"
              data={[...byDiscipline].map(([k, v], i) => ({
                id: k,
                label: k,
                value: v,
                colour: [colour.series1, colour.series2, colour.series3, colour.series4][
                  i % 4
                ] as string,
              }))}
              labelWidth={150}
            />
          ) : (
            <NA>No patients in this view.</NA>
          )}
        </Card>
      </Charts>
      {s.kind === "summary" && (
        <Card title="Patients to check" sub="Gone quiet, or notes waiting for a signature" flush>
          {check.length ? (
            <ul className="divide-y divide-border">
              {check.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => t.openPatient(r.id)}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-sunken"
                  >
                    <span className="min-w-0 flex-1 text-small font-semibold text-ink-900">
                      {r.name}
                    </span>
                    <span className="text-caption text-ink-500">
                      {r.notesToSign > 0
                        ? `${r.notesToSign} ${r.notesToSign === 1 ? "note" : "notes"} to sign`
                        : `Last seen ${dayLabel(r.lastSeen)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-small text-ink-500">No patient needs a look right now.</p>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the patient list */

function csvOf(rows: PatientRow[], subject: string, c: Ctx) {
  const cols = [
    { key: "name", label: "Patient" },
    { key: "relation", label: "Relationship" },
    { key: "services", label: "Services" },
    { key: "sessions", label: "Sessions delivered" },
    { key: "attendance", label: "Attendance (%)" },
    { key: "lastSeen", label: "Last seen" },
    { key: "nextVisit", label: "Next visit" },
    { key: "notes", label: "Notes to sign" },
  ];
  const data: Row[] = rows.map((r) => ({
    name: r.name,
    relation: relation(r),
    services: r.disciplines.join("; "),
    sessions: r.sessions,
    attendance: r.attendance,
    lastSeen: r.lastSeen,
    nextVisit: r.nextVisit,
    notes: r.notesToSign,
  }));
  return toCsv(cols, data, [
    ["Report", `Patients: ${subject}`],
    ["Period", `${c.f.from} to ${c.f.to}`],
    ["Contents", "Patient list. Contains patient information."],
  ]);
}

function PatientTable({ c, rows }: { c: Ctx; rows: PatientRow[] }) {
  const t = useTherapist();
  const [q, setQ] = useState("");
  const shown = rows.filter(
    (r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([csvOf(shown, t.subject, c)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `patients-${t.subject.toLowerCase().replace(/\s+/g, "-")}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <PopulationPicker />
        <div className="ml-auto flex items-center gap-2">
          <SearchField
            label="Search patients"
            placeholder="Search patients"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {!c.readOnly && (
            <Button size="sm" onClick={download} disabled={!shown.length}>
              <Download className="size-4" aria-hidden="true" />
              Download CSV
            </Button>
          )}
        </div>
      </div>
      <Card
        title={`${shown.length} ${shown.length === 1 ? "patient" : "patients"}`}
        sub="Select a patient to see their summary"
        flush
      >
        {shown.length ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="sticky top-0 bg-sunken">
                <tr>
                  <th className={th}>Patient</th>
                  <th className={th}>Services</th>
                  <th className={cn(th, "text-right")}>Sessions</th>
                  <th className={cn(th, "text-right")}>Attendance</th>
                  <th className={th}>Last seen</th>
                  <th className={th}>Next visit</th>
                  <th className={cn(th, "text-right")}>Notes to sign</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-sunken">
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => t.openPatient(r.id)}
                        className="cursor-pointer text-left font-semibold text-accent hover:underline"
                      >
                        {r.name}
                      </button>
                      <div className="mt-1">
                        <Tag tone={RELATION_TONE[relation(r)] ?? "neutral"}>{relation(r)}</Tag>
                      </div>
                    </td>
                    <td className={td}>{r.disciplines.join(", ") || "—"}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{r.sessions}</td>
                    <td className={cn(td, "text-right tabular-nums")}>
                      {r.attendance === null ? "—" : `${r.attendance.toFixed(0)}%`}
                    </td>
                    <td className={td}>{dayLabel(r.lastSeen)}</td>
                    <td className={td}>{dayLabel(r.nextVisit)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{r.notesToSign || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-small text-ink-700">
            No patients match. Change who is shown, or clear the search.
          </p>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ one patient */

/** One patient at a glance: the summary a therapist wants before a visit or a review. */
export function PatientDialog({ c, id, onClose }: { c: Ctx; id: string; onClose: () => void }) {
  const t = useTherapist();
  const summary = patientSummary(
    c.hub.facts,
    id,
    { from: c.f.from, to: c.f.to },
    { today: c.hub.today, now: c.hub.now },
  );
  const href = t.recordHref(id);
  if (!summary) {
    return (
      <Dialog title="Patient" size="sm" above onRequestClose={onClose}>
        <NA>This patient isn&apos;t in the reports you can see.</NA>
      </Dialog>
    );
  }
  const r = summary.row;
  const stat = (label: string, value: string) => (
    <div className="rounded-card bg-sunken p-3">
      <p className="text-caption text-ink-500">{label}</p>
      <p className="mt-1 type-display text-h2 text-ink-900">{value}</p>
    </div>
  );
  return (
    <Dialog
      title={r.name}
      description={r.disciplines.join(" · ") || undefined}
      above
      onRequestClose={onClose}
      meta={<Tag tone={RELATION_TONE[relation(r)] ?? "neutral"}>{relation(r)}</Tag>}
      actions={
        <>
          <Button
            size="sm"
            onClick={() => {
              c.setF({ patient: id });
              onClose();
            }}
          >
            Show only this patient
          </Button>
          {href && (
            <Link
              href={href}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong px-3 text-small font-semibold text-ink-900 hover:bg-sunken"
            >
              <FileText className="size-4" aria-hidden="true" />
              Open record
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {stat("Sessions in the period", String(r.sessions))}
          {stat("Attendance", r.attendance === null ? "N/A" : `${r.attendance.toFixed(0)}%`)}
          {stat("Last seen", dayLabel(r.lastSeen))}
          {stat("Next visit", dayLabel(r.nextVisit))}
          {stat("Notes to sign", String(r.notesToSign))}
        </div>
        <Card title="Recent sessions" flush>
          {summary.recent.length ? (
            <ul className="divide-y divide-border">
              {summary.recent.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-small">
                  <span className="w-24 flex-none text-ink-900">{dayLabel(a.start)}</span>
                  <span className="min-w-0 flex-1 text-ink-700">
                    {a.discipline} · {a.mode}
                  </span>
                  <span className="text-ink-500">{a.status.replace("-", " ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-small text-ink-500">No sessions yet.</p>
          )}
        </Card>
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Services" flush>
            {summary.services.length ? (
              <ul className="divide-y divide-border">
                {summary.services.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 px-4 py-2.5 text-small">
                    <span className="text-ink-900">{s.support}</span>
                    <span className="text-ink-500">{s.status.replace("-", " ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-small text-ink-500">No services on your caseload.</p>
            )}
          </Card>
          <Card title="Goals and reviews" flush>
            {summary.reviews.length ? (
              <ul className="divide-y divide-border">
                {summary.reviews.map((g) => (
                  <li key={g.id} className="flex justify-between gap-3 px-4 py-2.5 text-small">
                    <span className="text-ink-900">
                      {g.goals} {g.goals === 1 ? "goal" : "goals"}
                    </span>
                    <span className="text-ink-500">Review due {dayLabel(g.reviewDue)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-small text-ink-500">No goal reviews yet.</p>
            )}
          </Card>
        </div>
        {summary.assessments.length > 0 && (
          <Card title="Assessments" flush>
            <ul className="divide-y divide-border">
              {summary.assessments.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 px-4 py-2.5 text-small">
                  <span className="text-ink-900">{a.kind}</span>
                  <span className="text-ink-500">
                    {a.status} · due {dayLabel(a.dueAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ the areas */

function pick(id: AreaId, over: Partial<Area>): Area {
  const base = areaById(id);
  if (!base) throw new Error(`Unknown area ${id}`);
  return { ...base, ...over };
}

/** The therapist's tabs after Overview, in the order a working day goes. */
export const THERAPIST_AREAS: Area[] = [
  {
    id: "patients",
    label: "My patients",
    title: "Patients and caseload",
    domains: ["Participants"],
    tables: [],
    custom: [{ id: "patients-list", label: "Patient list" }],
    headline: ["caseload", "patients-seen"],
    Tab: PatientsTab,
  },
  pick("visits", {
    label: "Sessions",
    title: "Sessions and attendance",
    headline: ["delivered", "attendance-rate"],
  }),
  pick("clinical", {
    label: "Clinical work",
    title: "Notes, goals and assessments",
    headline: ["overdue-notes", "assessment-backlog"],
  }),
  pick("capacity", {
    label: "Time and travel",
    title: "Time and capacity",
    headline: ["utilisation", "delivered-hours"],
  }),
];

export const therapistAreaById = (id: string) => THERAPIST_AREAS.find((a) => a.id === id);

/* ------------------------------------------------------------------ overview */

const TILES: { area: AreaId; label: string; headline: [string, string] }[] = [
  { area: "patients", label: "My patients", headline: ["caseload", "caseload-not-seen"] },
  { area: "patients", label: "My patients", headline: ["patients-seen", "seen-off-caseload"] },
  { area: "visits", label: "Sessions", headline: ["delivered", "cancellation-rate"] },
  { area: "visits", label: "Sessions", headline: ["attendance-rate", "no-show-rate"] },
  { area: "clinical", label: "Clinical work", headline: ["overdue-notes", "assessment-backlog"] },
  { area: "capacity", label: "Time and travel", headline: ["utilisation", "delivered-hours"] },
];

/** The therapist's first page: how things stand, what to do first, and who to look at. */
export function TherapistOverview({ c, openArea }: { c: Ctx; openArea: (id: AreaId) => void }) {
  const t = useTherapist();
  const rows = useRows(c);
  const inScope = (id: string) => {
    const d = metricById.get(id)?.domain;
    return d ? c.hub.scope.domains.includes(d) : false;
  };
  const tiles = TILES.filter((x) => inScope(x.headline[0]) && inScope(x.headline[1]));
  const todo = [
    {
      n: c.run("overdue-notes").value ?? 0,
      text: "clinical notes are overdue",
      area: "clinical" as const,
    },
    {
      n: c.run("quiet-patients").value ?? 0,
      text: "patients on the caseload not seen in 30 days",
      area: "patients" as const,
    },
    {
      n: c.run("caseload-not-seen").value ?? 0,
      text: "patients on the caseload not seen in this period",
      area: "patients" as const,
    },
    { n: c.run("reports-due").value ?? 0, text: "reports are due", area: "clinical" as const },
    {
      n: c.run("assessment-backlog").value ?? 0,
      text: "assessments are open",
      area: "clinical" as const,
    },
  ].filter((x) => x.n > 0 && inScope(x.area === "patients" ? "caseload" : "overdue-notes"));
  const check = rows.filter((r) => needsLook(r, c.hub.today)).slice(0, 6);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((x) => (
          <Tile key={x.headline[0]} c={c} area={x} onOpen={() => openArea(x.area)} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Activity c={c} />
        <section className="min-w-0 rounded-card border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-section font-semibold text-ink-900">To do first</h2>
            <span className="text-caption text-ink-500 tabular-nums">{todo.length}</span>
          </header>
          {todo.length ? (
            <ul className="divide-y divide-border">
              {todo.map((x) => (
                <li key={x.text}>
                  <button
                    type="button"
                    onClick={() => openArea(x.area)}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-sunken"
                  >
                    <span className="type-display text-h2 text-ink-900">
                      {formatValue(x.n, "people")}
                    </span>
                    <span className="min-w-0 flex-1 text-small text-ink-700">{x.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-small text-ink-500">
              Nothing is waiting. You&apos;re up to date.
            </p>
          )}
        </section>
      </div>
      <section className="min-w-0 rounded-card border border-border bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-section font-semibold text-ink-900">Patients to check</h2>
          <Button size="sm" variant="ghost" onClick={() => openArea("patients")}>
            See all patients
          </Button>
        </header>
        {check.length ? (
          <ul className="divide-y divide-border">
            {check.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => t.openPatient(r.id)}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-sunken"
                >
                  <span className="min-w-0 flex-1 text-small font-semibold text-ink-900">
                    {r.name}
                  </span>
                  <Tag tone={RELATION_TONE[relation(r)] ?? "neutral"}>{relation(r)}</Tag>
                  <span className="w-40 text-caption text-ink-500">
                    {r.notesToSign > 0
                      ? `${r.notesToSign} ${r.notesToSign === 1 ? "note" : "notes"} to sign`
                      : `Last seen ${dayLabel(r.lastSeen)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-small text-ink-500">No patient needs a look right now.</p>
        )}
      </section>
    </div>
  );
}
