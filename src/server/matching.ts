import "server-only";
import {
  supportInfo,
  type Support,
  caseloadStatus,
  CLOSE_MINUTES,
  OPEN_MINUTES,
  type Region,
} from "@/lib/live/catalogue";
import type { AvailabilitySummary, MatchDto } from "@/lib/live/types";
import { addDays, atBrisbane, brisbaneDay, brisbaneMinutes, isoWeekday } from "@/lib/live/time";
import type { AppointmentDoc, TherapistDoc } from "./models";

const STEP = 30;
const TRAVEL_BUFFER = 15;
const SEARCH_DAYS = 14;

type Interval = { start: number; end: number };

/** FNV-1a with a final avalanche, so keys that differ by one character give unrelated values. */
export function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/**
 * Visits for the therapist's current caseload, which lives in the practice system rather than here.
 * Worked out the same way every time from their utilisation, so busier therapists have fewer gaps.
 */
export function caseloadVisits(t: TherapistDoc, day: Date): Interval[] {
  const pressure = Math.min(0.9, Math.max(0.25, (t.activeClients / t.capacity) * 0.72));
  const visits: Interval[] = [];
  const key = day.toISOString().slice(0, 10);
  for (let start = OPEN_MINUTES, i = 0; start + t.sessionMinutes <= CLOSE_MINUTES; i += 1) {
    if (hash(`${t.slug}:${key}:${i}`) < pressure) {
      visits.push({ start, end: start + t.sessionMinutes });
    }
    start += t.sessionMinutes + STEP;
  }
  return visits;
}

const overlaps = (a: Interval, b: Interval) =>
  a.start < b.end + TRAVEL_BUFFER && b.start < a.end + TRAVEL_BUFFER;

function bookedOn(day: Date, appointments: AppointmentDoc[]): Interval[] {
  return appointments
    .filter((a) => a.holdsSlot && brisbaneDay(a.start).getTime() === day.getTime())
    .map((a) => ({ start: brisbaneMinutes(a.start), end: brisbaneMinutes(a.end) }));
}

/** True when the day falls inside any of the therapist's time off. */
export function isAway(t: TherapistDoc, day: Date) {
  const key = day.toISOString().slice(0, 10);
  return (t.timeOff ?? []).some((off) => off.from <= key && key <= off.to);
}

/** True when the therapist works then, isn't away, is inside opening hours and has no visit too close. */
export function isSlotFree(t: TherapistDoc, start: Date, appointments: AppointmentDoc[]) {
  const day = brisbaneDay(start);
  if (isAway(t, day)) return false;
  const minutes = brisbaneMinutes(start);
  const slot = { start: minutes, end: minutes + t.sessionMinutes };
  const hours = t.weekly.find((w) => w.weekday === isoWeekday(day));
  if (!hours || slot.start < hours.start || slot.end > hours.end) return false;
  if (start.getTime() < Date.now() + 60 * 60_000) return false;
  return ![...caseloadVisits(t, day), ...bookedOn(day, appointments)].some((busy) =>
    overlaps(busy, slot),
  );
}

/** Open first-visit times from tomorrow, at most `perDay` a day so the choice spans the week. */
export function openSlots(
  t: TherapistDoc,
  appointments: AppointmentDoc[],
  { limit = 8, perDay = 2, from = new Date() } = {},
) {
  const slots: Date[] = [];
  const first = addDays(brisbaneDay(from), 1);
  for (let d = 0; d < SEARCH_DAYS && slots.length < limit; d += 1) {
    const day = addDays(first, d);
    let today = 0;
    for (let m = OPEN_MINUTES; m + t.sessionMinutes <= CLOSE_MINUTES; m += STEP) {
      const start = atBrisbane(day, m);
      if (isSlotFree(t, start, appointments)) {
        slots.push(start);
        today += 1;
        m += t.sessionMinutes;
        if (today >= perDay || slots.length >= limit) break;
      }
    }
  }
  return slots;
}

/** A transparent score: every point comes with a reason shown to the person choosing. */
/**
 * Why a clinician can't take this service: lapsed registration or screening, or an assessment
 * they aren't credentialed for. No one is assigned if these checks fail (section 1).
 */
