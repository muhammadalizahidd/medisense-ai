import { z } from "zod";
import { ruleInputSchema, settingsSchema, taskInputSchema } from "@/lib/live/operations";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { bulkSchema, bulkTasks, createTask, saveSettings } from "@/server/operations";
import {
  assignFromQueue,
  assignSchema,
  opsHub,
  replay,
  runNow,
  saveRule,
} from "@/server/operations-hub";

/** Module 08: the operations hub (queue, rules, run log, approvals, notifications, reports). */
export async function GET() {
  return handle(async () => ({ hub: await opsHub(await requireUser("admin")) }));
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task"), task: taskInputSchema }),
  z.object({ type: z.literal("bulk"), bulk: bulkSchema }),
  z.object({ type: z.literal("settings"), settings: settingsSchema }),
  z.object({ type: z.literal("run-now") }),
  z.object({ type: z.literal("replay"), taskId: z.string().max(40) }),
  z.object({ type: z.literal("rule"), rule: ruleInputSchema }),
  z.object({ type: z.literal("assign"), assign: assignSchema }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    const action = await readJson(request, actionSchema);
    switch (action.type) {
      case "task":
        return createTask(user, action.task);
      case "bulk":
        return bulkTasks(user, action.bulk);
      case "settings":
        await saveSettings(user, action.settings);
        return { ok: true };
      case "run-now":
        return runNow(user);
      case "replay":
        return replay(user, parseId(action.taskId));
      case "rule":
        return saveRule(user, null, action.rule);
      case "assign":
        return assignFromQueue(user, action.assign);
    }
  });
}
