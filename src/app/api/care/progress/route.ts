import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { episodeList, reportList } from "@/server/progress";
import { ensureProgressSeed } from "@/server/progress-seed";

/** Module 16: episodes and reports, filtered to this person. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await ensureProgressSeed();
    const lead =
      user.role === "admin" &&
      Boolean(user.staffRoles?.some((r) => r === "Clinical Lead" || r === "Super Admin"));
    return { episodes: await episodeList(user), reports: await reportList(user), lead };
  });
}
