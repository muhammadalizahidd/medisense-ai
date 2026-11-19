import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle, readJson } from "@/server/http";
import { forViewer, modeSchema, scheduleBoard, setAssignmentMode } from "@/server/scheduling";

/** Module 05: the scheduling board for a period (defaults to the next five weeks). */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      const viewer = await requireUser("admin");
      const url = new URL(request.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const start = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
      const end = to ? new Date(to) : new Date(start.getTime() + 42 * 86_400_000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        throw new Error("Check the dates.");
      }
      return { board: forViewer(await scheduleBoard(start, end), viewer) };
    }),
  );
}

/** Sets the organisation's assignment mode: Manual, AI Assisted or Rules-Based Auto. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const { mode } = await readJson(request, modeSchema);
    await setAssignmentMode(admin, mode);
    return { mode };
  });
}
