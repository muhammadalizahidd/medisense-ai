import "server-only";
import { supportInfo, type Support } from "@/lib/live/catalogue";
import {
  confidentialDisciplines,
  dayKey,
  emptyFacts,
  scopeFor,
  type AppointmentFact,
  type AppointmentMode,
  type ManagementMode,
  type ReportFacts,
  type ReportScope,
  type ServiceSetting,
} from "@/lib/live/reports";
import { collections } from "./db";
import { invoiceTotals } from "./finance";
import type { ClientDoc, UserDoc } from "./models";
import { reportSettings, type ReportSettings } from "./report-settings";
import { canSee, opsCan } from "./operations";

/**
 * Module 09: every report reads the same records the owning modules write (section 14). Facts
 * are cut to the viewer's scope here, on the server, so nothing outside it reaches the browser.
 */

export const reportScope = (u: UserDoc): ReportScope => scopeFor(u.staffRoles ?? [], u.role);

const DAY = 86_400_000;
/** Breaks, training and admin taken out of rostered time before utilisation (AT-21). */
export const NON_CLINICAL_SHARE = 0.15;

function ageAt(dob: string | null, at: Date) {
  if (!dob) return null;
  const b = new Date(`${dob}T00:00:00Z`);
  let a = at.getUTCFullYear() - b.getUTCFullYear();
  const m = at.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

/** Service settings may overlap: a child on NDIS is in NDIS and Paediatrics (section 3). */
export function settingsOf(funding: string, dob: string | null, at = new Date()): ServiceSetting[] {
  const out: ServiceSetting[] = [];
  if (funding === "NDIS") out.push("NDIS");
  else if (funding === "Aged Care") out.push("Aged Care");
  else if (funding === "Workers Compensation") out.push("Workers Compensation");
  else out.push("Private/Other");
  const age = ageAt(dob, at);
  if (age !== null && age < 18) out.push("Early Childhood/Paediatrics");
  return out;
}

const modeOf = (loc: string | null | undefined, modality?: string): AppointmentMode => {
  if (modality === "Telehealth" || loc === "Telehealth") return "Telehealth";
  if (loc === "School" || loc === "Daycare" || loc === "Day Program") return loc;
  if (loc === "Other community location") return "Community";
  return "Home";
};

const managementOf = (
  planType: string | null | undefined,
  funding: string,
): ManagementMode | null => {
  if (funding !== "NDIS") return "Other payer";
  if (planType === "Agency Managed" || planType === "Plan Managed" || planType === "Self-Managed")
    return planType;
  return null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function loadFacts(user: UserDoc) {
  const scope = reportScope(user);
  const db = await collections();
  const has = (...d: string[]) => d.some((x) => (scope.domains as string[]).includes(x));
  const now = new Date();
  const today = dayKey(now);
  const facts: ReportFacts = emptyFacts();
  // Section 8: a therapist's reports cover their own caseload and nothing else.
  const own = user.role === "therapist" ? user.therapistId : null;
  if (user.role === "therapist" && !own) return emptyLoad(scope, now, await reportSettings());
  const none = <T>(v: T) => Promise.resolve(v);
  // Every query starts at once: none depends on another, and each round trip costs time.
  const q = {
    referrals: has("Referrals")
      ? db.referrals
          .find(
            {},
            {
              projection: {
                trackingHash: 0,
                access: 0,
                "data.clinical": 0,
                "data.goals": 0,
                "data.comments": 0,
                duplicates: 0,
              },
            },
          )
          .toArray()
      : none([]),
    clinical: has("Clinical Operations")
      ? Promise.all([
          db.assessments
            .find(own ? { therapistId: own } : {}, {
              projection: {
                sections: 0,
                activities: 0,
                findings: 0,
                limitations: 0,
                amendments: 0,
              },
            })
            .toArray(),
          db.plans
            .find(own ? { therapistId: own } : {}, {
              projection: { indication: 0, interventions: 0, precautions: 0, progressSummary: 0 },
            })
            .toArray(),
        ])
      : none([[], []] as const),
    tele: has("Telehealth")
      ? db.telehealth.find({}, { projection: { transcript: 0, tokenHash: 0 } }).toArray()
      : none([]),
    finance: has("Finance")
      ? Promise.all([
          db.invoices.find({}).toArray(),
          db.payments.find({}).toArray(),
          db.fundingPlans
            .find(
              { status: { $in: ["Draft", "Active"] } },
              { projection: { evidence: 0, reported: 0, fields: 0 } },
            )
            .toArray(),
          db.referrals
            .find(
              { "fundingReview.verification": "Exception" },
              {
                projection: {
                  reference: 1,
                  fundingReview: 1,
                  clientId: 1,
                  data: 1,
                  owner: 1,
                  updatedAt: 1,
                },
              },
            )
            .toArray(),
        ])
      : none([[], [], [], []] as const),
    automation: has("Automation")
      ? Promise.all([
          db.opsTasks
            .find(
              {},
              {
                // Only the fields reports read: tasks carry long notes and histories.
                projection: {
                  ref: 1,
                  title: 1,
                  category: 1,
                  status: 1,
                  priority: 1,
                  team: 1,
                  assigneeId: 1,
                  assigneeName: 1,
                  visibility: 1,
                  dueAt: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  source: 1,
                  ruleCode: 1,
                  suggestion: 1,
                  "history.action": 1,
                },
              },
            )
            .toArray(),
          db.opsRules.find({}, { projection: { versions: 0 } }).toArray(),
          db.opsRuns
            .find({}, { projection: { ruleCode: 1, outcome: 1, resolved: 1, at: 1 } })
            .sort({ at: -1 })
            .limit(2000)
            .toArray(),
          db.opsReviews.find({}, { projection: { snapshot: 0 } }).toArray(),
          db.reportInsights.find({}).toArray(),
        ])
      : none([[], [], [], [], []] as const),
    audit: has("Audit")
      ? db.audit
          .find(
            {},
            {
              projection: {
                actorName: 1,
                action: 1,
                clientId: 1,
                referralId: 1,
                therapistId: 1,
                at: 1,
              },
            },
          )
          .sort({ at: -1 })
          .limit(1000)
          .toArray()
      : none([]),
  };
  const [settings, clients, therapists, appointments, billables] = await Promise.all([
    reportSettings(),
    db.clients
      .find(
        {},
        {
          projection: {
            name: 1,
            mrn: 1,
            funding: 1,
            dateOfBirth: 1,
            region: 1,
            createdAt: 1,
            discharged: 1,
            needs: 1,
            fundingDetails: 1,
          },
        },
      )
      .toArray(),
    db.therapists.find(own ? { _id: own } : {}, { projection: { profile: 0 } }).toArray(),
    has("Scheduling", "Staff", "Telehealth", "Clinical Operations", "Participants")
      ? db.appointments
          .find(own ? { therapistId: own } : {}, {
            // Note text, session detail and site notes never reach reports.
            projection: {
              session: 0,
              publicLink: 0,
              changeRequests: 0,
              checkIn: 0,
              feedback: 0,
              resent: 0,
              "note.text": 0,
              "note.forPatient": 0,
              "note.subjective": 0,
              "note.objective": 0,
              "note.assessment": 0,
              "note.plan": 0,
              "note.amendments": 0,
            },
          })
          .toArray()
      : none([]),
    db.billables.find({}, { projection: { history: 0 } }).toArray(),
  ]);
  // Note and report deadlines are clinical rules set in Reports settings (section 15).
  const NOTE_DUE_HOURS = settings.deadlines.noteDueHours;
  const REPORT_DUE_DAYS = settings.deadlines.reportDueDays;
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const names: Record<string, string> = Object.fromEntries(
    therapists.map((t) => [t._id.toHexString(), t.name]),
  );
  const needOf = (c: ClientDoc | undefined, needId: string | null | undefined) =>
    c?.needs.find((n) => n.id === needId);
  const confidential = (discipline: string) =>
    !scope.clinicalDetail && confidentialDisciplines.includes(discipline);
  const detailOk = (domain: string) => (scope.detail as string[]).includes(domain);
  const labelFor = (c: ClientDoc | undefined, discipline: string, domain: string) =>
    !c
      ? "Unknown participant"
      : confidential(discipline)
        ? "Restricted service"
        : detailOk(domain)
          ? c.name
          : (c.mrn ?? "Participant");

  const confirmed = new Set(
    billables
      .filter((b) => b.confirmation && b.appointmentId)
      .map((b) => b.appointmentId?.toHexString()),
  );
  const firstDelivered = new Map<string, Date>();
  for (const a of appointments)
    if (a.status === "completed" && a.needId) {
      const k = `${a.clientId.toHexString()}:${a.needId}`;
      const cur = firstDelivered.get(k);
      if (!cur || a.start < cur) firstDelivered.set(k, a.start);
    }

  if (has("Participants")) {
    facts.participants = clients.map((c) => ({
      id: c._id.toHexString(),
      mrn: c.mrn ?? "—",
      label: scope.detail.includes("Participants") ? c.name : (c.mrn ?? "Participant"),
      settings: settingsOf(c.funding, c.dateOfBirth, c.createdAt),
      region: c.region,
      createdAt: c.createdAt.toISOString(),
      dischargedAt: iso(c.discharged?.at),
      child: (ageAt(c.dateOfBirth, now) ?? 99) < 18,
      restricted: c.needs.some((n) => confidential(n.discipline)),
    }));
    facts.services = clients.flatMap((c) =>
      c.needs.map((n) => ({
        id: n.id,
        referralId: n.referralId?.toHexString() ?? null,
        participantId: c._id.toHexString(),
        label: labelFor(c, n.discipline, "Participants"),
        support: n.support,
        discipline: n.discipline,
        kind: supportInfo(n.support as Support).kind,
        status: n.status,
        therapistId: n.therapistId?.toHexString() ?? null,
        location: n.location ?? "Home",
        settings: settingsOf(c.funding, c.dateOfBirth, c.createdAt),
        requestedAt: c.createdAt.toISOString(),
        startedAt: iso(firstDelivered.get(`${c._id.toHexString()}:${n.id}`)),
        closedAt:
          n.status === "completed" ? (iso(c.discharged?.at) ?? null) : iso(c.discharged?.at),
        restricted: confidential(n.discipline),
      })),
    );
  }

  if (has("Referrals")) {
    const referrals = await q.referrals;
    facts.referrals = referrals.map((r) => {
      const accepted = r.history.find((h) => h.status === "Accepted");
      const last = r.history[r.history.length - 1];
      const contacts = r.infoRequests
        .flatMap((q) => [q.at, q.answeredAt])
        .filter((d): d is Date => Boolean(d));
      const supports = r.data.supports.map((s) => s.support);
      return {
        id: r._id.toHexString(),
        ref: r.reference,
        participantId: r.clientId?.toHexString() ?? null,
        label: `${r.data.participant.firstName} ${r.data.participant.lastName.slice(0, 1)}.`,
        submittedAt: (r.history[0]?.at ?? r.createdAt).toISOString(),
        acceptedAt: iso(accepted?.at),
        status: r.status,
        source: r.submittedBy === "staff" ? "Staff entry" : r.data.submitter.role,
        settings: settingsOf(r.data.funding.source, r.data.participant.dateOfBirth, r.createdAt),
        management: managementOf(r.data.funding.planType, r.data.funding.source),
        region: r.region ?? "Not set",
        owner: r.owner?.name ?? "Unassigned",
        supports,
        disciplines: [
          ...new Set(supports.map((s) => supportInfo(s as Support).discipline ?? "Other")),
        ],
        missing:
          r.status === "Needs Information" ||
          r.status === "Submitted" ||
          r.status === "Under Admin Review"
            ? r.gaps.map((g) => g.label)
            : [],
        lastContact: contacts.length
          ? new Date(Math.max(...contacts.map((d) => d.getTime()))).toISOString()
          : null,
        stageSince: (last?.at ?? r.updatedAt).toISOString(),
        blocked: r.status === "Needs Information" || r.fundingReview?.verification === "Exception",
        direct: r.submittedBy === "public" && !r.clientId,
      };
    });
  }

  if (has("Staff", "Scheduling")) {
    facts.clinicians = therapists.map((t) => {
      const exp = t.credentials?.registrationExpiry ?? "2099-12-31";
      const leave: string[] = [];
      for (const off of t.timeOff ?? [])
        for (
          let d = Date.parse(`${off.from}T00:00:00Z`);
          d <= Date.parse(`${off.to}T00:00:00Z`) && leave.length < 400;
          d += DAY
        )
          leave.push(new Date(d).toISOString().slice(0, 10));
      return {
        id: t._id.toHexString(),
        name: t.name,
        discipline: t.discipline,
        region: t.region,
        credential:
          exp < today
            ? "Lapsed"
            : exp < dayKey(new Date(now.getTime() + 60 * DAY))
              ? "Expiring"
              : "Current",
        weeklyMinutes: t.weekly.reduce((s, w) => s + (w.end - w.start), 0),
        leave,
        nonClinicalShare: NON_CLINICAL_SHARE,
        active: t.active !== false,
      };
    });
  }

  if (has("Scheduling", "Staff", "Telehealth", "Clinical Operations")) {
    const travel = new Map(
      billables
        .filter((b) => b.travel && b.appointmentId)
        .map((b) => [b.appointmentId?.toHexString(), b]),
    );
    facts.appointments = appointments.map((a): AppointmentFact => {
      const c = clientById.get(a.clientId.toHexString());
      const need = needOf(c, a.needId);
      const mode = modeOf(a.site?.location ?? need?.location, a.modality);
      const tb = travel.get(a._id.toHexString());
      const st = a.note ? (a.note.status ?? "Final") : "None";
      const plannedTravel = a.travelPlan;
      return {
        id: a._id.toHexString(),
        ref: a.ref ?? `APT-${a._id.toHexString().slice(-6).toUpperCase()}`,
        participantId: a.clientId.toHexString(),
        label: labelFor(c, a.discipline, "Scheduling"),
        therapistId: a.therapistId.toHexString(),
        discipline: a.discipline,
        support: need?.support ?? a.discipline,
        start: a.start.toISOString(),
        status: a.status,
        mode,
        settings: c ? settingsOf(c.funding, c.dateOfBirth, a.start) : ["Private/Other"],
        scheduledMinutes: Math.round((a.end.getTime() - a.start.getTime()) / 60_000),
        deliveredMinutes: a.checkOut?.minutes ?? null,
        verified:
          a.status === "completed" && (Boolean(a.checkOut) || confirmed.has(a._id.toHexString())),
        confirmed: Boolean(a.confirmedByPatient),
        cancelledAt: iso(a.cancellation?.at),
        cancelReason: a.cancellation?.reason ?? (a.status === "no-show" ? null : null),
        cancelledBy: a.cancellation?.by ?? null,
        late: a.status === "late-cancelled" || Boolean(a.cancellation?.chargeable),
        movedFrom: iso(a.moved?.from),
        travelBooked: mode === "Telehealth" ? null : (plannedTravel?.bookedMinutes ?? null),
        travelRecorded:
          mode === "Telehealth"
            ? null
            : (tb?.travel?.minutes ?? plannedTravel?.recordedMinutes ?? null),
        travelCharge:
          mode === "Telehealth"
            ? "Not applicable"
            : tb
              ? tb.travel?.costs || tb.travel?.minutes
                ? "Charged on agreement"
                : "Not charged"
              : (plannedTravel?.charge ?? "Not recorded"),
        noteStatus: st,
        noteDue:
          a.status === "completed"
            ? new Date(a.end.getTime() + NOTE_DUE_HOURS * 3_600_000).toISOString()
            : null,
        noteSignedAt: iso(a.note?.signedAt ?? (st === "Final" ? a.note?.at : null)),
        restricted: confidential(a.discipline),
      };
    });
  }

  if (has("Clinical Operations")) {
    const [assessments, plans] = await q.clinical;
    const anonymise = !scope.clinicalDetail;
    facts.assessments = assessments.map((a) => {
      const visits = appointments.filter(
        (x) =>
          x.clientId.equals(a.clientId) &&
          x.needId === a.needId &&
          x.status === "completed" &&
          (!a.signed || x.start <= a.signed.at),
      ).length;
      return {
        id: `ASM-${a._id.toHexString().slice(-6).toUpperCase()}`,
        participantId: anonymise ? "" : a.clientId.toHexString(),
        label: anonymise
          ? "Restricted"
          : (clientById.get(a.clientId.toHexString())?.name ?? "Participant"),
        therapistId: a.therapistId.toHexString(),
        therapist: a.therapistName,
        support: a.support,
        discipline: a.discipline,
        kind: a.kind,
        status: a.status,
        requestedAt: a.createdAt.toISOString(),
        dueAt: dayKey(new Date(a.createdAt.getTime() + REPORT_DUE_DAYS * DAY)),
        signedAt: iso(a.signed?.at),
        visits: Math.max(visits, a.status === "Draft" ? 0 : 1),
        assessmentOnly: supportInfo(a.support).kind === "assessment",
        restricted: confidential(a.discipline),
      };
    });
    facts.goalReviews = plans
      .filter((p) => ["Active", "Under Review", "Revised"].includes(p.status))
      .map((p) => {
        const c = clientById.get(p.clientId.toHexString());
        const last = p.reviews[p.reviews.length - 1];
        return {
          id: p._id.toHexString(),
          participantId: anonymise ? "" : p.clientId.toHexString(),
          label: anonymise ? "Restricted" : (c?.name ?? "Participant"),
          plan: `PLAN-${p._id.toHexString().slice(-6).toUpperCase()} v${p.version}`,
          support: p.support,
          discipline: supportInfo(p.support).discipline ?? "Other",
          status:
            p.reviewDate && p.reviewDate < today
              ? "Review overdue"
              : p.status === "Under Review"
                ? "Under review"
                : "Scheduled",
          reviewDue: p.reviewDate,
          goals: p.goals.filter((g) => g.status === "Active" || g.status === "Modified").length,
          lastReview: iso(last?.at),
          restricted: confidential(supportInfo(p.support).discipline ?? ""),
        };
      });
  }

  if (has("Telehealth")) {
    const tele = await q.tele;
    const byAppt = new Map(tele.map((t) => [t.appointmentId.toHexString(), t]));
    facts.telehealth = appointments
      .filter((a) => a.modality === "Telehealth" || byAppt.has(a._id.toHexString()))
      .map((a) => {
        const t = byAppt.get(a._id.toHexString());
        const drops = t?.events.filter((e) => /dropped|reconnect/i.test(e.text)).length ?? 0;
        const failed =
          t?.events.some((e) => /failed|couldn't connect|technical/i.test(e.text)) ?? false;
        const attempt =
          a.status === "cancelled" || a.status === "late-cancelled"
            ? "Cancelled"
            : a.status === "no-show"
              ? "Did not join"
              : failed && !t?.admittedAt
                ? "Technical failure"
                : t?.admittedAt || a.status === "completed"
                  ? "Joined"
                  : a.start > now
                    ? "Not yet"
                    : "Did not join";
        const rc = t?.consents.recording;
        return {
          appointmentId: a._id.toHexString(),
          ref: a.ref ?? a._id.toHexString().slice(-6),
          therapistId: a.therapistId.toHexString(),
          discipline: a.discipline,
          start: a.start.toISOString(),
          attempt,
          issue: failed ? "Could not connect" : drops ? "Connection dropped" : "",
          joinOutcome:
            attempt === "Joined"
              ? drops
                ? "Reconnected and completed"
                : "Completed"
              : attempt === "Technical failure"
                ? a.replaces || a.status === "rescheduled"
                  ? "Rescheduled"
                  : "Ended early"
                : attempt,
          reconnects: drops,
          recordingConsent: rc ? (rc.given ? "Given" : "Declined") : "Not asked",
          recorded: Boolean(
            t &&
            (t.recording.segments.length ||
              t.recording.status === "Available" ||
              t.recording.status === "Access Restricted"),
          ),
          restrictedAccessEvents: t?.accessLog.length ?? 0,
        };
      });
  }

  if (has("Finance")) {
    const [invoices, payments, plans, referrals] = await q.finance;
    const invNum = new Map(invoices.map((i) => [i._id.toHexString(), i.number]));
    facts.invoices = invoices.map((i) => {
      const t = invoiceTotals(i);
      const open = ["Issued", "Part-Paid", "Disputed"].includes(i.status);
      const routes = new Map<string, number>();
      for (const l of i.lines)
        routes.set(
          l.payerRoute ?? i.path ?? "Not recorded",
          (routes.get(l.payerRoute ?? i.path ?? "Not recorded") ?? 0) + l.amount,
        );
      return {
        id: i._id.toHexString(),
        number: i.number,
        participantId: i.clientId.toHexString(),
        label: clientById.get(i.clientId.toHexString())?.mrn ?? "Participant",
        path: i.path ?? (i.funding === "NDIS" ? "Not recorded" : i.funding),
        payer: i.payer,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        issuedAt: iso(i.issuedAt),
        dueDate: i.dueDate ?? null,
        gross: t.total,
        credits: t.credited,
        paid: t.paid,
        balance: open ? Math.max(0, t.balance) : 0,
        routes: [...routes].map(([route, amount]) => ({
          route,
          amount: Math.round(amount * 100) / 100,
        })),
      };
    });
    facts.payments = payments.map((p) => {
      const matched = Math.round(p.allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
      return {
        id: p._id.toHexString(),
        ref: p.ref,
        payer: p.payer,
        receivedOn: p.receivedOn,
        amount: p.amount,
        matched,
        unmatched: Math.max(0, Math.round((p.amount - matched - (p.refunded ?? 0)) * 100) / 100),
        refunded: p.refunded ?? 0,
        status: p.status,
      };
    });
    const apptRef = new Map(appointments.map((a) => [a._id.toHexString(), a.ref ?? ""]));
    facts.billables = billables.map((b) => ({
      id: b._id.toHexString(),
      ref: b.ref,
      session: b.appointmentId
        ? apptRef.get(b.appointmentId.toHexString()) || "Visit"
        : b.invoiceId
          ? `On ${invNum.get(b.invoiceId.toHexString()) ?? "invoice"}`
          : "Recorded charge",
      start: b.start.toISOString(),
      item: b.itemCode || b.itemName,
      units: b.quantity,
      route: b.payerRoute,
      path: b.path,
      state: b.status,
    }));
    for (const p of plans) {
      for (const b of p.budgets) {
        const expired = p.end && p.end < today;
        const unverified = !b.verified;
        const exception = expired
          ? "Plan expired"
          : p.status === "Draft"
            ? "Plan not yet verified"
            : unverified
              ? "Budget amount not verified"
              : b.eligibility === "Not Confirmed"
                ? "Support eligibility not confirmed"
                : "None";
        facts.funding.push({
          id: `${p.ref}:${b.id}`,
          participantId: p.clientId?.toHexString() ?? "",
          label: p.participant,
          allocation: `${p.ref} · ${b.name}`,
          management: b.management,
          period: `${p.start || "?"} to ${p.end || "?"}`,
          verification: b.verified ? "Verified" : "Not verified",
          exception,
          owner: p.history[p.history.length - 1]?.byName ?? "Finance",
          blocking: exception !== "None",
          since: p.updatedAt.toISOString(),
        });
      }
    }
    for (const r of referrals)
      facts.funding.push({
        id: r.reference,
        participantId: r.clientId?.toHexString() ?? "",
        label: `${r.data.participant.firstName} ${r.data.participant.lastName.slice(0, 1)}.`,
        allocation: `${r.reference} · referral funding`,
        management: r.data.funding.planType || "Unknown",
        period: r.data.funding.planEndDate ? `to ${r.data.funding.planEndDate}` : "Not given",
        verification: "Exception",
        exception: r.fundingReview?.exceptionReason || "Verification exception",
        owner: r.owner?.name ?? "Intake",
        blocking: true,
        since: r.updatedAt.toISOString(),
      });
    // AT-19: an NDIS participant with no confirmed plan type is an exception, never Agency Managed.
    for (const c of clients.filter(
      (x) =>
        x.funding === "NDIS" && !x.discharged && !managementOf(x.fundingDetails?.planType, "NDIS"),
    ))
      facts.funding.push({
        id: `route:${c._id.toHexString()}`,
        participantId: c._id.toHexString(),
        label: c.mrn ?? c.name,
        allocation: `${c.mrn ?? "Participant"} · payer route`,
        management: "Unknown",
        period: c.fundingDetails?.planEndDate ? `to ${c.fundingDetails.planEndDate}` : "Not given",
        verification: "Not verified",
        exception: "Payer route not confirmed",
        owner: "Finance",
        blocking: true,
        since: c.createdAt.toISOString(),
      });
  }

  if (has("Automation")) {
    const can = opsCan(user);
    const [tasks, rules, runs, reviews, insights] = await q.automation;
    facts.tasks = tasks
      .filter((t) => canSee(user, can, t))
      .map((t) => ({
        id: t._id.toHexString(),
        ref: t.ref,
        title:
          t.visibility === "Clinical Restricted" && !can.clinical
            ? "Restricted clinical task"
            : t.title,
        category: t.category,
        status: t.status,
        priority: t.priority,
        team: t.team,
        owner: t.assigneeName ?? `${t.team} team`,
        dueAt: t.dueAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        source: t.source,
        ruleCode: t.ruleCode,
      }));
    facts.rules = rules.map((r) => {
      const mine = runs.filter((x) => x.ruleCode === r.code);
      return {
        code: r.code,
        name: r.name,
        status: r.status,
        triggered: mine.length,
        successful: mine.filter((x) =>
          [
            "Task created",
            "Updated existing",
            "Message queued",
            "Escalated",
            "Closed",
            "Suggested",
            "Simulated",
          ].includes(x.outcome),
        ).length,
        failed: mine.filter((x) => x.outcome === "Error" || x.outcome === "Blocked").length,
        skipped: mine.filter((x) => x.outcome === "Duplicate skipped" || x.outcome === "Suppressed")
          .length,
        overrides: tasks.filter(
          (t) =>
            t.ruleCode === r.code &&
            t.history.some((h) => /reassigned|override|priority changed/i.test(h.action)),
        ).length,
        exceptions: mine.filter(
          (x) => !x.resolved && (x.outcome === "Error" || x.outcome === "Blocked"),
        ).length,
        lastRun: iso(mine[0]?.at),
      };
    });
    const decide = (d: string | undefined): "Accepted" | "Rejected" | "Deferred" | "Pending" =>
      d === "Accept" || d === "Correct"
        ? "Accepted"
        : d === "Reject"
          ? "Rejected"
          : d === "Request Clarification" || d === "Escalate"
            ? "Deferred"
            : "Pending";
    facts.suggestions = [
      ...reviews.flatMap((r) =>
        r.findings
          .filter((x) => x.origin === "AI")
          .map((x) => ({
            id: `${r._id.toHexString()}:${x.id}`,
            type: "Referral review finding",
            at: (x.decision?.at ?? r.aiRan ?? r.snapshotAt).toISOString(),
            decision:
              x.resolution === "Deferred" ? ("Deferred" as const) : decide(x.decision?.decision),
            minutesSaved: 4,
          })),
      ),
      ...tasks
        .filter((t) => t.source === "AI Proposed" || t.suggestion)
        .map((t) => ({
          id: t._id.toHexString(),
          type: "Proposed task",
          at: t.updatedAt.toISOString(),
          decision:
            t.status === "Cancelled"
              ? ("Rejected" as const)
              : t.suggestion
                ? ("Pending" as const)
                : t.status === "On Hold"
                  ? ("Deferred" as const)
                  : ("Accepted" as const),
          minutesSaved: 6,
        })),
      ...insights.map((i) => ({
        id: i._id,
        type: "Report insight",
        at: i.generatedAt.toISOString(),
        decision:
          i.status === "Acknowledged"
            ? ("Accepted" as const)
            : i.status === "Dismissed"
              ? ("Rejected" as const)
              : i.status === "Reviewed"
                ? ("Deferred" as const)
                : ("Pending" as const),
        minutesSaved: 10,
      })),
    ];
  }

  if (has("Audit")) {
    const rows = await q.audit;
    const moduleOf = (a: string) =>
      /^Reports:/.test(a)
        ? "Reports (M09)"
        : /^Finance|invoice|payment|claim|credit/i.test(a)
          ? "Billing (M07)"
          : /funding|plan |agreement|payer/i.test(a)
            ? "Funding (M06)"
            : /referral|intake|triage/i.test(a)
              ? "Referrals (M01)"
              : /visit|appointment|booking|schedul|cancel/i.test(a)
                ? "Scheduling (M05)"
                : /report|export/i.test(a)
                  ? "Reports (M09)"
                  : /task|rule|automation/i.test(a)
                    ? "Operations (M08)"
                    : /therapist|staff|credential/i.test(a)
                      ? "Staff (M04)"
                      : "Participants (M03)";
    facts.audit = rows.map((a) => ({
      id: a._id.toHexString(),
      at: a.at.toISOString(),
      actor: a.actorName,
      module: moduleOf(a.action),
      action: a.action.replace(/\s+/g, " ").slice(0, 160),
      target: a.clientId
        ? (clientById.get(a.clientId.toHexString())?.mrn ?? "Participant")
        : a.referralId
          ? "Referral"
          : a.therapistId
            ? "Staff record"
            : "—",
      outcome: /(denied|refused)/i.test(a.action) ? "Denied" : "Recorded",
    }));
  }

  const dates = [
    ...facts.referrals.map((r) => r.submittedAt),
    ...facts.appointments.map((a) => a.start),
    ...facts.invoices.map((i) => i.createdAt),
    ...facts.participants.map((p) => p.createdAt),
    ...facts.tasks.map((t) => t.createdAt),
  ].filter((d) => d < now.toISOString());
  const earliest = dates.length ? dayKey(dates.reduce((a, b) => (a < b ? a : b))) : today;
  const latest = dayKey(
    new Date(Math.max(now.getTime(), ...facts.appointments.map((a) => Date.parse(a.start)))),
  );
  return {
    scope,
    facts,
    names,
    today,
    now: now.toISOString(),
    earliest,
    latest,
    freshness: now.toISOString(),
    settings,
  };
}

function emptyLoad(scope: ReportScope, now: Date, settings: ReportSettings) {
  const today = dayKey(now);
  return {
    scope,
    facts: emptyFacts(),
    names: {} as Record<string, string>,
    today,
    now: now.toISOString(),
    earliest: today,
    latest: today,
    freshness: now.toISOString(),
    settings,
  };
}

export type LoadedFacts = Awaited<ReturnType<typeof loadFacts>>;
