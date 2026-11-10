import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { liveOverview } from "@/server/overview";

export async function GET() {
  return handle(async () => {
    await requireUser("admin");
    return liveOverview();
  });
}
