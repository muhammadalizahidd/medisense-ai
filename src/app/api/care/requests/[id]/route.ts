import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { withdrawRequest } from "@/server/care-admin";
import { respond, respondSchema } from "@/server/care-therapist";
import { handle, parseId, readJson } from "@/server/http";

type Context = { params: Promise<{ id: string }> };

/** The therapist accepts or declines a new client. */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const therapist = await requireUser("therapist");
    return respond(therapist, parseId((await params).id), await readJson(request, respondSchema));
  });
}

/** An admin withdraws a request that hasn't been answered. */
export async function DELETE(_: Request, { params }: Context) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "schedule.assign");
    await withdrawRequest(admin, parseId((await params).id));
    return { ok: true };
  });
}
