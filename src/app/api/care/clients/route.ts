import { requireUser } from "@/server/auth";
import { createClient, listClients, newClientSchema } from "@/server/care-admin";
import { handle, readJson } from "@/server/http";

export async function GET() {
  return handle(async () => {
    await requireUser("admin");
    return { clients: await listClients() };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    return createClient(admin, await readJson(request, newClientSchema));
  });
}
