"use client";

import {
  CalendarCheck2,
  House,
  Phone,
  Search,
  UserRound,
  UserRoundPlus,
  Video,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { disciplineShort, type Discipline } from "@/lib/live/catalogue";
import { api, useResource } from "@/lib/live/client";
import type {
  QuickBookOptionsDto,
  QuickBookResult,
  QuickClinicianDto,
  QuickPatientDto,
} from "@/lib/live/quick-book";
import { slotLabel } from "@/lib/live/time";

const ENDPOINT = "/api/care/schedule/quick";

export type BookFor = "existing" | "new";

function Label({ n, children }: { n: number; children: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-caption font-semibold text-ink-700">
      <span className="flex size-5 items-center justify-center rounded-full bg-accent-tint text-label font-bold text-accent">
        {n}
      </span>
      {children}
    </p>
  );
}

/** Existing patient or someone new: the two ways in to booking a visit. */
export function BookForTabs({
  value,
  onChange,
}: {
  value: BookFor;
  onChange: (v: BookFor) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Who the visit is for"
      className="grid grid-cols-2 gap-1 rounded-card border border-border bg-sunken p-1"
    >
      {(
        [
          ["existing", "Existing patient", UserRound],
          ["new", "New to Medisense", UserRoundPlus],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-small font-semibold transition-colors duration-140",
            value === id
              ? "bg-surface text-ink-900 ring-1 ring-border"
              : "text-ink-500 hover:text-ink-900",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** The two booking forms behind one switch, for drawers, the assistant and the admin app. */
export function BookVisitPanel({
  initial = "existing",
  patient,
  onDone,
}: {
  initial?: BookFor;
  /** Opened from a patient's row or record: book for them straight away. */
  patient?: QuickPatientDto;
  onDone?: (r: QuickBookResult) => void;
}) {
  const [mode, setMode] = useState<BookFor>(initial);
  if (patient) return <QuickBookForm mode="existing" patient={patient} onDone={onDone} />;
  return (
    <div className="flex flex-col gap-4">
      <BookForTabs value={mode} onChange={setMode} />
      <QuickBookForm key={mode} mode={mode} onDone={onDone} />
    </div>
  );
}

/**
 * Books a visit. For an existing patient: pick them, then one of their own clinicians. For someone
 * new: a name and phone, then any clinician; a provisional record is opened for intake to complete.
 * Choosing a clinician shows their real free times straight underneath.
 */
export function QuickBookForm({
  mode = "new",
  patient: given,
  onDone,
}: {
  mode?: BookFor;
  patient?: QuickPatientDto;
  onDone?: (r: QuickBookResult) => void;
}) {
  const [patient, setPatient] = useState<QuickPatientDto | null>(given ?? null);
  const base = useResource<QuickBookOptionsDto>(ENDPOINT);
  const forPatient = useResource<QuickBookOptionsDto>(
    mode === "existing" && patient ? `${ENDPOINT}?clientId=${patient.id}` : null,
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [find, setFind] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [search, setSearch] = useState("");
  const [therapistId, setTherapistId] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [telehealth, setTelehealth] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<QuickBookResult | null>(null);

  const existing = mode === "existing";
  const options = existing ? forPatient.data : base.data;
  const all = options?.clinicians ?? [];
  const disciplines = [...new Set(all.map((c) => c.discipline))].sort();
  const shown = all
    .filter((c) => existing || c.slots.length > 0)
    .filter((c) => !discipline || c.discipline === discipline)
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, existing ? 10 : 6);
  const chosen = all.find((c) => c.id === therapistId) ?? null;
  const who = existing
    ? Boolean(patient)
    : name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 8;
  const ready = who && chosen && start;
  const matches = (base.data?.patients ?? [])
    .filter((p) => {
      const q = find.trim().toLowerCase();
      return !q || p.name.toLowerCase().includes(q) || (p.mrn ?? "").toLowerCase().includes(q);
    })
    .slice(0, 6);

  function reset() {
    setDone(null);
    setName("");
    setPhone("");
    setPatient(null);
    setFind("");
    setTherapistId(null);
    setStart(null);
    setNote("");
    base.reload();
  }

  async function book() {
    if (!ready || !chosen || !start) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<QuickBookResult>(ENDPOINT, {
        body: {
          ...(existing && patient
            ? { clientId: patient.id }
            : { name: name.trim(), phone: phone.trim() }),
          therapistId: chosen.id,
          start,
          telehealth,
          note,
        },
      });
      setDone(r);
      toast("Visit booked", { tone: "success", detail: r.summary });
      onDone?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't book. Try another time.");
      (existing ? forPatient : base).reload();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-5 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-healthy-bg text-healthy">
          <CalendarCheck2 className="size-6" aria-hidden="true" />
        </span>
        <p className="text-section font-semibold text-ink-900">Visit booked</p>
        <p className="text-small text-ink-700">{done.summary}</p>
        {!existing && (
          <>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Tag tone="watch">Details to complete</Tag>
              <span className="rounded-tag border border-border-strong px-2 py-0.5 font-mono text-caption text-ink-700">
                {done.mrn}
              </span>
            </div>
            <p className="text-caption text-ink-500">
              A provisional record was opened. The clinician was told, and intake completes the rest
              before the visit.
            </p>
          </>
        )}
        {existing && (
          <p className="text-caption text-ink-500">
            The clinician and the patient were told, and it shows on the schedule now.
          </p>
        )}
        <Button size="sm" onClick={reset}>
          Book another visit
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-quick-book>
      <section>
        <Label n={1}>{existing ? "Patient" : "Who is it for"}</Label>
        {existing ? (
          patient ? (
            <div className="flex items-center gap-3 rounded-control border border-accent-fill bg-accent-tint px-3 py-2">
              <Avatar name={patient.name} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold text-ink-900">
                  {patient.name}
                </span>
                <span className="block truncate text-caption text-ink-500">
                  {[patient.mrn, patient.suburb].filter(Boolean).join(" · ")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPatient(null);
                  setTherapistId(null);
                  setStart(null);
                }}
                className="cursor-pointer text-caption font-semibold text-accent"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <label className="relative block">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
                  aria-hidden="true"
                />
                <input
                  aria-label="Find a patient"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Name or MRN"
                  className={cn(inputClass, "pl-9")}
                />
              </label>
              {!base.data ? (
                <div className="mt-2 h-32 animate-pulse rounded-card bg-sunken" />
              ) : (
                <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label="Patient">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={false}
                      aria-label={p.name}
                      onClick={() => {
                        setPatient(p);
                        setTherapistId(null);
                        setStart(null);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-control border border-border bg-surface px-3 py-2 text-left hover:border-accent-fill"
                    >
                      <Avatar name={p.name} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-ink-900">
                          {p.name}
                        </span>
                        <span className="block truncate text-caption text-ink-500">
                          {[p.mrn, p.suburb].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  ))}
                  {matches.length === 0 && (
                    <p className="rounded-control border border-dashed border-border p-3 text-small text-ink-500">
                      No patient with a clinician matches. New to Medisense? Use the other tab.
                    </p>
                  )}
                </div>
              )}
            </>
          )
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="relative block">
                <span className="sr-only">Full name</span>
                <UserRoundPlus
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
                  aria-hidden="true"
                />
                <input
                  aria-label="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className={cn(inputClass, "pl-9")}
                />
              </label>
              <label className="relative block">
                <span className="sr-only">Phone</span>
                <Phone
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
                  aria-hidden="true"
                />
                <input
                  aria-label="Phone"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="04xx xxx xxx"
                  className={cn(inputClass, "pl-9")}
                />
              </label>
            </div>
            <p className="mt-1.5 text-caption text-ink-500">
              Not in Medisense yet? A name and phone are enough to book. Intake completes the rest.
            </p>
          </>
        )}
      </section>

      {(!existing || patient) && (
        <section>
          <Label n={2}>{existing ? "Their clinician and time" : "Clinician and time"}</Label>
          {!existing && (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Discipline">
                {["", ...disciplines].map((d) => (
                  <button
                    key={d || "all"}
                    type="button"
                    aria-pressed={discipline === d}
                    onClick={() => setDiscipline(d as Discipline | "")}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1 text-caption font-semibold transition-colors duration-140",
                      discipline === d
                        ? "border-accent-fill bg-accent-fill text-on-accent"
                        : "border-border-strong bg-surface text-ink-700 hover:text-accent",
                    )}
                  >
                    {d ? disciplineShort[d as Discipline] : "All"}
                  </button>
                ))}
              </div>
              <label className="relative mb-2 block">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
                  aria-hidden="true"
                />
                <input
                  aria-label="Find a clinician"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a clinician"
                  className={cn(inputClass, "pl-9")}
                />
              </label>
            </>
          )}
          {!options ? (
            <div className="h-40 animate-pulse rounded-card bg-sunken" />
          ) : (
            <div className="grid gap-1.5" role="radiogroup" aria-label="Clinician">
              {shown.map((c) => (
                <div key={c.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={therapistId === c.id}
                    aria-label={c.name}
                    onClick={() => {
                      setTherapistId(therapistId === c.id ? null : c.id);
                      setStart(null);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors duration-140",
                      therapistId === c.id
                        ? "rounded-b-none border-accent-fill bg-accent-tint"
                        : "border-border bg-surface hover:border-accent-fill",
                    )}
                  >
                    <Avatar name={c.name} kind="staff" size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink-900">
                        {c.name}
                      </span>
                      <span className="block truncate text-caption text-ink-500">
                        {c.discipline} · {c.region}
                      </span>
                    </span>
                    <span className="text-caption font-semibold text-accent">
                      {c.slots[0] ? `Next ${slotLabel(c.slots[0]).split(",")[0]}` : "No free times"}
                    </span>
                  </button>
                  {therapistId === c.id && (
                    <SlotPicker
                      c={c}
                      start={start}
                      onStart={setStart}
                      telehealth={telehealth}
                      onTelehealth={setTelehealth}
                    />
                  )}
                </div>
              ))}
              {shown.length === 0 && (
                <p className="rounded-control border border-dashed border-border p-3 text-small text-ink-500">
                  {existing
                    ? "This patient has no clinician yet. Assign one first through referrals or the booking agent."
                    : "No clinician matches. Clear the search."}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {chosen && start && (
        <section>
          <Label n={3}>Reason (optional)</Label>
          <input
            aria-label="Reason"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              existing
                ? "e.g. Follow-up after the new equipment arrives"
                : "e.g. Called about a fall at home; daughter will be there"
            }
            className={inputClass}
          />
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
          {error}
        </p>
      )}
      <div>
        <Button variant="primary" className="w-full" disabled={!ready || busy} onClick={book}>
          <CalendarCheck2 className="size-4" aria-hidden="true" />
          {busy ? "Booking…" : "Book visit"}
        </Button>
        {!ready && (
          <p className="mt-1.5 text-center text-caption text-ink-500">
            {existing
              ? "Choose the patient, their clinician and a time to book."
              : "Add a name, phone, clinician and time to book."}
          </p>
        )}
      </div>
    </div>
  );
}

/** The chosen clinician's real free times, straight under their name. */
function SlotPicker({
  c,
  start,
  onStart,
  telehealth,
  onTelehealth,
}: {
  c: QuickClinicianDto;
  start: string | null;
  onStart: (s: string) => void;
  telehealth: boolean;
  onTelehealth: (t: boolean) => void;
}) {
  return (
    <div className="rounded-b-control border border-t-0 border-accent-fill bg-surface p-3">
      <div className="mb-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Visit type">
        {(
          [
            [false, "Home visit", House],
            [true, "Video visit", Video],
          ] as const
        ).map(([tele, label, Icon]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={telehealth === tele}
            onClick={() => onTelehealth(tele)}
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-control border py-1.5 text-small font-semibold",
              telehealth === tele
                ? "border-accent-fill bg-accent-tint text-accent"
                : "border-border bg-surface text-ink-700",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {c.slots.length === 0 ? (
        <p className="text-small text-ink-500">
          No free times in the next two weeks. Try another clinician.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Free times">
          {c.slots.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={start === s}
              onClick={() => onStart(s)}
              className={cn(
                "cursor-pointer rounded-control border px-2 py-2 text-caption font-semibold",
                start === s
                  ? "border-accent-fill bg-accent-fill text-on-accent"
                  : "border-border bg-surface text-ink-900 hover:border-accent-fill",
              )}
            >
              {slotLabel(s)}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-caption text-ink-500">
        Real free times for {c.name.split(" ")[0]}, checked against their visits and leave.
      </p>
    </div>
  );
}
