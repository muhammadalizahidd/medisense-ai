import { requireUser } from "@/server/auth";
import { therapistHome } from "@/server/care-therapist";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => therapistHome(await requireUser("therapist")));
}
