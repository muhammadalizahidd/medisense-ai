/* One patient's session figures, shared by the screen and the PDF so they always agree. */

export type SessionLike = { start: string; status: string };

const MISSED = ["no-show", "late-cancelled"];
const MONTHS = 6;

const brisbaneMonth = (iso: string) =>
  new Date(Date.parse(iso) + 10 * 3_600_000).toISOString().slice(0, 7);

export function sessionStats(sessions: SessionLike[], now: string) {
  const past = sessions.filter((s) => s.start <= now);
  const delivered = past.filter((s) => s.status === "completed");
  const missed = past.filter((s) => MISSED.includes(s.status)).length;
  const cancelled = past.filter((s) => s.status === "cancelled").length;
  const [y, m] = brisbaneMonth(now).split("-").map(Number) as [number, number];
  const months = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(y, m - MONTHS + i, 1));
    const key = d.toISOString().slice(0, 7);
    return {
      key,
      label: new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(d),
      value: delivered.filter((s) => brisbaneMonth(s.start) === key).length,
    };
  });
  return {
    delivered: delivered.length,
    missed,
    cancelled,
    attendance:
      delivered.length + missed > 0
        ? Math.round((delivered.length / (delivered.length + missed)) * 100)
        : null,
    months,
    last:
      delivered
        .map((s) => s.start)
        .sort()
        .at(-1) ?? null,
    next:
      sessions
        .filter((s) => s.start > now && ["booked", "tentative"].includes(s.status))
        .map((s) => s.start)
        .sort()[0] ?? null,
  };
}
export type SessionStats = ReturnType<typeof sessionStats>;
