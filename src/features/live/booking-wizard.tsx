"use client";

import { Check, CircleAlert, Lock, Sparkle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { serviceLocations, supportInfo, type Support } from "@/lib/live/catalogue";
import { api } from "@/lib/live/client";
import type { ParticipantProfileDto } from "@/lib/live/participant";
import {
  appointmentPurposes,
  siteGaps,
  TIMEZONE_LABEL,
  type AppointmentPurpose,
  type AssignmentMode,
  type ScheduleBoardDto,
  type SiteInput,
} from "@/lib/live/scheduling";
import type { MatchDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { Skeleton } from "./bits";
import { TextArea, TextField, Tick } from "./form-bits";

type Item = ScheduleBoardDto["unscheduled"][number];
type Occurrence = {
  wanted: string;
  start: string | null;
  state: "usual" | "moved" | "conflict";
  away: boolean;
};

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", ...o }).format(new Date(iso));
const slotText = (iso: string) =>
  fmt(iso, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const steps = ["Visit", "Clinician", "Series", "Confirm"] as const;

/** S05-03: from an accepted service request to a held time offered to the clinician. */
export function BookingWizard({
  item,
  mode,
  onClose,
  onBooked,
}: {
  item: Item;
  mode: AssignmentMode;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ParticipantProfileDto | null>(null);
  const [matches, setMatches] = useState<MatchDto[] | null>(null);
  const [therapistId, setTherapistId] = useState("");
  const [start, setStart] = useState("");
  const [override, setOverride] = useState("");
  const [series, setSeries] = useState<Occurrence[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState<{ on: boolean; weeks: number; visits: number }>({
    on: false,
    weeks: 2,
    visits: 6,
  });
  const customPlan = custom.on ? { everyDays: custom.weeks * 7, visits: custom.visits } : null;
  const [tried, setTried] = useState(false);
  const assessment = supportInfo(item.support as Support).kind === "assessment";
  const [purpose, setPurpose] = useState<AppointmentPurpose>(
    item.location === "Telehealth"
      ? "Telehealth Consultation"
      : assessment
        ? "Initial Assessment"
        : "Treatment Session",
  );
  const [site, setSite] = useState<SiteInput>({
    location: item.location as SiteInput["location"],
    locationChangeReason: "",
    address: "",
    accessNotes: "",
    parking: "",
    pets: "",
    supportPerson: "",
    siteName: "",
    siteContact: "",
    sitePhone: "",
    room: "",
    permission: false,
    deviceCheck: false,
    consentPlan: false,
    attendees: "",
  });
  const set = <K extends keyof SiteInput>(k: K, v: SiteInput[K]) =>
    setSite((s) => ({ ...s, [k]: v }));

  // Pre-fill the participant's address and booking contact (AT-02).
  useEffect(() => {
    api<{ profile: ParticipantProfileDto }>(`/api/care/clients/${item.clientId}/profile`)
      .then(({ profile: p }) => {
        setProfile(p);
        const a = p.details.address;
        setSite((s) => ({
          ...s,
          address:
            s.address || [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(", "),
        }));
      })
      .catch(() => setProfile(null));
  }, [item.clientId]);

  useEffect(() => {
    if (step !== 1 || matches) return;
    api<{ matches: MatchDto[] }>(`/api/care/clients/${item.clientId}/matches?need=${item.needId}`)
      .then((r) => setMatches(r.matches))
      .catch(() => setMatches([]));
  }, [step, matches, item.clientId, item.needId]);

  useEffect(() => {
    if (step !== 2 || !therapistId || !start) return;
    api<{ occurrences: Occurrence[] }>("/api/care/schedule/preview", {
      body: { therapistId, start, frequency: item.frequency, custom: customPlan },
    })
      .then((r) => setSeries(r.occurrences))
      .catch(() => setSeries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- customPlan is derived from custom
  }, [step, therapistId, start, item.frequency, custom]);

  const gaps = siteGaps(site, item.location);
  const eligible = (matches ?? []).filter((m) => m.eligible);
  const ordered =
    mode === "Manual" ? [...eligible].sort((a, b) => a.name.localeCompare(b.name)) : eligible;
  const top = mode === "Manual" ? [] : eligible.slice(0, 3).map((m) => m.therapistId);
  const needsReason = mode === "AI Assisted" && therapistId !== "" && !top.includes(therapistId);
  const chosen = (matches ?? []).find((m) => m.therapistId === therapistId);
  const booking = profile?.contacts.find((c) => c.primaryFor.includes("Booking"));

  function next() {
    setTried(true);
    if (step === 0 && gaps.length) return;
    if (step === 1 && (!therapistId || !start || (needsReason && override.trim().length < 5)))
      return;
    setTried(false);
    setStep((s) => s + 1);
  }

  async function book() {
    setBusy(true);
    try {
      await api(`/api/care/clients/${item.clientId}/requests`, {
        body: {
          needId: item.needId,
          therapistId,
          start,
          site,
          purpose,
          overrideReason: needsReason ? override : undefined,
          series: customPlan ?? undefined,
        },
      });
      toast("Time held and offered to the clinician", {
        tone: "success",
        detail: `${chosen?.name} is asked to accept. The rest of the series books when they do.`,
      });
      onBooked();
    } catch (e) {
      toast("Couldn't book", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Book ${item.support}`}
      description={`${item.patient} · ${item.frequency} · referral asked for ${item.location.toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button variant="primary" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" loading={busy} onClick={book}>
              Hold time and offer to {chosen?.name.split(" ")[0]}
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-5 grid grid-cols-4 gap-1.5">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-col gap-1.5">
            <span
              className={cn(
                "h-1 rounded-full transition-colors duration-(--duration-base)",
                i <= step ? "bg-accent-fill" : "bg-sunken",
              )}
            />
            <span
              className={cn(
                "text-label font-semibold",
                i === step ? "text-accent" : i < step ? "text-ink-700" : "text-ink-500",
              )}
            >
              {s}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="bubble-in flex flex-col gap-4">
          <div className="rounded-control bg-canvas px-4 py-3 text-small text-ink-700">
            <p>
              <strong className="text-ink-900">{item.patient}</strong> · {item.support} (
              {item.discipline})
            </p>
            <p>
              Booking contact:{" "}
              {booking
                ? `${booking.name}${booking.phone ? `, ${booking.phone}` : ""}`
                : profile
                  ? "none set on the record"
                  : "loading…"}
            </p>
            {item.risk && (
              <p className="mt-1 flex items-center gap-1.5 text-over">
                <CircleAlert className="size-4" aria-hidden="true" /> Reported risk: automatic
                matching is off for this booking.
              </p>
            )}
            {item.funding !== "Verified" && (
              <p className="mt-1 text-watch">
                Funding {item.funding === "Exception" ? "exception" : "not reviewed"}: not shown as
                funded until verified.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Purpose">
              <Select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as AppointmentPurpose)}
              >
                {appointmentPurposes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <Field label="Where">
              <Select
                value={site.location}
                onChange={(e) => set("location", e.target.value as SiteInput["location"])}
              >
                {serviceLocations.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>
          {site.location !== item.location && (
            <TextField
              label={`Why not ${item.location.toLowerCase()}?`}
              required
              value={site.locationChangeReason}
              onChange={(v) => set("locationChangeReason", v)}
              hint="Recorded and the participant is told about the change."
            />
          )}
          {site.location === "Home" && (
            <>
              <TextField
                label="Service address"
                required
                value={site.address}
                onChange={(v) => set("address", v)}
              />
              <TextArea
                label="Access notes"
                required
                rows={2}
                value={site.accessNotes}
                onChange={(v) => set("accessNotes", v)}
                placeholder="Entry, stairs, gate code, safety notes"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Parking"
                  value={site.parking}
                  onChange={(v) => set("parking", v)}
                />
                <TextField
                  label="Pets or environment"
                  value={site.pets}
                  onChange={(v) => set("pets", v)}
                />
              </div>
              <TextField
                label="Support person"
                value={site.supportPerson}
                onChange={(v) => set("supportPerson", v)}
                placeholder="Name and role, if someone must be there"
              />
            </>
          )}
          {(site.location === "School" ||
            site.location === "Daycare" ||
            site.location === "Day Program") && (
            <>
              <TextField
                label={`${site.location} name`}
                required
                value={site.siteName}
                onChange={(v) => set("siteName", v)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Authorised site contact"
                  required
                  value={site.siteContact}
                  onChange={(v) => set("siteContact", v)}
                />
                <TextField
                  label="Contact phone"
                  value={site.sitePhone}
                  onChange={(v) => set("sitePhone", v)}
                />
              </div>
              <TextField
                label="Room or timetable notes"
                value={site.room}
                onChange={(v) => set("room", v)}
              />
              <Tick checked={site.permission} onChange={(v) => set("permission", v)}>
                The site has given permission and access is arranged
              </Tick>
            </>
          )}
          {site.location === "Other community location" && (
            <>
              <TextField
                label="Venue name"
                required
                value={site.siteName}
                onChange={(v) => set("siteName", v)}
              />
              <TextField
                label="Venue address"
                required
                value={site.address}
                onChange={(v) => set("address", v)}
              />
              <TextArea
                label="Accessibility and privacy"
                rows={2}
                value={site.accessNotes}
                onChange={(v) => set("accessNotes", v)}
              />
            </>
          )}
          {site.location === "Telehealth" && (
            <>
              <p className="rounded-control bg-accent-tint px-3 py-2 text-small text-ink-700">
                No travel is booked. A joining link is issued before the visit; recording stays off
                unless consent is documented.
              </p>
              <TextField
                label="Who will attend"
                value={site.attendees}
                onChange={(v) => set("attendees", v)}
                placeholder="Participant and parent"
              />
              <Tick checked={site.deviceCheck} onChange={(v) => set("deviceCheck", v)}>
                A device and connection check is planned
              </Tick>
              <Tick checked={site.consentPlan} onChange={(v) => set("consentPlan", v)}>
                Identity check and consent plan agreed (recording off)
              </Tick>
            </>
          )}
          {tried && gaps.length > 0 && (
            <ul role="alert" className="rounded-control bg-over-bg px-4 py-3 text-small text-over">
              {gaps.map((g) => (
                <li key={g}>· {g}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="bubble-in flex flex-col gap-3">
          <p className="text-caption text-ink-500">
            {mode === "Manual"
              ? "Manual mode: eligible clinicians in name order, no ranking."
              : "Eligible clinicians only, ranked by availability, region, caseload and credentials. The top three are suggestions."}{" "}
            Times are {TIMEZONE_LABEL}.
          </p>
          {matches === null ? (
            <Skeleton className="h-48" />
          ) : ordered.length === 0 ? (
            <p className="rounded-control bg-over-bg px-4 py-3 text-small text-over">
              No eligible clinician. Waitlist the service or ask a Clinical Lead about another
              pathway.
            </p>
          ) : (
            ordered.map((m) => {
              const rank = top.indexOf(m.therapistId);
              const picked = m.therapistId === therapistId;
              return (
                <div
                  key={m.therapistId}
                  className={cn(
                    "rounded-card border p-4 transition-all duration-(--duration-fast)",
                    picked
                      ? "border-accent-fill bg-accent-tint/50 shadow-lift"
                      : "border-border hover:border-accent/50",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-small font-semibold text-ink-900">
                      {m.name}{" "}
                      <span className="font-normal text-ink-500">
                        · {m.seniority} · {m.region} · {m.activeClients}/{m.capacity}
                      </span>
                    </p>
                    {rank >= 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-fill px-2 py-0.5 text-label font-semibold text-on-accent">
                        <Sparkle className="size-3" aria-hidden="true" /> Suggestion {rank + 1}
                      </span>
                    )}
                  </div>
                  {mode !== "Manual" && (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {m.reasons.slice(0, 5).map((r) => (
                        <span
                          key={r.label}
                          className={cn(
                            "rounded-tag px-1.5 py-0.5 text-label",
                            r.tone === "good"
                              ? "bg-healthy-bg text-healthy"
                              : r.tone === "warn"
                                ? "bg-watch-bg text-watch"
                                : "bg-sunken text-ink-700",
                          )}
                        >
                          {r.label}
                        </span>
                      ))}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.slots.length === 0 ? (
                      <span className="text-caption text-ink-500">
                        No times in the next two weeks
                      </span>
                    ) : (
                      m.slots.map((s) => {
                        const on = picked && start === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setTherapistId(m.therapistId);
                              setStart(s);
                              setSeries(null);
                            }}
                            className={cn(
                              "inline-flex h-8 cursor-pointer items-center gap-1 rounded-control border px-2.5 text-caption font-semibold transition-all active:scale-95",
                              on
                                ? "border-accent-fill bg-accent-fill text-on-accent"
                                : "border-border-strong bg-surface hover:-translate-y-px hover:border-accent hover:text-accent",
                            )}
                          >
                            {on && <Check className="size-3" aria-hidden="true" />}
                            {slotText(s)}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
          {(matches ?? []).some((m) => !m.eligible) && (
            <details className="rounded-card border border-border p-3">
              <summary className="cursor-pointer text-small font-semibold text-ink-700">
                Not eligible ({(matches ?? []).filter((m) => !m.eligible).length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5 text-caption text-ink-700">
                {(matches ?? [])
                  .filter((m) => !m.eligible)
                  .map((m) => (
                    <li key={m.therapistId} className="flex items-start gap-1.5">
                      <Lock className="mt-0.5 size-3 flex-none text-over" aria-hidden="true" />
                      <span>
                        <strong>{m.name}</strong>:{" "}
                        {m.reasons
                          .filter((r) => r.tone === "warn")
                          .map((r) => r.label)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {needsReason && (
            <TextArea
              label="Why not one of the suggestions?"
              required
              rows={2}
              value={override}
              onChange={setOverride}
              placeholder="For example, continuity: this clinician already sees a sibling"
              hint="Recorded with the booking. Eligibility can't be overridden."
            />
          )}
          {tried && (!therapistId || !start) && (
            <p role="alert" className="text-small text-over">
              Choose a clinician and a time.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="bubble-in flex flex-col gap-3">
          <div role="radiogroup" aria-label="Recurrence" className="grid gap-2 sm:grid-cols-2">
            {[
              { on: false, title: `Referral frequency`, sub: item.frequency },
              {
                on: true,
                title: "Custom interval",
                sub: `Every ${custom.weeks} week${custom.weeks === 1 ? "" : "s"}, ${custom.visits} visits`,
              },
            ].map((o) => (
              <button
                key={String(o.on)}
                type="button"
                role="radio"
                aria-checked={custom.on === o.on}
                onClick={() => {
                  setCustom((c) => ({ ...c, on: o.on }));
                  setSeries(null);
                }}
                className={cn(
                  "cursor-pointer rounded-card border p-3 text-left transition-all active:scale-[0.99]",
                  custom.on === o.on
                    ? "border-accent-fill bg-accent-tint/50 shadow-lift"
                    : "border-border hover:border-accent/50",
                )}
              >
                <span className="block text-small font-semibold text-ink-900">{o.title}</span>
                <span className="block text-caption text-ink-500">{o.sub}</span>
              </button>
            ))}
          </div>
          {custom.on && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Every">
                <Select
                  value={String(custom.weeks)}
                  onChange={(e) => {
                    setCustom((c) => ({ ...c, weeks: Number(e.target.value) }));
                    setSeries(null);
                  }}
                >
                  {[1, 2, 3, 4, 6, 8].map((w) => (
                    <option key={w} value={w}>
                      {w === 1 ? "Week" : `${w} weeks`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Visits in all">
                <Select
                  value={String(custom.visits)}
                  onChange={(e) => {
                    setCustom((c) => ({ ...c, visits: Number(e.target.value) }));
                    setSeries(null);
                  }}
                >
                  {[2, 3, 4, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} visits
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <p className="text-small text-ink-700">
            {item.frequency === "Assessment" || item.frequency === "Other"
              ? "One visit is booked; the clinician plans any further visits."
              : `${item.frequency} visits with ${chosen?.name}. Each one is checked against their calendar and leave.`}
          </p>
          {series === null ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border">
              {series.map((o, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-small">
                  <span className="w-6 text-caption font-semibold text-ink-500">{i + 1}</span>
                  <span className="flex-1">
                    {o.start ? slotText(o.start) : `Wanted ${slotText(o.wanted)}`}
                  </span>
                  {o.state === "usual" && <Tag tone="healthy">Usual time</Tag>}
                  {o.state === "moved" && <Tag tone="watch">Moved: usual time taken</Tag>}
                  {o.state === "conflict" && <Tag tone="over">Collision: place by hand</Tag>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="bubble-in flex flex-col gap-3 text-small">
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 rounded-card border border-border p-4">
            <dt className="text-ink-500">Participant</dt>
            <dd className="font-medium">{item.patient}</dd>
            <dt className="text-ink-500">Service</dt>
            <dd>
              {item.support} · {purpose}
            </dd>
            <dt className="text-ink-500">Clinician</dt>
            <dd>{chosen?.name}</dd>
            <dt className="text-ink-500">First visit</dt>
            <dd>
              {start && slotText(start)} ({TIMEZONE_LABEL})
            </dd>
            <dt className="text-ink-500">Where</dt>
            <dd>
              {site.location}
              {site.location !== item.location && ` (changed: ${site.locationChangeReason})`}
            </dd>
            {series && series.length > 1 && (
              <>
                <dt className="text-ink-500">Series</dt>
                <dd>
                  {series.length} visits, {series.filter((o) => o.state === "conflict").length} to
                  place by hand
                </dd>
              </>
            )}
            {needsReason && (
              <>
                <dt className="text-ink-500">Override</dt>
                <dd>{override}</dd>
              </>
            )}
          </dl>
          <p className="text-caption text-ink-500">
            The time is held and the clinician is asked to accept. Nothing is confirmed to the
            participant until they do; reminders queue once it&apos;s confirmed.
          </p>
        </div>
      )}
    </Sheet>
  );
}
