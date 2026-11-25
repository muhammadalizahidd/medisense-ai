import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { therapistChoices } from "@/server/therapist-reports";

/** The therapists whose reports an admin may open. */
export async function GET() {
  return handle(async () => ({ therapists: await therapistChoices(await requireUser("admin")) }));
}
