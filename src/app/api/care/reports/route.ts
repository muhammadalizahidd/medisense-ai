import { z } from "zod";
import { cached, cacheKey } from "@/server/cache";
import { exportInputSchema, scheduleInputSchema, viewInputSchema } from "@/lib/live/report-dto";
import { requireUser } from "@/server/auth";
import { heldPermissions } from "@/server/permissions";
import { handle, objectId, readJson } from "@/server/http";
import {
  createExport,
  referralTask,
  reportsHub,
  saveSchedule,
  saveView,
} from "@/server/report-actions";
import { saveReportSettings, settingsInputSchema } from "@/server/report-settings";

/**
 * Module 09: reports hub (scoped facts, saved views, schedules, exports, insights). Therapists
 * get their own caseload only (section 8); participants have no reporting area.
 */
export async function GET(request: Request) {
  // Five minutes: any change in the database clears the cache at once, so this only saves the
  // multi-second rebuild when nothing has changed.
  return handle(async () => {
    // The person is read here, inside the request: a background rebuild has no cookies to read.
    // Their permissions are part of the key, so a changed role never sees the old answer.
    const user = await requireUser("admin", "therapist");
    const access = [...heldPermissions(user)].sort().join(",");
    return cached(
      `${cacheKey(request)}|${user.role}|${access}`,
      300_000,
      async () => ({ hub: await reportsHub(user) }),
      // Rebuilt in the background after a change, so reports open at once instead of in seconds.
      { warm: true },
    );
  });
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), view: viewInputSchema }),
  z.object({ type: z.literal("export"), export: exportInputSchema }),
  z.object({ type: z.literal("schedule"), schedule: scheduleInputSchema }),
  z.object({ type: z.literal("referral-task"), referralId: objectId }),
  z.object({ type: z.literal("settings"), settings: settingsInputSchema }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    const action = await readJson(request, actionSchema);
    switch (action.type) {
      case "view":
        return saveView(user, action.view);
      case "export":
        return createExport(user, action.export);
      case "schedule":
        return saveSchedule(user, action.schedule);
      case "referral-task":
        return referralTask(user, action.referralId);
      case "settings":
        return saveReportSettings(user, action.settings);
    }
  });
}
