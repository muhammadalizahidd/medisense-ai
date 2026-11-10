import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { listVisits } from "@/server/visits";

export async function GET() {
  return handle(async () => ({
    visits: await listVisits(await requireUser("therapist", "client")),
  }));
}
