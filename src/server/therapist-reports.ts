import "server-only";
import type { ObjectId } from "mongodb";
import type { TherapistHubDto } from "@/lib/live/report-dto";
import { AuthError } from "./auth";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit } from "./live";
import type { UserDoc } from "./models";
import { can } from "./permissions";
import { loadFacts } from "./reports";
import { listTherapists } from "./therapists";

/**
 * One therapist's reports. A therapist may only open their own. An admin needs the permission to
 * view therapist reports, and opening someone's reports is written to the audit log, because it
 * shows patient information.
 */
export async function therapistHub(
  viewer: UserDoc,
  requested?: ObjectId,
): Promise<TherapistHubDto> {
  let subjectId: ObjectId;
  let self: boolean;
  if (viewer.role === "therapist") {
    if (!viewer.therapistId) {
      throw new UserFacingError("No therapist record is linked to this account.", 404);
    }
    if (requested && !requested.equals(viewer.therapistId)) throw new AuthError(403);
    subjectId = viewer.therapistId;
    self = true;
  } else {
    if (!can(viewer, "reports.therapist")) throw new AuthError(403);
    if (!requested) throw new UserFacingError("Choose a therapist.");
    subjectId = requested;
    self = false;
  }
  const db = await collections();
  const t = await db.therapists.findOne(
    { _id: subjectId },
    { projection: { name: 1, discipline: 1, region: 1 } },
  );
  if (!t) throw new UserFacingError("Therapist not found.", 404);
  const loaded = await loadFacts(viewer, self ? {} : { therapistId: subjectId });
  if (!self) await audit(viewer, `Therapist reports: opened ${t.name}`, null);
  return {
    hub: {
      scope: loaded.scope,
      me: { id: viewer._id.toHexString(), name: viewer.name },
      today: loaded.today,
      now: loaded.now,
      earliest: loaded.earliest,
      latest: loaded.latest,
      freshness: loaded.freshness,
      settings: loaded.settings,
      facts: loaded.facts,
      names: loaded.names,
      views: [],
      schedules: [],
      exports: [],
      insights: [],
      people: [],
    },
    subject: {
      id: subjectId.toHexString(),
      name: t.name,
      discipline: t.discipline,
      region: t.region,
    },
    self,
  };
}

/** The therapists an admin can choose from. The same list the directory shows, so figures agree. */
export async function therapistChoices(viewer: UserDoc) {
  if (!can(viewer, "reports.therapist")) throw new AuthError(403);
  return (await listTherapists()).map((t) => ({
    id: t.id,
    name: t.name,
    discipline: t.discipline,
    region: t.region,
    active: t.active,
    patients: t.activeClients,
    sessions: t.sessions.completed,
  }));
}
