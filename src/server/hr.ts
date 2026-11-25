import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { StaffRole } from "@/lib/live/catalogue";
import type { CredentialAlertKind, CredentialAlertsDto, CredentialRowDto } from "@/lib/live/hr";
import { AuthError } from "./auth";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type { StaffDoc, TherapistDoc, UserDoc } from "./models";
import { photoUrl } from "./photos";
import { credentialState, ensureStaff, today } from "./staff";

/*
 * People and HR, credential alerts: every staff credential in one register, with the ones that
 * need action first. Expiry windows and the booking stop are rules; a person requests renewals and
 * verifies what comes back on the staff record.
 */

export const HR_ROLES: StaffRole[] = ["Super Admin", "Clinical Lead", "Operations Manager"];
const DAY_MS = 86_400_000;

export function requireHr(u: UserDoc) {
  if (u.role !== "admin" || !(u.staffRoles ?? []).some((r) => HR_ROLES.includes(r))) {
    throw new AuthError(403);
  }
}

type Credential = StaffDoc["credentials"][number];

const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );

function alertFor(c: Credential, on: string, daysLeft: number | null): CredentialAlertKind | null {
  const state = credentialState(c, on);
  if (state === "Expired") return "Expired";
  if (state === "Rejected") return "Rejected";
  if (state === "Awaiting Review" || state === "Under Review") return "Awaiting review";
  if (state === "Not Submitted") return c.required ? "Not submitted" : null;
  if (daysLeft === null) return null;
  if (daysLeft <= 30) return "Expires within 30 days";
  if (daysLeft <= 60) return "Expires within 60 days";
  if (daysLeft <= 90) return "Expires within 90 days";
  return null;
}

/** Most urgent first: what already stops bookings, then by how soon it expires. */
const urgency: Record<CredentialAlertKind, number> = {
  Expired: 0,
  "Not submitted": 1,
  Rejected: 2,
  "Expires within 30 days": 3,
  "Awaiting review": 4,
  "Expires within 60 days": 5,
  "Expires within 90 days": 6,
};

export async function credentialAlerts(me: UserDoc): Promise<CredentialAlertsDto> {
  requireHr(me);
  const { therapists, appointments, db } = await collections();
  const on = today();
  const raw = await therapists.find({ "staff.status": { $ne: "Archived" } }).toArray();
  const team: TherapistDoc[] = await Promise.all(raw.map((t) => ensureStaff(db, t)));
  const upcoming = await appointments
    .find(
      {
        therapistId: { $in: team.map((t) => t._id) },
        status: { $in: ["booked", "tentative"] },
        start: { $gte: new Date() },
      },
      { projection: { therapistId: 1, start: 1 } },
    )
    .toArray();
  const visitsOf = new Map<string, Date[]>();
  for (const v of upcoming) {
    const k = v.therapistId.toHexString();
    visitsOf.set(k, [...(visitsOf.get(k) ?? []), v.start]);
  }

  const rows: CredentialRowDto[] = [];
  let compliant = 0;
  let blockedStaff = 0;
  for (const t of team) {
    const s = t.staff;
    if (!s) continue;
    const visits = visitsOf.get(t._id.toHexString()) ?? [];
    let blocked = false;
    for (const c of s.credentials) {
      const daysLeft = c.expiry ? daysBetween(on, c.expiry) : null;
      const status = credentialState(c, on);
      const alert = alertFor(c, on, daysLeft);
      const blocksBookings = c.required && status !== "Verified";
      if (blocksBookings) blocked = true;
      // Visits from the expiry day on can't go ahead unless the renewal is verified first.
      const expiryStart = c.expiry ? new Date(`${c.expiry}T00:00:00+10:00`) : null;
      const visitsAfterExpiry =
        c.required && expiryStart
          ? visits.filter((d) => d.getTime() >= expiryStart.getTime()).length
          : 0;
      rows.push({
        key: `${t._id.toHexString()}:${c.id}`,
        staffId: t._id.toHexString(),
        staffName: t.name,
        photoUrl: photoUrl("therapist", t._id, t.photoAt),
        discipline: t.discipline,
        region: t.region,
        staffStatus: s.status,
        credentialId: c.id,
        kind: c.kind,
        name: c.name,
        body: c.body,
        number: c.number,
        expiry: c.expiry,
        status,
        required: c.required,
        daysLeft,
        alert,
        blocksBookings,
        visitsAfterExpiry: alert ? visitsAfterExpiry : 0,
        activePatients: t.activeClients,
        renewal: c.renewal
          ? { requestedAt: c.renewal.requestedAt.toISOString(), byName: c.renewal.byName }
          : null,
      });
    }
    if (blocked) blockedStaff += 1;
    else compliant += 1;
  }
  rows.sort((a, b) => {
    const ua = a.alert ? urgency[a.alert] : 99;
    const ub = b.alert ? urgency[b.alert] : 99;
    return (
      ua - ub ||
      (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) ||
      a.staffName.localeCompare(b.staffName)
    );
  });
  const alerts = rows.filter((r) => r.alert);
  return {
    today: on,
    summary: {
      staff: team.length,
      compliant,
      expired: alerts.filter((r) => r.alert === "Expired").length,
      within30: alerts.filter((r) => r.alert === "Expires within 30 days").length,
      within90: alerts.filter((r) => r.alert?.startsWith("Expires within")).length,
      review: alerts.filter((r) => r.alert === "Awaiting review").length,
      blockedStaff,
      visitsAtRisk: alerts.reduce((n, r) => n + r.visitsAfterExpiry, 0),
    },
    rows,
  };
}

export const renewalSchema = z.object({
  staffId: z.string().min(1),
  credentialId: z.string().min(1),
});

/** Asks the clinician for the renewed credential. They upload it from My profile. */
export async function requestRenewal(me: UserDoc, input: z.infer<typeof renewalSchema>) {
  requireHr(me);
  if (!ObjectId.isValid(input.staffId)) throw new UserFacingError("Staff member not found.", 404);
  const { therapists } = await collections();
  const id = new ObjectId(input.staffId);
  const t = await therapists.findOne({ _id: id });
  const c = t?.staff?.credentials.find((x) => x.id === input.credentialId);
  if (!t || !c) throw new UserFacingError("Credential not found.", 404);
  const requestedAt = new Date();
  await therapists.updateOne(
    { _id: id, "staff.credentials.id": c.id },
    { $set: { "staff.credentials.$.renewal": { requestedAt, byName: me.name } } },
  );
  const on = today();
  const daysLeft = c.expiry ? daysBetween(on, c.expiry) : null;
  const when =
    daysLeft === null
      ? "is needed"
      : daysLeft < 0
        ? `expired ${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"} ago`
        : daysLeft === 0
          ? "expires today"
          : `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  await notify([t.userId], {
    title: `Please renew your ${c.name}`,
    body: `Your ${c.name} ${when}. Upload the renewed document in My profile so it can be verified.`,
    href: "/profile?tab=credentials",
  });
  await audit(me, `Requested renewal of ${c.name} from ${t.name}`, null);
  await publish(await adminIds(), "care", {});
  return { name: t.name, credential: c.name };
}
