"use client";

import {
  ArrowUpRight,
  CalendarCheck2,
  ClipboardList,
  FileText,
  House,
  PlayCircle,
  Search,
  Target,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MetricBand } from "@/components/ui/metric-band";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { inputClass } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { TherapistDetailDto, TherapistSessionDto } from "@/lib/live/types";
import { EmptyNote } from "./bits";

const statusLabel: Record<string, { label: string; tone: TagTone }> = {
  completed: { label: "Completed", tone: "healthy" },
  booked: { label: "Booked", tone: "available" },
  tentative: { label: "Held", tone: "watch" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  "late-cancelled": { label: "Late cancelled", tone: "over" },
  "no-show": { label: "Did not attend", tone: "over" },
  aborted: { label: "Not completed", tone: "watch" },
  rescheduled: { label: "Rescheduled", tone: "neutral" },
};

const noteTone: Record<string, TagTone> = {
  Signed: "healthy",
  Amended: "healthy",
  Draft: "watch",
  "Pending Signature": "watch",
  "Not written": "over",
};

/** A small linked action in a session row. */
function Go({ href, label, icon: Icon }: { href: string; label: string; icon: typeof FileText }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="group/go relative inline-flex size-8 items-center justify-center rounded-control bg-accent-tint text-accent transition-all duration-140 hover:-translate-y-px hover:bg-accent-fill hover:text-on-accent hover:no-underline hover:shadow-lift"
    >
      <Icon className="size-4" aria-hidden="true" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-full z-20 mb-1.5 translate-y-1 rounded-tag bg-ink-900 px-2 py-1 text-label font-semibold whitespace-nowrap text-page opacity-0 shadow-overlay transition-all duration-140 group-hover/go:translate-y-0 group-hover/go:opacity-100"
      >
        {label}
      </span>
    </Link>
  );
}

type Show = "all" | "completed" | "upcoming" | "video" | "recorded";

