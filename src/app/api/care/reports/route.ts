import { z } from "zod";
import { cached, cacheKey } from "@/server/cache";
import { exportInputSchema, scheduleInputSchema, viewInputSchema } from "@/lib/live/report-dto";
import { requireUser } from "@/server/auth";
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
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => ({
      hub: await reportsHub(await requireUser("admin", "therapist")),
    })),
  );
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
