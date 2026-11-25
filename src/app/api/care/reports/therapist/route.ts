import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { therapistHub } from "@/server/therapist-reports";

/** A therapist's own reports. */
export async function GET() {
  return handle(async () => therapistHub(await requireUser("therapist")));
}
