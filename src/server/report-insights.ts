import "server-only";
import { createHash } from "node:crypto";
import { capacityHours, dayKey, inRange, isCancelled, isDelivered } from "@/lib/live/reports";
import type { ReportInsightDoc } from "./models";
import type { LoadedFacts } from "./reports";

/**
 * Section 9 insight rules. Thresholds are operational configuration (section 15), shown with
 * every insight. A rule raises the insight; a person decides; nothing acts on its own.
 */

type Found = {
  id: string;
  doc: Omit<ReportInsightDoc, "_id" | "status" | "taskId" | "ai" | "history">;
};
const shift = (k: string, d: number) =>
  new Date(Date.parse(`${k}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);

export function computeInsights(l: LoadedFacts): Found[] {
  const { facts: f, today, now } = l;
  const T = l.settings.thresholds;
  const out: Found[] = [];
  const add = (
    type: string,
    period: string,
    d: Omit<Found["doc"], "type" | "period" | "generatedAt" | "evidenceHash">,
  ) =>
    out.push({
      id: `${type}:${period}`,
      doc: {
        ...d,
        type,
        period,
        generatedAt: new Date(),
        evidenceHash: hash([d.evidenceCount, d.evidence]),
      },
    });

  if (l.scope.domains.includes("Referrals") && f.referrals.length) {
    const week = f.referrals.filter((r) => inRange(r.submittedAt, shift(today, -6), today)).length;
    const prior =
      f.referrals.filter((r) => inRange(r.submittedAt, shift(today, -34), shift(today, -7)))
        .length / 4;
    if (week >= T.referralSpikeMin && week > prior * T.referralSpike)
      add("referral-spike", `${shift(today, -6)} to ${today}`, {
        title: "Referral intake is above the usual weekly level",
        category: "Referrals",
        severity: "Review",
        source: "Referrals (M01)",
        evidenceCount: week,
        evidence: [
          { label: "Referrals in the last 7 days", value: String(week) },
          { label: "Average per week, prior 4 weeks", value: prior.toFixed(1) },
        ],
        threshold: `More than ${T.referralSpike}× the prior 4-week weekly average, and at least ${T.referralSpikeMin}`,
        rule: "Referral backlog spike",
        suggestion: "Review intake staffing and the queue order for the coming week.",
        href: "/care/referrals",
        owner: "Intake team",
      });
  }

  if (l.scope.domains.includes("Staff") && f.clinicians.length) {
    const to = shift(today, 13);
    const over = f.clinicians
      .filter((c) => c.active)
      .map((c) => {
        const cap = capacityHours(c, today, to);
        const booked =
          f.appointments
            .filter(
              (a) =>
                a.therapistId === c.id &&
                ["booked", "tentative"].includes(a.status) &&
                inRange(a.start, today, to),
            )
            .reduce((s, a) => s + a.scheduledMinutes, 0) / 60;
        return { c, cap, booked, ratio: cap ? booked / cap : 0 };
      })
      .filter((x) => x.cap > 0 && x.ratio > T.capacityRatio);
    if (over.length)
      add("capacity", `${today} to ${to}`, {
        title: `${over.length} clinician${over.length === 1 ? " is" : "s are"} booked above ${Math.round(T.capacityRatio * 100)}% of capacity`,
        category: "Staff",
        severity: "Review",
        source: "Scheduling (M05), Staff (M04)",
        evidenceCount: over.length,
        evidence: over.slice(0, 4).map((x) => ({
          label: x.c.name,
          value: `${x.booked.toFixed(1)} of ${x.cap.toFixed(1)} hours`,
        })),
        threshold: `Booked ÷ available hours over the next 14 days above ${T.capacityRatio}`,
        rule: "Therapist capacity warning",
        suggestion:
          "Review upcoming bookings with the clinician and their lead. This is a workload signal, not a performance or risk judgement.",
        href: "/care/therapists",
        owner: "Operations Manager",
      });
  }

  if (l.scope.domains.includes("Clinical Operations")) {
    const notes = f.appointments.filter(
      (a) =>
        a.status === "completed" &&
        a.noteDue &&
        a.noteDue < now &&
        !["Final", "Amended"].includes(a.noteStatus),
    ).length;
    const reports = f.assessments.filter(
      (a) => ["Draft", "In Progress", "Awaiting Review"].includes(a.status) && a.dueAt < today,
    ).length;
    if (notes + reports >= T.documentationMin)
      add("documentation", today, {
        title: "Clinical documentation is past its due time",
        category: "Clinical Operations",
        severity: notes + reports >= 8 ? "Urgent Operational" : "Review",
        source: "Session notes (M05), Assessments (M12)",
        evidenceCount: notes + reports,
        evidence: [
          { label: "Session notes past 48 hours", value: String(notes) },
          { label: "Assessment reports past due", value: String(reports) },
        ],
        threshold: `${T.documentationMin} or more overdue documents`,
        rule: "Documentation overdue",
        suggestion:
          "Ask the Clinical Lead to review owners and agree catch-up time. Documentation status only; it says nothing about care quality.",
        href: "/care/reports?tab=clinical",
        owner: "Clinical Lead",
      });
  }

  if (l.scope.domains.includes("Scheduling")) {
    const from = shift(today, -29);
    const by = new Map<string, { c: number; d: number }>();
    for (const a of f.appointments.filter((x) => inRange(x.start, from, today))) {
      const cur = by.get(a.discipline) ?? { c: 0, d: 0 };
      if (isCancelled(a)) cur.c += 1;
      if (isCancelled(a) || a.status === "completed" || a.status === "no-show") cur.d += 1;
      by.set(a.discipline, cur);
    }
    for (const [disc, v] of by) {
      const rate = v.d ? (v.c / v.d) * 100 : 0;
      if (v.d >= T.cancellationMin && rate > T.cancellationRate)
        add(`cancellations-${disc.toLowerCase().replace(/\W+/g, "-")}`, `${from} to ${today}`, {
          title: `${disc} cancellations are higher than usual`,
          category: "Scheduling",
          severity: "Review",
          source: "Scheduling (M05)",
          evidenceCount: v.d,
          evidence: [
            { label: "Cancelled visits", value: String(v.c) },
            { label: "Eligible visits", value: String(v.d) },
            { label: "Cancellation rate", value: `${rate.toFixed(1)}%` },
          ],
          threshold: `Above ${T.cancellationRate}% with at least ${T.cancellationMin} eligible visits`,
          rule: "Cancellation trend",
          suggestion: "Look at the reasons and times in R08 before changing anything.",
          href: "/care/reports?tab=appointments",
          owner: "Scheduling team",
        });
    }
  }

  if (l.scope.domains.includes("Finance")) {
    const blocked = f.funding.filter((x) => x.blocking);
    if (blocked.length >= T.fundingCluster)
      add("funding-cluster", today, {
        title: "Several services are blocked by funding verification",
        category: "Finance",
        severity: blocked.length >= 6 ? "Urgent Operational" : "Review",
        source: "Funding (M06)",
        evidenceCount: blocked.length,
        evidence: Object.entries(
          blocked.reduce<Record<string, number>>(
            (m, x) => ({ ...m, [x.exception]: (m[x.exception] ?? 0) + 1 }),
            {},
          ),
        ).map(([label, n]) => ({ label, value: String(n) })),
        threshold: `${T.fundingCluster} or more allocations with an active blocker`,
        rule: "Funding exception cluster",
        suggestion:
          "Create a finance task to chase the missing or expiring verification. Remaining budgets are not estimated.",
        href: "/care/funding?tab=alerts",
        owner: "Finance team",
      });
    const month = today.slice(0, 7);
    const lastMonthKey = dayKey(new Date(Date.parse(`${month}-01T00:00:00Z`) - 86_400_000)).slice(
      0,
      7,
    );
    const dayOfMonth = Number(today.slice(8, 10));
    const paidIn = (m: string) =>
      f.payments
        .filter(
          (p) =>
            p.status !== "Reversed" &&
            p.receivedOn.startsWith(m) &&
            Number(p.receivedOn.slice(8, 10)) <= dayOfMonth,
        )
        .reduce((s, p) => s + p.amount - p.refunded, 0);
    const issuedIn = (m: string) =>
      f.invoices
        .filter(
          (i) =>
            i.issuedAt &&
            dayKey(i.issuedAt).startsWith(m) &&
            Number(dayKey(i.issuedAt).slice(8, 10)) <= dayOfMonth,
        )
        .reduce((s, i) => s + i.gross - i.credits, 0);
    const cur = paidIn(month);
    const prev = paidIn(lastMonthKey);
    if (prev > 0 && Math.abs(((cur - prev) / prev) * 100) > T.revenueVariance)
      add("collection-variance", `${month} to day ${dayOfMonth}`, {
        title:
          cur < prev
            ? "Cash received is down on the same point last month"
            : "Cash received is up on the same point last month",
        category: "Finance",
        severity: "Info",
        source: "Payments (M07)",
        evidenceCount: f.payments.filter((p) => p.receivedOn.startsWith(month)).length,
        evidence: [
          { label: "Received this month to date (cash)", value: aud(cur) },
          { label: "Received last month to the same day (cash)", value: aud(prev) },
          { label: "Issued this month to date (accrual)", value: aud(issuedIn(month)) },
        ],
        threshold: `Variance above ${T.revenueVariance}% month to date`,
        rule: "Revenue / collection anomaly",
        suggestion:
          "Compare remittances against the ageing report. Cash and issued revenue are different measures.",
        href: "/care/reports?tab=finance",
        owner: "Finance Manager",
      });
  }

  if (l.scope.domains.includes("Telehealth")) {
    const attempts = f.telehealth.filter(
      (t) =>
        ["Joined", "Did not join", "Technical failure"].includes(t.attempt) &&
        inRange(t.start, shift(today, -59), today),
    );
    const fails = attempts.filter(
      (t) => t.attempt === "Technical failure" || t.reconnects > 0,
    ).length;
    const rate = attempts.length ? (fails / attempts.length) * 100 : 0;
    if (attempts.length >= T.telehealthMin && rate > T.telehealthFailure)
      add("telehealth", `${shift(today, -59)} to ${today}`, {
        title: "Telehealth connection problems are above threshold",
        category: "Telehealth",
        severity: "Review",
        source: "Telehealth session metadata",
        evidenceCount: attempts.length,
        evidence: [
          { label: "Attempts with a known outcome", value: String(attempts.length) },
          { label: "With a technical failure or reconnect", value: String(fails) },
          { label: "Failure rate", value: `${rate.toFixed(1)}%` },
        ],
        threshold: `Above ${T.telehealthFailure}% with at least ${T.telehealthMin} attempts`,
        rule: "Telehealth connection issue",
        suggestion:
          "Ask for a technical review of the affected sessions. Uses connection metadata only, never recordings.",
        href: "/care/reports?tab=telehealth",
        owner: "Operations Manager",
      });
  }

  if (l.scope.domains.includes("Staff")) {
    const d = f.appointments.filter(
      (a) =>
        isDelivered(a) && a.deliveredMinutes === null && inRange(a.start, shift(today, -89), today),
    ).length;
    if (d > 0)
      add("incomplete-minutes", today, {
        title: "Some delivered visits have no recorded clinical minutes",
        category: "Staff",
        severity: "Info",
        source: "Visit check-out (M05)",
        evidenceCount: d,
        evidence: [{ label: "Delivered visits without minutes, last 90 days", value: String(d) }],
        threshold: "Any delivered visit without check-out minutes",
        rule: "Inconsistent metric definition",
        suggestion:
          "Delivered hours exclude these visits and show Data Incomplete. Ask clinicians to complete check-out so hours and utilisation are comparable.",
        href: "/care/reports?tab=capacity",
        owner: "Operations Manager",
      });
  }
  return out;
}
