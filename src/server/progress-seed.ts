import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import {
  reportTemplates,
  type EpisodeState,
  type ReportState,
  type ReportType,
} from "@/lib/live/progress";
import { collections } from "./db";
import {
  DISCHARGE_ITEMS,
  episodeKey,
  nextRef,
  stores,
  type EpisodeDoc,
  type OutcomeDoc,
  type ReportDoc,
} from "./progress";

/*
 * Module 16 sample data: an episode for every assigned service, outcome histories built from the
 * treatment-plan goals, the specification's demonstration scenarios, and reports in every state.
 * Created once (settings flag "m16Seed"). All values are fictional and illustrative.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

const DAY = 86_400_000;
const unitMap: Record<string, string> = {
  m: "m",
  s: "sec",
  min: "min",
  degrees: "degrees",
  "times/week": "repetitions",
  reps: "repetitions",
  "%": "%",
};

let inFlight: Promise<void> | null = null;

/** Parallel first requests share one seeding run instead of racing on the same ids. */
export function ensureProgressSeed() {
  inFlight ??= seedOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function seedOnce() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m16Seed" })) return;
  const s = await stores();
  const rand = rng(1616);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)] as T;
  const now = Date.now();
  const ther = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const tName = (id: ObjectId | null | undefined) =>
    ther.find((t) => id && t._id.equals(id))?.name ?? "Treating clinician";
  const clients = await db.clients.find({ "needs.therapistId": { $ne: null } }).toArray();
  const plans = await db.plans
    .find({ clientId: { $in: clients.map((c) => c._id) } })
    .sort({ version: -1 })
    .toArray();
  const exts = await db.db
    .collection<{
      _id: ObjectId;
      goals?: Record<
        string,
        { title?: string; unit?: string; direction?: string; type?: string; category?: string }
      >;
    }>("planExt")
    .find({ _id: { $in: plans.map((p) => p._id) } })
    .toArray();
  const assessed = new Set(
    (await db.assessments.find({}, { projection: { clientId: 1, needId: 1 } }).toArray()).map(
      (a) => `${a.clientId.toHexString()}.${a.needId}`,
    ),
  );

  const outcomes: OutcomeDoc[] = [];
  const episodes: EpisodeDoc[] = [];
  const reports: ReportDoc[] = [];

  const obs = async (
    o: Partial<OutcomeDoc> &
      Pick<
        OutcomeDoc,
        "clientId" | "needId" | "domain" | "raw" | "unit" | "date" | "method" | "assessor"
      >,
  ): Promise<OutcomeDoc> => ({
    _id: new ObjectId(),
    ref: await nextRef("outcome"),
    goalId: null,
    instrument: "",
    licensed: false,
    planned: false,
    setting: "Home",
    conditions: "",
    source: "Observed",
    sourceLink: null,
    status: "Verified",
    notAssessable: "",
    interpretation: "",
    history: [],
    seeded: true,
    ...o,
  });

  for (const c of clients) {
    for (const n of c.needs.filter((x) => x.therapistId)) {
      const key = episodeKey(c._id, n.id);
      const plan =
        plans.find(
          (p) =>
            p.clientId.equals(c._id) &&
            p.needId === n.id &&
            ["Active", "Under Review", "Completed"].includes(String(p.status)),
        ) ?? plans.find((p) => p.clientId.equals(c._id) && p.needId === n.id);
      const ext = plan ? exts.find((x) => x._id.equals(plan._id)) : undefined;
      const by = tName(n.therapistId);
      let state: EpisodeState = plan
        ? "Active Treatment"
        : assessed.has(key)
          ? "Assessment Only"
          : "Active Treatment";
      if (plan && rand() < 0.08) state = "Paused";
      if (plan && rand() < 0.1) state = "Under Review";

      /* Outcome histories from the plan's goals: same method throughout unless noted. */
      for (const g of plan?.goals ?? []) {
        const x = ext?.goals?.[g.id];
        const unit = unitMap[x?.unit ?? ""] ?? (x?.unit ? "scale-specific" : "none");
        const numeric =
          !Number.isNaN(Number(g.baseline)) && g.baseline !== "" && !Number.isNaN(Number(g.target));
        const method =
          unit === "m" || unit === "sec"
            ? "Timed Test"
            : numeric
              ? "Direct Observation"
              : "Direct Observation";
        const setting = pick(["Home", "Home", "Community", "School", "Telehealth"]);
        const steps = 2 + Math.floor(rand() * 3);
        for (let i = 0; i <= steps; i++) {
          const day = now - (84 - i * Math.floor(70 / steps)) * DAY;
          let raw = g.baseline;
          if (numeric) {
            const b = Number(g.baseline);
            const t = Number(g.target);
            const frac = Math.min(1, (i / steps) * (0.55 + rand() * 0.5));
            raw = String(Math.round((b + (t - b) * frac) * 10) / 10);
          } else if (i > 0) {
            raw = i === steps ? g.current || g.target || g.baseline : g.baseline;
          }
          if (!raw) continue;
          outcomes.push(
            await obs({
              clientId: c._id,
              needId: n.id,
              goalId: g.id,
              domain: x?.category ?? g.domain ?? "Self-Care",
              method,
              raw,
              unit,
              date: new Date(day),
              setting,
              conditions: unit === "m" ? "Four-wheeled walker, flat path" : "Usual set-up",
              source: i === 1 && rand() < 0.25 ? "Carer Reported" : "Observed",
              sourceLink:
                i === 0
                  ? { label: "Signed assessment", href: `/therapist/assessments` }
                  : { label: "Signed session note", href: `/therapist/sessions` },
              status: i === steps && rand() < 0.2 ? "Pending Review" : "Verified",
              assessor: by,
            }),
          );
        }
      }

      const reviewDue = new Date(now + (Math.floor(rand() * 50) - 12) * DAY);
      const ep: EpisodeDoc = {
        _id: key,
        clientId: c._id,
        needId: n.id,
        state,
        reviewDue,
        goalStatus: {},
        revisions: {},
        reviews: [],
        discharge: null,
        timeline: [
          {
            at: new Date(now - 90 * DAY),
            by,
            action: `Episode opened: ${n.discipline}`,
            reason: "",
          },
        ],
        seeded: true,
      };
      if (plan && rand() < 0.35) {
        const done = rand() < 0.6;
        ep.reviews.push({
          id: randomUUID(),
          trigger: pick(["Scheduled", "Funding Review", "Goal Reached"]),
          reason: "Planned review of goals",
          state: done ? "Finalised" : "In Progress",
          domains: ["Self-Care", "Mobility"],
          items: done
            ? [
                {
                  domain: "Self-Care",
                  result: "Showering with supervision; needs prompts to sequence.",
                  method: "Direct Observation",
                  source: "Observed",
                  setting: "Home",
                  notAssessed: "",
                },
                {
                  domain: "Mobility",
                  result: "Transfers with stand-by supervision.",
                  method: "Direct Observation",
                  source: "Observed",
                  setting: "Home",
                  notAssessed: "",
                },
              ]
            : [
                {
                  domain: "Self-Care",
                  result: "Observed at home; continuing next visit.",
                  method: "Direct Observation",
                  source: "Observed",
                  setting: "Home",
                  notAssessed: "",
                },
              ],
          visits: [{ setting: "Home", at: new Date(now - 20 * DAY) }],
          interpretation: done ? "Progress toward self-care goals; continue the current plan." : "",
          outcome: done ? "Continue" : "",
          signed: done ? { by, at: new Date(now - 18 * DAY) } : null,
          dueAt: new Date(now - 6 * DAY),
        });
      }
      episodes.push(ep);

      /* Reports in every state. */
      if (rand() < 0.62) {
        const type: ReportType =
          !plan && assessed.has(key)
            ? "FCA report"
            : pick([
                "NDIS therapy progress report",
                "Discipline progress report",
                "Reassessment report",
                "NDIS therapy progress report",
              ]);
        const status: ReportState = pick([
          "Requested",
          "Draft",
          "Draft",
          "In Review",
          "Signed",
          "Released",
          "Released",
          "Changes Requested",
        ]);
        const signed = ["Signed", "Released", "In Review"].includes(status);
        reports.push({
          _id: new ObjectId(),
          ref: await nextRef("report"),
          episodeId: key,
          clientId: c._id,
          needId: n.id,
          therapistId: n.therapistId as ObjectId,
          type,
          purpose:
            type === "FCA report"
              ? "NDIS Review"
              : pick(["NDIS Review", "Treating Team", "Participant"]),
          periodStart: new Date(now - 84 * DAY).toISOString().slice(0, 10),
          periodEnd: new Date(now - 2 * DAY).toISOString().slice(0, 10),
          status,
          version: 1,
          supersedes: null,
          sections: reportTemplates[type].map((sec) => ({
            ...sec,
            text:
              status === "Requested"
                ? ""
                : `Documented from verified outcomes and signed notes for the period (illustrative).`,
            origin: status === "Draft" && rand() < 0.5 ? ("ai" as const) : ("clinician" as const),
            state: status === "Draft" && rand() < 0.5 ? "pending" : "accepted",
            cites: ["E1"],
          })),
          limitations: "Community domains not observed this period.",
          gaps: [],
          coSignRequired: status === "In Review",
          coSign: {
            status: status === "In Review" ? "Pending" : "Not required",
            by: "",
            note: "",
            at: null,
          },
          signed: signed ? { by, at: new Date(now - 4 * DAY) } : null,
          releases:
            status === "Released"
              ? [
                  {
                    recipient: "Participant",
                    name: c.name,
                    at: new Date(now - 3 * DAY),
                    version: 1,
                    channel: "Patient app",
                  },
                ]
              : [],
          dueAt: new Date(now + (Math.floor(rand() * 30) - 8) * DAY),
          requestedBy: pick(["Jo Marsh", "Sam Rivera", by]),
          timeline: [
            {
              at: new Date(now - 30 * DAY),
              by: "Jo Marsh",
              action: "Report requested",
              reason: "",
            },
          ],
          createdAt: new Date(now - 30 * DAY),
          seeded: true,
        });
      }
    }
  }

  /* Scenario overlays (section 15). */
  const find = (name: string, discipline: string) => {
    const c = clients.find((x) => x.name === name);
    const n = c?.needs.find((x) => x.discipline === discipline && x.therapistId);
    return c && n ? { c, n, key: episodeKey(c._id, n.id) } : null;
  };
  const priya = find("Priya Shah", "Physiotherapy");
  if (priya) {
    const plan = plans.find((p) => p.clientId.equals(priya.c._id) && p.needId === priya.n.id);
    const g = plan?.goals[0];
    for (let i = outcomes.length - 1; i >= 0; i--)
      if (outcomes[i]?.clientId.equals(priya.c._id) && outcomes[i]?.needId === priya.n.id)
        outcomes.splice(i, 1);
    for (const [i, v] of [100, 140, 175, 220].entries())
      outcomes.push(
        await obs({
          clientId: priya.c._id,
          needId: priya.n.id,
          goalId: g?.id ?? null,
          domain: "Mobility",
          method: "Timed Test",
          raw: String(v),
          unit: "m",
          date: new Date(now - (80 - i * 24) * DAY),
          setting: "Community",
          conditions: "Six-minute walk, four-wheeled walker, flat path",
          assessor: tName(priya.n.therapistId),
        }),
      );
  }
  const lachlan = find("Lachlan O'Brien", "Occupational Therapy");
  if (lachlan) {
    const ep = episodes.find((e) => e._id === lachlan.key);
    const plan = plans.find(
      (p) =>
        p.clientId.equals(lachlan.c._id) &&
        p.needId === lachlan.n.id &&
        String(p.status) === "Active",
    );
    const g = plan?.goals[1] ?? plan?.goals[0];
    if (ep && g) {
      ep.goalStatus[g.id] = {
        status: "Declining",
        by: "Sarah Thompson",
        at: new Date(now - 5 * DAY),
      };
      ep.revisions[g.id] = [
        {
          at: new Date(now - 5 * DAY),
          by: "Sarah Thompson",
          from: "2",
          to: "1",
          reason:
            "Goal not achieved: support worker availability changed; target reduced and approach changed to accompanied outings.",
        },
      ];
      ep.state = "Under Review";
    }
  }
  const mia = find("Mia Tan", "Speech Pathology");
  if (mia) {
    outcomes.push(
      await obs({
        clientId: mia.c._id,
        needId: mia.n.id,
        domain: "Communication",
        method: "Third-Party Report",
        raw: "More two-word requests at lunch",
        unit: "none",
        date: new Date(now - 9 * DAY),
        setting: "School",
        source: "Carer Reported",
        conditions: "Teacher report",
        assessor: tName(mia.n.therapistId),
      }),
    );
    outcomes.push(
      await obs({
        clientId: mia.c._id,
        needId: mia.n.id,
        domain: "Communication",
        method: "Direct Observation",
        raw: "7",
        unit: "repetitions",
        date: new Date(now - 8 * DAY),
        setting: "School",
        conditions: "Morning tea, visual cue cards",
        assessor: tName(mia.n.therapistId),
      }),
    );
  }
  const isabella = find("Isabella Kowalski", "Occupational Therapy");
  if (isabella) {
    const ep = episodes.find((e) => e._id === isabella.key);
    if (ep) ep.state = "Assessment Only";
    if (!reports.some((r) => r.episodeId === isabella.key && r.type === "FCA report"))
      reports.push({
        _id: new ObjectId(),
        ref: await nextRef("report"),
        episodeId: isabella.key,
        clientId: isabella.c._id,
        needId: isabella.n.id,
        therapistId: isabella.n.therapistId as ObjectId,
        type: "FCA report",
        purpose: "NDIS Review",
        periodStart: new Date(now - 40 * DAY).toISOString().slice(0, 10),
        periodEnd: new Date(now - 1 * DAY).toISOString().slice(0, 10),
        status: "Requested",
        version: 1,
        supersedes: null,
        sections: reportTemplates["FCA report"].map((sec) => ({
          ...sec,
          text: "",
          origin: "clinician" as const,
          state: "clinician",
          cites: [],
        })),
        limitations: "",
        gaps: [],
        coSignRequired: false,
        coSign: { status: "Not required", by: "", note: "", at: null },
        signed: null,
        releases: [],
        dueAt: new Date(now + 6 * DAY),
        requestedBy: "Jo Marsh",
        timeline: [
          {
            at: new Date(now - 3 * DAY),
            by: "Jo Marsh",
            action: "Report requested (NDIS Review)",
            reason: "",
          },
        ],
        createdAt: new Date(now - 3 * DAY),
        seeded: true,
      });
  }
  const matilda = find("Matilda Singh", "Occupational Therapy");
  if (matilda) {
    const ep = episodes.find((e) => e._id === matilda.key);
    if (ep) {
      ep.state = "Discharged";
      ep.discharge = {
        outcome: "Goals met for kitchen safety and meal preparation.",
        reason: "Goals met",
        followUp: "Referral to community program; review if circumstances change.",
        exceptions: "",
        checklist: Object.fromEntries(DISCHARGE_ITEMS.map((i) => [i, i !== "Billing reconciled"])),
        signed: { by: tName(matilda.n.therapistId), at: new Date(now - 6 * DAY) },
      };
    }
  }

  if (outcomes.length) await s.outcomes.insertMany(outcomes, { ordered: false });
  if (episodes.length) await s.episodes.insertMany(episodes, { ordered: false });
  if (reports.length) await s.reports.insertMany(reports, { ordered: false });
  await flags.updateOne({ _id: "m16Seed" }, { $set: { at: new Date() } }, { upsert: true });
}
