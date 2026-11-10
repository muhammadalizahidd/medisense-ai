import { requireUser } from "@/server/auth";
import { clientHome } from "@/server/care-client";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => clientHome(await requireUser("client")));
}
