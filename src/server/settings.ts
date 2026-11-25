import "server-only";
import type { AssignmentMode } from "@/lib/live/scheduling";
import type { AiFeaturesDto } from "@/lib/ai/features";
import { forgetAiSwitch } from "./ai-switch";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, allUserIds, audit, publish } from "./live";
import type { UserDoc } from "./models";
import { isSuper, requireSuperAdmin } from "./user-control";

type SettingsDoc = {
  _id: "org";
  assignmentMode?: AssignmentMode;
  updatedBy?: string;
  updatedAt?: Date;
  aiEnabled?: boolean;
  aiUpdatedBy?: string;
  aiUpdatedAt?: Date;
};

async function settings() {
  const { db } = await collections();
  return db.collection<SettingsDoc>("settings");
}

const orgDoc = async () => (await settings()).findOne({ _id: "org" });

/**
 * Organisation settings. AI Assisted is the default assignment mode (Module 04, section 11).
 * While the AI switch is off that mode reads as Manual; the stored choice comes back with it.
 */
export async function orgSettings() {
  const doc = await orgDoc();
  const aiEnabled = doc?.aiEnabled ?? true;
  const stored = doc?.assignmentMode ?? ("AI Assisted" as AssignmentMode);
  const assignmentMode: AssignmentMode = !aiEnabled && stored === "AI Assisted" ? "Manual" : stored;
  return { assignmentMode, aiEnabled };
}

export async function setAssignmentMode(admin: UserDoc, mode: AssignmentMode) {
  const before = await orgSettings();
  if (mode === "AI Assisted" && !before.aiEnabled) {
    throw new UserFacingError("That assignment mode is turned off by your organisation.", 409);
  }
  await (
    await settings()
  ).updateOne(
    { _id: "org" },
    { $set: { assignmentMode: mode, updatedBy: admin.name, updatedAt: new Date() } },
    { upsert: true },
  );
  await audit(admin, `Assignment mode ${before.assignmentMode} → ${mode}`, null);
  await publish(await adminIds(), "care", {});
}

/** The switch with who last changed it. Names are for office staff only. */
export async function aiFeatures(viewer: UserDoc | null): Promise<AiFeaturesDto> {
  const doc = await orgDoc();
  const staff = viewer?.role === "admin";
  return {
    enabled: doc?.aiEnabled ?? true,
    persisted: true,
    canChange: Boolean(viewer && isSuper(viewer)),
    signedIn: Boolean(viewer),
    updatedBy: staff ? (doc?.aiUpdatedBy ?? null) : null,
    updatedAt: staff ? (doc?.aiUpdatedAt?.toISOString() ?? null) : null,
  };
}

/** Super Admin only. Reaches every signed-in person straight away. */
export async function setAiEnabled(admin: UserDoc, enabled: boolean) {
  requireSuperAdmin(admin);
  const before = (await orgSettings()).aiEnabled;
  if (before !== enabled) {
    await (
      await settings()
    ).updateOne(
      { _id: "org" },
      { $set: { aiEnabled: enabled, aiUpdatedBy: admin.name, aiUpdatedAt: new Date() } },
      { upsert: true },
    );
    forgetAiSwitch();
    await audit(admin, `AI features turned ${enabled ? "on" : "off"}`, null);
    await publish(await allUserIds(), "settings", { aiEnabled: enabled });
    // Office screens that show the assignment mode load it again.
    await publish(await adminIds(), "care", {});
  }
  return aiFeatures(admin);
}
