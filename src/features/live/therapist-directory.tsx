"use client";

import { ArrowLeft, CalendarOff, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { SelectField } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { api, useResource } from "@/lib/live/client";
import { disciplines } from "@/lib/live/catalogue";
import { shortDate } from "@/lib/live/time";
import type { TherapistCardDto, TherapistDetailDto } from "@/lib/live/types";
import { CaseloadTag, EmptyNote, ErrorNote, LiveBadge, Skeleton, Stars } from "./bits";
import { AddTherapist, TherapistActiveToggle } from "./add-therapist";
import { TherapistRecord } from "./therapist-record";

const day = (iso: string) => shortDate(`${iso}T00:00:00+10:00`);

/** Every therapist with their availability, caseload and rating, kept live. */
export function TherapistDirectory() {
  const { data, error, loading, reload } = useResource<{ therapists: TherapistCardDto[] }>(
    "/api/care/therapists",
    (e) => e.type === "care",
  );
  const [discipline, setDiscipline] = useState("all");
  const [query, setQuery] = useState("");
  const rows = (data?.therapists ?? [])
    .filter((t) => discipline === "all" || t.discipline === discipline)
    .filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow="Patient onboarding"
        title="Therapists"
        description="Working days, hours and time off as each therapist set them, with caseload and patient ratings."
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <AddTherapist onAdded={reload} />
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SelectField label="Discipline" value={discipline} onChange={setDiscipline}>
          <option value="all">All disciplines</option>
          {disciplines.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </SelectField>
        <label className="flex h-9 w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search therapists"
            placeholder="Search by name"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
      </div>
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyNote title="No therapists match." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="table-stack w-full text-left text-small md:min-w-220">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Therapist</th>
                <th className="px-4 py-3 font-medium">Works</th>
                <th className="px-4 py-3 font-medium">Time off</th>
                <th className="px-4 py-3 font-medium">Caseload</th>
                <th className="px-4 py-3 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link href={`/care/therapists/${t.id}`} className="font-semibold text-ink-900">
                      {t.name}
                    </Link>
                    <span className="block text-caption text-ink-500">
                      {t.discipline} · {t.region}
                    </span>
                    {!t.active && (
                      <span className="mt-1 inline-block rounded-tag bg-canvas px-1.5 py-0.5 text-label font-semibold text-ink-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{t.availability.pattern}</td>
                  <td className="px-4 py-3">
                    {t.availability.away.length === 0 ? (
                      <span className="text-ink-500">None booked</span>
                    ) : (
                      t.availability.away.map((a) => (
                        <span
                          key={`${a.from}-${a.to}`}
                          className="flex items-center gap-1.5 text-caption"
                        >
                          <CalendarOff className="size-3.5 text-monitor" aria-hidden="true" />
                          {day(a.from)}
                          {a.to !== a.from && `–${day(a.to)}`} · {a.reason}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      {t.activeClients}/{t.capacity}
                      <CaseloadTag status={t.status} />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.rating ? (
                      <span className="flex items-center gap-1.5">
                        <Stars value={t.rating.average} />
                        <span className="text-caption text-ink-500">
                          {t.rating.average.toFixed(1)} ({t.rating.count})
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-500">No ratings yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function TherapistProfilePage({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource<{ therapist: TherapistDetailDto }>(
    `/api/care/therapists/${id}`,
    (e) => e.type === "care",
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const t = data.therapist;
  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care/therapists" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Therapists
          </ButtonLink>
        }
        title={t.name}
        description={`${t.discipline} · ${t.region} · ${t.availability.pattern}`}
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <ResetPassword therapistId={t.id} name={t.name} />
            <TherapistActiveToggle id={t.id} name={t.name} active={t.active} onChanged={reload} />
          </div>
        }
      />
      <TherapistRecord t={t} patientLinks />
    </>
  );
}

/** Sets a one-off password the admin passes on in person or by phone. Shown once. */
function ResetPassword({ therapistId, name }: { therapistId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [temporary, setTemporary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = name.split(" ")[0];

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ temporaryPassword: string }>(
        `/api/care/therapists/${therapistId}/reset-password`,
        { method: "POST" },
      );
      setTemporary(result.temporaryPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setOpen(false);
    setTemporary(null);
    setError(null);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Reset password
      </Button>
      {open && (
        <Sheet
          title={`Reset ${first}'s password`}
          description="For when a therapist can't sign in."
          onClose={close}
          footer={
            temporary ? (
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="primary" disabled={busy} onClick={reset}>
                  {busy ? "Resetting…" : "Reset password"}
                </Button>
                <Button onClick={close}>Cancel</Button>
              </>
            )
          }
        >
          {temporary ? (
            <div className="flex flex-col gap-3">
              <p className="text-small text-ink-700">
                Give {first} this temporary password in person or by phone. It&apos;s shown only
                once. Ask them to change it in My profile after signing in.
              </p>
              <p className="rounded-control border border-border bg-canvas px-4 py-3 font-mono text-h2 tracking-wider break-all">
                {temporary}
              </p>
            </div>
          ) : (
            <ul className="list-disc pl-5 text-small text-ink-700">
              <li>{first}&apos;s current password stops working straight away.</li>
              <li>They&apos;re signed out on every device.</li>
              <li>You&apos;ll see a temporary password once, to pass on to them.</li>
            </ul>
          )}
          {error && (
            <p role="alert" className="mt-3 text-small text-over">
              {error}
            </p>
          )}
        </Sheet>
      )}
    </>
  );
}