/** Every session this therapist has had, with the patient, note, recording and rating. */
export function TherapistSessions({ t }: { t: TherapistDetailDto }) {
  const now = useNow() ?? 0;
  const [show, setShow] = useState<Show>("all");
  const [q, setQ] = useState("");
  const all = t.sessionLog;
  const isUpcoming = (s: TherapistSessionDto) =>
    (s.status === "booked" || s.status === "tentative") && new Date(s.start).getTime() >= now;
  const rows = all
    .filter((s) =>
      show === "completed"
        ? s.status === "completed"
        : show === "upcoming"
          ? isUpcoming(s)
          : show === "video"
            ? s.modality === "Telehealth"
            : show === "recorded"
              ? Boolean(s.recording)
              : true,
    )
    .filter((s) => !q.trim() || s.patient.toLowerCase().includes(q.trim().toLowerCase()));
  const completed = all.filter((s) => s.status === "completed");
  const minutes = completed.reduce((n, s) => n + (s.minutes ?? 0), 0);
  const unsigned = completed.filter((s) => s.note !== "Signed" && s.note !== "Amended").length;

  return (
    <div className="flex flex-col gap-4">
      <MetricBand
        size="stat-sm"
        label="Session figures"
        metrics={[
          { label: "Sessions delivered", value: completed.length },
          { label: "Upcoming", value: all.filter(isUpcoming).length },
          { label: "Patients seen", value: t.sessions.patients },
          { label: "Hours with patients", value: Math.round(minutes / 6) / 10 },
          { label: "Recordings", value: all.filter((s) => s.recording).length },
          {
            label: "Notes to finish",
            value: unsigned,
            tone: "over",
            flagged: unsigned > 0,
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { id: "all", label: "All" },
            { id: "completed", label: "Completed" },
            { id: "upcoming", label: "Upcoming" },
            { id: "video", label: "Video" },
            { id: "recorded", label: "Recorded" },
          ]}
        />
        <label className="relative ml-auto w-64 max-w-full">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <input
            aria-label="Find a patient"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a patient"
            className={cn(inputClass, "pl-9")}
          />
        </label>
        <span className="text-caption text-ink-500">
          {rows.length} of {all.length}
        </span>
      </div>
      <TableFrame>
        {rows.length === 0 ? (
          <EmptyNote title="No sessions match.">Try another filter.</EmptyNote>
        ) : (
          <table className="table-stack w-full text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="px-3 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Patient</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Note</th>
                <th className="px-3 py-3 font-medium">Recording</th>
                <th className="px-3 py-3 font-medium">Rating</th>
                <th className="px-3 py-3 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => {
                const st = statusLabel[s.status] ?? { label: s.status, tone: "neutral" as const };
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="block font-semibold text-ink-900">{shortDate(s.start)}</span>
                      <span className="block text-caption text-ink-500">
                        {timeOfDay(s.start)}
                        {s.minutes ? ` · ${s.minutes} min` : ""}
                        {s.ref ? <span className="font-mono"> · {s.ref}</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/care/${s.patientId}`}
                        className="flex items-center gap-2.5 font-semibold text-ink-900"
                      >
                        <Avatar name={s.patient} size={30} />
                        {s.patient}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1.5 text-ink-700">
                        {s.modality === "Telehealth" ? (
                          <Video className="size-4 text-accent" aria-hidden="true" />
                        ) : (
                          <House className="size-4 text-accent" aria-hidden="true" />
                        )}
                        {s.modality === "Telehealth" ? "Video" : "Home visit"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Tag tone={st.tone}>{st.label}</Tag>
                    </td>
                    <td className="px-3 py-3">
                      {s.note ? (
                        <Tag tone={noteTone[s.note] ?? "neutral"}>{s.note}</Tag>
                      ) : (
                        <span className="text-caption text-ink-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {s.recording ? (
                        <Link
                          href={`/telehealth/recordings?visit=${s.id}`}
                          className="inline-flex items-center gap-1.5 rounded-tag bg-available-bg px-2 py-1 text-caption font-semibold text-available hover:no-underline hover:ring-1 hover:ring-available-dot"
                        >
                          <PlayCircle className="size-3.5" aria-hidden="true" />
                          {s.recording.playable ? "Play" : s.recording.status}
                        </Link>
                      ) : (
                        <span className="text-caption text-ink-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-700">
                      {s.rating ? `${s.rating} ★` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex justify-end gap-1">
                        <Go href={`/care/sessions/${s.id}`} label="Session" icon={CalendarCheck2} />
                        <Go
                          href={`/care/records/${s.patientId}`}
                          label="Clinical record"
                          icon={FileText}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableFrame>
    </div>
  );
}

/** Everyone this therapist works with or has seen, with a way into all of their records. */
export function TherapistPatients({ t }: { t: TherapistDetailDto }) {
  const rows = [...t.patients].sort((a, b) => b.sessions - a.sessions);
  if (rows.length === 0) {
    return <EmptyNote title="No patients yet.">Patients appear once they&apos;re assigned.</EmptyNote>;
  }
  return (
    <TableFrame>
      <table className="table-stack w-full text-left text-small">
        <thead className="border-b border-border text-caption text-ink-500">
          <tr>
            <th className="px-3 py-3 font-medium">Patient</th>
            <th className="px-3 py-3 font-medium">Service</th>
            <th className="px-3 py-3 font-medium">Since</th>
            <th className="px-3 py-3 font-medium">Sessions</th>
            <th className="px-3 py-3 font-medium">Last session</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 text-right font-medium">Open</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-3">
                <Link
                  href={`/care/${p.id}`}
                  className="flex items-center gap-2.5 font-semibold text-ink-900"
                >
                  <Avatar name={p.name} size={32} />
                  {p.name}
                </Link>
              </td>
              <td className="px-3 py-3 text-ink-700">{p.discipline}</td>
              <td className="px-3 py-3 whitespace-nowrap text-ink-700">{shortDate(p.since)}</td>
              <td className="px-3 py-3">
                <span className="type-display text-h2 text-ink-900">{p.sessions}</span>
              </td>
              <td className="px-3 py-3 whitespace-nowrap text-ink-700">
                {p.lastSession ? shortDate(p.lastSession) : "—"}
              </td>
              <td className="px-3 py-3">
                <Tag tone={p.discharged ? "neutral" : "healthy"}>
                  {p.discharged ? "Discharged" : "Active"}
                </Tag>
              </td>
              <td className="px-3 py-3">
                <span className="flex justify-end gap-1">
                  <Go href={`/care/${p.id}?tab=visits`} label="Follow-ups" icon={CalendarCheck2} />
                  <Go
                    href={`/care/${p.id}?tab=assessments`}
                    label="Assessments"
                    icon={ClipboardList}
                  />
                  <Go href={`/care/${p.id}?tab=plans`} label="Treatment plans" icon={Target} />
                  <Go href={`/care/records/${p.id}`} label="Clinical record" icon={FileText} />
                  <Go href={`/care/${p.id}`} label="Full record" icon={ArrowUpRight} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