export function ineligibility(t: TherapistDoc, support: Support | null, today: string) {
  const c = t.credentials;
  const out: string[] = [];
  if (!c) return ["Credentials not on file"];
  if (c.registrationExpiry < today) out.push(`Registration expired ${c.registrationExpiry}`);
  if (c.screeningExpiry < today) out.push(`Worker screening expired ${c.screeningExpiry}`);
  if (
    support &&
    supportInfo(support).kind === "assessment" &&
    !c.assessmentScopes.includes(support)
  ) {
    out.push(`Not credentialed for ${support}`);
  }
  return out;
}

export function rankTherapists(
  candidates: TherapistDoc[],
  appointmentsByTherapist: Map<string, AppointmentDoc[]>,
  clientRegion: Region,
  support: Support | null = null,
): MatchDto[] {
  const today = new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
  const matches = candidates.map((t): MatchDto => {
    const blocked = ineligibility(t, support, today);
    const slots = blocked.length
      ? []
      : openSlots(t, appointmentsByTherapist.get(t._id.toHexString()) ?? []);
    const status = caseloadStatus(t.caseloadScore);
    const free = t.capacity - t.activeClients;
    const reasons: MatchDto["reasons"] = blocked.map((label) => ({ label, tone: "warn" as const }));
    let score = blocked.length ? -1000 : 0;
    if (!blocked.length && t.credentials) {
      reasons.push({ label: "Registration and screening current", tone: "good" });
    }

    if (t.region === clientRegion) {
      score += 30;
      reasons.push({ label: `Works in ${t.region}`, tone: "good" });
    } else {
      reasons.push({ label: `Based in ${t.region}`, tone: "neutral" });
    }

    if (free > 0) {
      score += Math.min(free, 8) * 3;
      reasons.push({ label: `${free} ${free === 1 ? "place" : "places"} free`, tone: "good" });
    } else {
      score -= 20;
      reasons.push({ label: "Caseload full", tone: "warn" });
    }

    if (status === "At Risk") {
      score -= 40;
      reasons.push({ label: "At Risk caseload", tone: "warn" });
    } else if (status === "Watch") {
      score -= 10;
      reasons.push({ label: "Watch caseload", tone: "neutral" });
    } else {
      score += 10;
      reasons.push({ label: "Healthy caseload", tone: "good" });
    }

    const firstSlot = slots[0];
    if (firstSlot) {
      const days = Math.round((firstSlot.getTime() - Date.now()) / 86_400_000);
      if (days <= 2) score += 20;
      else if (days <= 5) score += 10;
    } else {
      score -= 50;
      reasons.push({ label: "No times in the next 2 weeks", tone: "warn" });
    }

    return {
      therapistId: t._id.toHexString(),
      name: t.name,
      discipline: t.discipline,
      region: t.region,
      seniority: t.seniority,
      status,
      activeClients: t.activeClients,
      capacity: t.capacity,
      sessionMinutes: t.sessionMinutes,
      score,
      reasons,
      eligible: blocked.length === 0,
      slots: slots.map((s) => s.toISOString()),
      availability: availabilitySummary(t),
    };
  });
  return matches.sort((a, b) => b.score - a.score);
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function clock(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

/** The therapist's working pattern in words, and any time off in the next four weeks. */
export function availabilitySummary(t: TherapistDoc): AvailabilitySummary {
  const days = [...t.weekly].sort((a, b) => a.weekday - b.weekday);
  const sameHours = days.every((d) => d.start === days[0]?.start && d.end === days[0]?.end);
  const pattern = days
    .map(
      (d) => `${DAY_NAMES[d.weekday - 1]}${sameHours ? "" : ` ${clock(d.start)}–${clock(d.end)}`}`,
    )
    .join(", ");
  const first = days[0];
  const today = brisbaneDay(new Date()).toISOString().slice(0, 10);
  const horizon = addDays(brisbaneDay(new Date()), 28).toISOString().slice(0, 10);
  return {
    pattern:
      days.length === 0
        ? "No working days set"
        : sameHours && first
          ? `${pattern} · ${clock(first.start)}–${clock(first.end)}`
          : pattern,
    away: (t.timeOff ?? [])
      .filter((off) => off.to >= today && off.from <= horizon)
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((off) => ({ from: off.from, to: off.to, reason: off.reason })),
  };
}
