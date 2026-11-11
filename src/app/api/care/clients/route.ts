import { requireUser } from "@/server/auth";
import { listClients } from "@/server/care-admin";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => {
    await requireUser("admin");
    return { clients: await listClients() };
  });
}
