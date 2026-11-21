import "server-only";
import type { AssignmentMode } from "@/lib/live/scheduling";
import { collections } from "./db";
import { adminIds, audit, publish } from "./live";
import type { UserDoc } from "./models";

type SettingsDoc = {
  _id: "org";
  assignmentMode: AssignmentMode;
  updatedBy: string;
  updatedAt: Date;
};

/** Organisation settings. AI Assisted is the default assignment mode (Module 04, section 11). */
export async function orgSettings() {
  const { db } = await collections();
  const doc = await db.collection<SettingsDoc>("settings").findOne({ _id: "org" });
  return { assignmentMode: doc?.assignmentMode ?? ("AI Assisted" as AssignmentMode) };
}

export async function setAssignmentMode(admin: UserDoc, mode: AssignmentMode) {
  const { db } = await collections();
  const before = (await orgSettings()).assignmentMode;
  await db
    .collection<SettingsDoc>("settings")
    .updateOne(
      { _id: "org" },
      { $set: { assignmentMode: mode, updatedBy: admin.name, updatedAt: new Date() } },
      { upsert: true },
    );
  await audit(admin, `Assignment mode ${before} → ${mode}`, null);
  await publish(await adminIds(), "care", {});
}
