import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { renewalSchema, requestRenewal } from "@/server/hr";

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    return requestRenewal(me, await readJson(request, renewalSchema));
  });
}
