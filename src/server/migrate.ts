import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { fundingStreams, supportCatalogue, type Support } from "@/lib/live/catalogue";
import { serverLog } from "./log";
import type { AssignmentDoc, ClientDoc, UserDoc } from "./models";
import { seedAdmins } from "./seed";

/** The support a discipline-only service request from before referrals most likely was. */
const supportFor = (discipline: string): Support =>
  supportCatalogue.find((s) => s.discipline === discipline && s.kind === "treatment")?.name ??
  "Other";

/**
 * Brings records from earlier versions up to the current model. Every step is idempotent, so it
 * runs safely on each start.
 */
export async function migrate(db: Db) {
  const users = db.collection<UserDoc>("users");
  for (const admin of seedAdmins) {
    await users.updateOne(
      { email: admin.email, staffRoles: { $exists: false } },
      { $set: { staffRoles: admin.staffRoles } },
    );
  }

  const clients = db.collection<ClientDoc>("clients");
  let changed = 0;
  for (const client of await clients.find().toArray()) {
    const needsUpgrade = client.needs.some((n) => !n.id || !n.support);
    const funding = (fundingStreams as readonly string[]).includes(client.funding)
      ? client.funding
      : "Other";
    if (!needsUpgrade && funding === client.funding) continue;
    await clients.updateOne(
      { _id: client._id },
      {
        $set: {
          funding,
          needs: client.needs.map((n) => ({
            ...n,
            id: n.id ?? randomUUID(),
            support: n.support ?? supportFor(n.discipline),
            location: n.location ?? "Home",
          })),
        },
      },
    );
    changed += 1;
  }
  if (changed) serverLog(`Upgraded ${changed} patient records to service requests.`);

  // Requests made before service requests had ids point at the patient's need for that discipline.
  const assignments = db.collection<AssignmentDoc>("assignments");
  for (const a of await assignments.find({ needId: { $exists: false } }).toArray()) {
    const client = await clients.findOne({ _id: a.clientId });
    const need = client?.needs.find((n) => n.discipline === a.discipline);
    if (need) await assignments.updateOne({ _id: a._id }, { $set: { needId: need.id } });
  }
}
