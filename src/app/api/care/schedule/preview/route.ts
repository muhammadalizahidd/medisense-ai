import { requireUser } from "@/server/auth";
import { mustCanAny } from "@/server/permissions";
import { handle, readJson } from "@/server/http";
import { previewSchema, seriesPreview } from "@/server/scheduling";

/** The occurrences a series would book, with collisions, without booking anything. */
export async function POST(request: Request) {
  return handle(async () => {
    mustCanAny(await requireUser("admin"), ["schedule.manage", "schedule.assign"]);
    return { occurrences: await seriesPreview(await readJson(request, previewSchema)) };
  });
}
