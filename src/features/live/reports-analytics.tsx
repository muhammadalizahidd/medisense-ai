"use client";

import {
  Activity,
  CalendarCheck,
  ClipboardList,
  Clock,
  FileInput,
  HeartPulse,
  Landmark,
  Receipt,
  ShieldAlert,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { TrendChart } from "@/components/charts/trend-chart";
import { RuleMark } from "@/components/ai/provenance";
import { ageBucket } from "@/lib/live/report-catalogue";
import {
  bucketLabel,
  bucketOf,
  bucketsIn,
  capacityHours,
  dayKey,
  formatValue,
  inRange,
  isCancelled,
  isDelivered,
} from "@/lib/live/reports";
import {
  Card,
  DrillSheet,
  Kpi,
  KpiGrid,
  NA,
  ReportTable,
  type Ctx,
  type Drill,
} from "./reports-bits";
import { Charts, Measures } from "./reports-section";

const compactAud = (v: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);

const series = [
  colour.series1,
  colour.series2,
  colour.series3,
  colour.series4,
  colour.watch,
  colour.stone,
];

function useDrill() {
  const [d, setD] = useState<Drill | null>(null);
  return [d, setD] as const;
}

function trend<T>(
  c: Ctx,
  items: T[],
  at: (x: T) => string | null,
  keys: { key: string; test: (x: T) => boolean }[],
) {
  const buckets = bucketsIn(c.f.from, c.f.to, c.f.grain);
  return buckets.map((b) => {
    const row: Record<string, string | number> = { x: bucketLabel(b, c.f.grain) };
    for (const k of keys)
      row[k.key] = items.filter((x) => {
        const d = at(x);
        return (
          d && inRange(d, c.f.from, c.f.to) && bucketOf(dayKey(d), c.f.grain) === b && k.test(x)
        );
      }).length;
    return row;
  });
}

const count = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};

/* ------------------------------------------------------------------ referrals and intake */

