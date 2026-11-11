import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { clinicianView, host, hostSchema } from "@/server/telehealth";

type Params = { params: Promise<{ visitId: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return { call: await clinicianView(user, parseId((await params).visitId)) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const id = parseId((await params).visitId);
    const result = await host(user, id, await readJson(request, hostSchema));
    return { ...result, call: await clinicianView(user, id) };
  });
}
