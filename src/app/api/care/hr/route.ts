import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { credentialAlerts } from "@/server/hr";

export async function GET() {
  return handle(async () => credentialAlerts(await requireUser("admin")));
}