export function ReferralsTab({ c }: { c: Ctx }) {
  const [drill, setDrill] = useDrill();
  const inR = c.facts.referrals.filter((r) => inRange(r.submittedAt, c.f.from, c.f.to));
  const supportsData = bucketsIn(
    c.f.from,
    c.f.to < c.hub.today ? c.f.to : c.hub.today,
    c.f.grain,
  ).map((b) => {
    const list = inR.filter((r) => bucketOf(dayKey(r.submittedAt), c.f.grain) === b);
    return {
      x: bucketLabel(b, c.f.grain),
      referrals: list.length,
      supports: list.reduce((s, r) => s + r.supports.length, 0),
    };
  });
  const stages = count(c.facts.referrals, (r) => r.status);
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi
          icon={FileInput}
          r={c.run("new-referrals")}
          onDrill={() =>
            setDrill({
              title: "Referrals submitted in the period",
              reportId: "R03",
              href: "/care/referrals",
              module: "Referrals and intake",
              filter: () => true,
            })
          }
        />
        <Kpi icon={ClipboardList} r={c.run("requested-supports")} />
        <Kpi icon={Activity} r={c.run("intake-completion")} />
        <Kpi icon={Clock} r={c.run("median-intake")} />
        <Kpi
          icon={ShieldAlert}
          r={c.run("missing-info")}
          onDrill={() =>
            setDrill({
              title: "Missing-information queue",
              reportId: "R03",
              href: "/care/referrals",
              module: "Referrals and intake",
              filter: (r) => r.status === "Needs Information",
            })
          }
        />
        <Kpi icon={Users} r={c.run("unassigned")} />
      </KpiGrid>
      <Charts cols="xl:grid-cols-[2fr_1fr]">
        <Card
          title="Referrals and requested supports"
          sub={`By ${c.f.grain.toLowerCase()} · submitted date · one referral can ask for several supports`}
          icon={FileInput}
        >
          <TrendChart
            label="Referrals and supports"
            data={supportsData}
            xKey="x"
            series={[
              { key: "referrals", label: "Parent referrals", colour: colour.series1, kind: "area" },
              { key: "supports", label: "Requested supports", colour: colour.series2 },
            ]}
            height={240}
          />
        </Card>
        <Card
          title="Where referrals are now"
          sub="Current status · parent referrals"
          icon={Activity}
        >
          {stages.length ? (
            <BarList
              label="Referral stages"
              data={stages.map(([k, v], i) => ({
                id: k,
                label: k,
                value: v,
                colour: series[i % series.length] as string,
              }))}
              labelWidth={150}
            />
          ) : (
            <NA>No referrals match the filters.</NA>
          )}
        </Card>
      </Charts>
      <ReportTable c={c} id="R01" />
      <ReportTable c={c} id="R02" />
      <ReportTable
        c={c}
        id="R03"
        rowAction={
          c.hub.scope.detail.includes("Referrals")
            ? {
                label: "Create task",
                run: async (r) => {
                  try {
                    const res = await api<{ ref: string; created: boolean }>("/api/care/reports", {
                      body: { type: "referral-task", referralId: r._rid },
                    });
                    toast(
                      res.created ? `Task ${res.ref} created` : `Task ${res.ref} already open`,
                      {
                        tone: "success",
                        detail:
                          "Intake work queue, due tomorrow, with the missing items as a checklist.",
                      },
                    );
                  } catch (e) {
                    toast("Couldn't create the task", {
                      tone: "error",
                      detail: e instanceof Error ? e.message : "",
                    });
                  }
                },
              }
            : undefined
        }
      />
      {drill && <DrillSheet c={c} d={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ participants and services */

export function ParticipantsTab({ c }: { c: Ctx }) {
  const [drill, setDrill] = useDrill();
  const active = c.facts.services.filter((s) =>
    ["assigned", "waiting", "needs-therapist"].includes(s.status),
  );
  const bySetting = count(
    c.facts.participants
      .filter((p) => !p.dischargedAt)
      .flatMap((p) => p.settings.map((s) => ({ s }))),
    (x) => x.s,
  );
  const people = new Set(active.map((s) => s.participantId));
  const multi = [...people].filter(
    (p) => active.filter((s) => s.participantId === p).length > 1,
  ).length;
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi
          icon={Users}
          r={c.run("active-participants")}
          onDrill={() =>
            setDrill({
              title: "Active participants",
              reportId: "R04",
              href: "/care",
              module: "Patients",
              columns: [
                { key: "who", label: "Participant", kind: "text" },
                { key: "services", label: "Active services", kind: "text" },
                { key: "settings", label: "Settings", kind: "text" },
                { key: "region", label: "Region", kind: "text" },
              ],
              rows: [...new Set(active.map((s) => s.participantId))].map((pid) => {
                const p = c.facts.participants.find((x) => x.id === pid);
                const mine = active.filter((s) => s.participantId === pid);
                const restricted = mine.some((s) => s.restricted);
                return {
                  _href:
                    c.hub.scope.detail.includes("Participants") && !restricted
                      ? `/care/${pid}`
                      : null,
                  who: restricted ? "Restricted service" : (p?.label ?? "Participant"),
                  services: mine.map((s) => s.support).join(", "),
                  settings: p?.settings.join(", ") ?? "—",
                  region: p?.region ?? "—",
                };
              }),
            })
          }
        />
        <Kpi icon={HeartPulse} r={c.run("new-starts")} />
        <Kpi icon={ShieldAlert} r={c.run("unassigned")} />
        <article className="rounded-card border border-border bg-surface p-4">
          <h3 className="text-small font-semibold text-ink-900">Multiple-service cases</h3>
          <p className="mt-2 type-display text-h2 text-ink-900">{multi}</p>
          <p className="mt-1 text-caption text-ink-500">
            people with 2+ active services · {active.length} service requests across {people.size}{" "}
            people
          </p>
        </article>
      </KpiGrid>
      <Charts cols="xl:grid-cols-[1fr_2fr]">
        <Card
          title="Service setting mix"
          sub="Current participants · settings overlap (a child on NDIS counts in both)"
          icon={Users}
        >
          {bySetting.length ? (
            <DonutChart
              label="Settings"
              slices={bySetting.map(([k, v], i) => ({
                id: k,
                label: k,
                value: v,
                colour: series[i % series.length] as string,
              }))}
              centre={c.facts.participants.filter((p) => !p.dischargedAt).length}
              centreCaption="people"
            />
          ) : (
            <NA>No participants match.</NA>
          )}
        </Card>
        <Card
          title="Service demand"
          sub="Requested supports · waiting vs allocated"
          icon={ClipboardList}
        >
          <BarList
            label="Service demand"
            data={count(active, (s) => s.support)
              .slice(0, 10)
              .map(([k, v], i) => ({ id: k, label: k, value: v, colour: series[i % 4] as string }))}
            labelWidth={200}
          />
        </Card>
      </Charts>
      <ReportTable c={c} id="R04" />
      <ReportTable c={c} id="R05" />
      {drill && <DrillSheet c={c} d={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ clinician capacity */

export function CapacityTab({ c }: { c: Ctx }) {
  const [drill, setDrill] = useDrill();
  const util = useMemo(
    () =>
      c.facts.clinicians
        .filter((x) => x.active)
        .map((x) => {
          const cap = capacityHours(x, c.f.from, c.f.to);
          const del =
            c.facts.appointments
              .filter(
                (a) =>
                  a.therapistId === x.id && isDelivered(a) && inRange(a.start, c.f.from, c.f.to),
              )
              .reduce((s, a) => s + (a.deliveredMinutes ?? 0), 0) / 60;
          return {
            id: x.id,
            label: x.name,
            value: cap ? Math.round((del / cap) * 1000) / 10 : 0,
            cap,
          };
        })
        .filter((x) => x.cap > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 14),
    [c],
  );
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi icon={CalendarCheck} r={c.run("booked-hours")} />
        <Kpi
          icon={Clock}
          r={c.run("delivered-hours")}
          onDrill={() =>
            setDrill({
              title: "Completed visits without verified minutes (Data Incomplete)",
              reportId: "R07",
              href: "/care/schedule",
              module: "Scheduling",
              filter: (r) => r.status === "Completed" && r.duration === null,
            })
          }
        />
        <Kpi icon={Activity} r={c.run("utilisation")} />
        <Kpi icon={ClipboardList} r={c.run("overdue-notes")} />
      </KpiGrid>
      <Charts cols="xl:grid-cols-1">
        <Card
          title="Utilisation by clinician"
          sub="Delivered direct-care hours ÷ eligible rostered hours · leave and 15% non-clinical time excluded · not a performance score"
          icon={Activity}
        >
          {util.length ? (
            <BarList
              label="Utilisation"
              data={util.map((u) => ({
                id: u.id,
                label: u.label,
                value: u.value,
                colour: u.value > 90 ? colour.over : u.value > 75 ? colour.watch : colour.series1,
              }))}
              format={(v) => `${v.toFixed(1)}%`}
              labelWidth={160}
            />
          ) : (
            <NA>No rostered capacity in the period, so utilisation is N/A.</NA>
          )}
        </Card>
      </Charts>
      <ReportTable c={c} id="R06" />
      {drill && <DrillSheet c={c} d={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ appointments and visits */

export function AppointmentsTab({ c }: { c: Ctx }) {
  const [drill, setDrill] = useDrill();
  const inR = c.facts.appointments.filter((a) => inRange(a.start, c.f.from, c.f.to));
  const data = trend(c, c.facts.appointments, (a) => a.start, [
    { key: "delivered", test: (a) => isDelivered(a) },
    { key: "cancelled", test: (a) => isCancelled(a) },
    { key: "dna", test: (a) => a.status === "no-show" },
    { key: "booked", test: (a) => a.status === "booked" || a.status === "tentative" },
  ]);
  const modes = count(
    inR.filter((a) => isDelivered(a)),
    (a) => a.mode,
  );
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi
          icon={CalendarCheck}
          r={c.run("scheduled")}
          onDrill={() =>
            setDrill({
              title: "Appointments scheduled in the period",
              reportId: "R07",
              href: "/care/schedule",
              module: "Scheduling",
            })
          }
        />
        <Kpi
          icon={HeartPulse}
          r={c.run("delivered")}
          onDrill={() =>
            setDrill({
              title: "Delivered sessions",
              reportId: "R07",
              href: "/care/schedule",
              module: "Scheduling",
              filter: (r) => r.status === "Completed" && r.duration !== null,
            })
          }
        />
        <Kpi
          icon={ShieldAlert}
          r={c.run("cancellation-rate")}
          onDrill={() =>
            setDrill({
              title: "Cancelled appointments",
              reportId: "R07",
              href: "/care/schedule",
              module: "Scheduling",
              filter: (r) => String(r.status).includes("ancel"),
            })
          }
        />
        <Kpi
          icon={Users}
          r={c.run("no-show-rate")}
          onDrill={() =>
            setDrill({
              title: "Did not attend",
              reportId: "R07",
              href: "/care/schedule",
              module: "Scheduling",
              filter: (r) => r.status === "Did not attend",
            })
          }
        />
      </KpiGrid>
      <Charts cols="xl:grid-cols-[2fr_1fr]">
        <Card
          title="Visit outcomes"
          sub={`By ${c.f.grain.toLowerCase()} · scheduled date · moved visits keep their history`}
          icon={CalendarCheck}
        >
          <StackedColumns
            label="Visit outcomes"
            data={data}
            xKey="x"
            series={[
              { key: "delivered", label: "Delivered", colour: colour.series1 },
              { key: "booked", label: "Still booked", colour: colour.series3 },
              { key: "cancelled", label: "Cancelled", colour: colour.watch },
              { key: "dna", label: "Did not attend", colour: colour.over },
            ]}
            height={240}
          />
        </Card>
        <Card title="Delivery mode" sub="Delivered sessions · mode at delivery" icon={Video}>
          {modes.length ? (
            <DonutChart
              label="Mode"
              slices={modes.map(([k, v], i) => ({
                id: k,
                label: k,
                value: v,
                colour: series[i % series.length] as string,
              }))}
              centre={modes.reduce((s, [, v]) => s + v, 0)}
              centreCaption="sessions"
            />
          ) : (
            <NA>No delivered sessions in the period.</NA>
          )}
        </Card>
      </Charts>
      <ReportTable
        c={c}
        id="R07"
        statusOptions={[
          "Booked",
          "Completed",
          "Cancelled",
          "Late cancelled",
          "Did not attend",
          "Incomplete",
          "Rescheduled",
          "Tentative",
        ]}
      />
      <ReportTable c={c} id="R08" />
      <ReportTable c={c} id="R09" />
      {drill && <DrillSheet c={c} d={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ assessment and treatment operations */

export function ClinicalTab({ c }: { c: Ctx }) {
  const aggregateOnly = !c.hub.scope.detail.includes("Clinical Operations");
  const stages = count(c.facts.assessments, (a) => a.status);
  const reviews = count(c.facts.goalReviews, (g) => g.status);
  return (
    <div className="flex flex-col gap-4">
      {aggregateOnly && (
        <Measures>
          <NA>
            Your role sees anonymised clinical throughput only. Record-level clinical detail is
            limited to Clinical Leads within their supervisory scope.
          </NA>
        </Measures>
      )}
      <KpiGrid>
        <Kpi icon={ClipboardList} r={c.run("assessment-backlog")} />
        <Kpi icon={Clock} r={c.run("overdue-notes")} />
        <Kpi icon={FileInput} r={c.run("reports-due")} />
        <Kpi icon={Activity} r={c.run("assessment-turnaround")} />
      </KpiGrid>
      <Charts cols="xl:grid-cols-2">
        <Card
          title="Assessment stages"
          sub="All assessments · one assessment over several visits counts once"
          icon={ClipboardList}
        >
          {stages.length ? (
            <BarList
              label="Assessment stages"
              data={stages.map(([k, v], i) => ({
                id: k,
                label: k,
                value: v,
                colour: series[i % series.length] as string,
              }))}
              labelWidth={140}
            />
          ) : (
            <NA>No assessments match.</NA>
          )}
        </Card>
        <Card
          title="Treatment plan reviews"
          sub={
            <span className="inline-flex items-center gap-2">
              Review due date against today <RuleMark />
            </span>
          }
          icon={HeartPulse}
        >
          {reviews.length ? (
            <BarList
              label="Plan reviews"
              data={reviews.map(([k, v]) => ({
                id: k,
                label: k,
                value: v,
                colour: k === "Review overdue" ? colour.over : colour.series1,
              }))}
              labelWidth={140}
            />
          ) : (
            <NA>
              No active treatment plans. Assessment-only services never show treatment progress.
            </NA>
          )}
        </Card>
      </Charts>
      <ReportTable c={c} id="R11" />
      <ReportTable c={c} id="R12" />
      <ReportTable c={c} id="R13" />
    </div>
  );
}

/* ------------------------------------------------------------------ funding and finance */

export function FinanceTab({ c }: { c: Ctx }) {
  const end = c.f.to < c.hub.today ? c.f.to : c.hub.today;
  const open = c.facts.invoices.filter(
    (i) => ["Issued", "Part-Paid", "Disputed"].includes(i.status) && i.balance > 0,
  );
  const buckets = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "90+ days"].map((b) => ({
    b,
    v: open
      .filter((i) => ageBucket(i.dueDate, i.balance, end) === b)
      .reduce((s, i) => s + i.balance, 0),
  }));
  const months = bucketsIn(c.f.from, c.f.to < c.hub.today ? c.f.to : c.hub.today, "Month");
  const money = months.map((m) => ({
    x: bucketLabel(m, "Month"),
    issued: Math.round(
      c.facts.invoices
        .filter(
          (i) =>
            i.issuedAt &&
            dayKey(i.issuedAt).startsWith(m) &&
            !["Draft", "Pending Approval", "Approved", "Voided"].includes(i.status),
        )
        .reduce((s, i) => s + i.gross - i.credits, 0),
    ),
    cash: Math.round(
      c.facts.payments
        .filter((p) => p.status !== "Reversed" && p.receivedOn.startsWith(m))
        .reduce((s, p) => s + p.amount - p.refunded, 0),
    ),
  }));
  const routes = new Map<string, number>();
  for (const i of c.facts.invoices.filter(
    (x) => x.issuedAt && inRange(x.issuedAt, c.f.from, c.f.to),
  ))
    routes.set(i.path, (routes.get(i.path) ?? 0) + i.gross - i.credits);
  const gross = c.facts.invoices.filter(
    (i) =>
      i.issuedAt &&
      inRange(i.issuedAt, c.f.from, c.f.to) &&
      !["Draft", "Pending Approval", "Approved", "Voided"].includes(i.status),
  );
  const mixed = new Set(c.facts.invoices.map((i) => `${i.participantId}|${i.path}`));
  const mixedPeople = [...new Set(c.facts.invoices.map((i) => i.participantId))].filter(
    (p) => [...mixed].filter((k) => k.startsWith(p)).length > 1,
  ).length;
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi icon={Receipt} r={c.run("draft-invoices")} />
        <Kpi icon={Wallet} r={c.run("issued-revenue")} />
        <Kpi icon={Landmark} r={c.run("payments-received")} />
        <Kpi icon={Activity} r={c.run("outstanding")} />
        <Kpi icon={ShieldAlert} r={c.run("overdue-receivables")} />
        <Kpi icon={ClipboardList} r={c.run("funding-exceptions")} />
      </KpiGrid>
      <Measures>
        <div className="grid gap-3 rounded-card border border-border bg-surface p-4 text-small sm:grid-cols-4">
          {[
            ["Gross invoiced", gross.reduce((s, i) => s + i.gross, 0)],
            ["Credits", gross.reduce((s, i) => s + i.credits, 0)],
            ["Net invoiced", gross.reduce((s, i) => s + i.gross - i.credits, 0)],
            ["Paid on these invoices", gross.reduce((s, i) => s + i.paid, 0)],
          ].map(([k, v]) => (
            <div key={k as string}>
              <p className="label-caps text-ink-500">{k}</p>
              <p className="mt-1 text-section font-semibold text-ink-900">
                {formatValue(v as number, "AUD")}
              </p>
            </div>
          ))}
          <p className="text-caption text-ink-500 sm:col-span-4">
            Issued in the period, AUD. Issued revenue is accrual; payments received is cash on its
            receipt date. They are never added together.
          </p>
        </div>
      </Measures>
      <Charts cols="xl:grid-cols-[2fr_1fr]">
        <Card
          title="Issued revenue (net) and cash received"
          sub="By month · issue date vs receipt date"
          icon={Wallet}
        >
          <TrendChart
            label="Revenue and cash"
            data={money}
            xKey="x"
            series={[
              {
                key: "issued",
                label: "Issued (net, accrual)",
                colour: colour.series1,
                kind: "area",
              },
              { key: "cash", label: "Cash received", colour: colour.series2 },
            ]}
            format={(v) => compactAud(v)}
            height={240}
          />
        </Card>
        <Card
          title="Payer routes"
          sub={`Net issued in the period · ${mixedPeople} participant${mixedPeople === 1 ? "" : "s"} with mixed funding, split by route`}
          icon={Landmark}
        >
          {routes.size ? (
            <DonutChart
              label="Payer routes"
              slices={[...routes].map(([k, v], i) => ({
                id: k,
                label: k,
                value: Math.round(v),
                colour: series[i % series.length] as string,
              }))}
              centre={formatValue(
                [...routes.values()].reduce((s, v) => s + v, 0),
                "AUD",
              )}
              centreCaption="net issued"
              format={(v) => formatValue(v, "AUD")}
            />
          ) : (
            <NA>No invoices issued in the period.</NA>
          )}
        </Card>
      </Charts>
      <Measures>
        <Card
          title="Receivables ageing"
          sub={`Open balances at ${end} · counted from the due date`}
          icon={Clock}
        >
          <BarList
            label="Ageing"
            data={buckets.map((x, i) => ({
              id: x.b,
              label: x.b,
              value: Math.round(x.v),
              colour: i === 0 ? colour.series1 : i < 3 ? colour.watch : colour.over,
            }))}
            format={(v) => formatValue(v, "AUD")}
            labelWidth={120}
          />
        </Card>
      </Measures>
      <ReportTable c={c} id="R14" />
      <ReportTable c={c} id="R15" />
      <ReportTable c={c} id="R16" />
      <ReportTable c={c} id="R17" />
    </div>
  );
}

/* ------------------------------------------------------------------ telehealth operations */

export function TelehealthTab({ c }: { c: Ctx }) {
  const inR = c.facts.telehealth.filter((t) => inRange(t.start, c.f.from, c.f.to));
  const attempts = count(inR, (t) => t.attempt);
  const consent = count(
    inR.filter((t) => t.attempt === "Joined"),
    (t) => t.recordingConsent,
  );
  const recorded = inR.filter((t) => t.recorded).length;
  const access = inR.reduce((s, t) => s + t.restrictedAccessEvents, 0);
  return (
    <div className="flex flex-col gap-4">
      <Measures>
        <NA>
          Telehealth reports read session metadata only: attempts, connection events and consent
          status. Recordings can&apos;t be played from Reports; playback needs separate clinical
          authority.
        </NA>
      </Measures>
      <KpiGrid>
        <Kpi icon={Video} r={c.run("telehealth-adoption")} />
        <Kpi icon={ShieldAlert} r={c.run("tech-failure")} />
        <article className="rounded-card border border-border bg-surface p-4">
          <h3 className="text-small font-semibold text-ink-900">Recorded sessions</h3>
          <p className="mt-2 type-display text-h2 text-ink-900">{recorded}</p>
          <p className="mt-1 text-caption text-ink-500">
            sessions · only with consent; a session without consent is never recorded
          </p>
        </article>
        <article className="rounded-card border border-border bg-surface p-4">
          <h3 className="text-small font-semibold text-ink-900">Restricted access events</h3>
          <p className="mt-2 type-display text-h2 text-ink-900">{access}</p>
          <p className="mt-1 text-caption text-ink-500">
            audited recording access by authorised clinicians
          </p>
        </article>
      </KpiGrid>
      <Charts cols="xl:grid-cols-2">
        <Card title="Attempt outcomes" sub="Telehealth appointments in the period" icon={Video}>
          {attempts.length ? (
            <BarList
              label="Attempts"
              data={attempts.map(([k, v]) => ({
                id: k,
                label: k,
                value: v,
                colour:
                  k === "Technical failure"
                    ? colour.over
                    : k === "Joined"
                      ? colour.series1
                      : colour.stone,
              }))}
              labelWidth={140}
            />
          ) : (
            <NA>No telehealth appointments in the period.</NA>
          )}
        </Card>
        <Card
          title="Recording consent"
          sub="Joined sessions · consent recorded at the start"
          icon={ShieldAlert}
        >
          {consent.length ? (
            <DonutChart
              label="Recording consent"
              slices={consent.map(([k, v], i) => ({
                id: k,
                label: k,
                value: v,
                colour: series[i % series.length] as string,
              }))}
              centre={consent.reduce((s, [, v]) => s + v, 0)}
              centreCaption="joined"
            />
          ) : (
            <NA>No joined sessions in the period.</NA>
          )}
        </Card>
      </Charts>
      <ReportTable c={c} id="R10" />
    </div>
  );
}
