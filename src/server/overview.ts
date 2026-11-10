import "server-only";
import { caseloadStatus } from "@/lib/live/catalogue";
import { addDays, atBrisbane, brisbaneDay, isoWeekday } from "@/lib/live/time";
import type { LiveOverviewDto } from "@/lib/live/types";
import { collections } from "./db";
import { stageOf } from "./dto";

/** The director's live figures, worked out from the database each time they're asked for. */
export async function liveOverview(): Promise<LiveOverviewDto> {
  const { clients, assignments, appointments, therapists } = await collections();
  const today = brisbaneDay(new Date());
  const tomorrow = addDays(today, 1);
  const weekStart = addDays(today, 1 - isoWeekday(today));
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const monthAgo = addDays(today, -30);
  const toUtc = (day: Date) => atBrisbane(day, 0);

  const [clientRows, pending, week, recent, team] = await Promise.all([
    clients.find({}, { projection: { needs: 1, discharged: 1 } }).toArray(),
    assignments.find({ status: "pending" }, { projection: { createdAt: 1 } }).toArray(),
    appointments
      .find({ start: { $gte: toUtc(weekStart), $lt: toUtc(addDays(weekStart, 5)) } })
      .toArray(),
    appointments
      .find(
        { "cancellation.at": { $gte: toUtc(monthAgo) } },
        { projection: { status: 1, cancellation: 1 } },
      )
      .toArray(),
    therapists
      .find({}, { projection: { activeClients: 1, capacity: 1, caseloadScore: 1 } })
      .toArray(),
  ]);

  const standing = (status: string) => status === "booked" || status === "completed";
  const stages = clientRows.map(stageOf);
  const oldest = pending.reduce<Date | null>(
    (min, p) => (!min || p.createdAt < min ? p.createdAt : min),
    null,
  );
  const active = team.reduce((sum, t) => sum + t.activeClients, 0);
  const capacity = team.reduce((sum, t) => sum + t.capacity, 0);

  return {
    onboarding: {
      needsTherapist: stages.filter((s) => s === "Needs a therapist").length,
      waiting: stages.filter((s) => s === "Waiting for therapist").length,
      active: stages.filter((s) => s === "Active").length,
      oldestPendingAt: oldest?.toISOString() ?? null,
    },
    visits: {
      today: week.filter(
        (v) => standing(v.status) && v.start >= toUtc(today) && v.start < toUtc(tomorrow),
      ).length,
      week: days.map((day) => ({
        day: day.toISOString(),
        booked: week.filter(
          (v) => standing(v.status) && v.start >= toUtc(day) && v.start < toUtc(addDays(day, 1)),
        ).length,
        cancelled: week.filter(
          (v) => v.cancellation && v.start >= toUtc(day) && v.start < toUtc(addDays(day, 1)),
        ).length,
      })),
    },
    cancellations: {
      total: recent.filter((r) => r.status === "cancelled" || r.status === "late-cancelled").length,
      late: recent.filter((r) => r.status === "late-cancelled").length,
      noShows: recent.filter((r) => r.status === "no-show").length,
    },
    team: {
      therapists: team.length,
      activeClients: active,
      capacity,
      atRisk: team.filter((t) => caseloadStatus(t.caseloadScore) === "At Risk").length,
    },
  };
}
