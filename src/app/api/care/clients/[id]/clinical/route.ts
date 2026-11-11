import { requireUser } from "@/server/auth";
import { clinicalSummary } from "@/server/clinical";
import { assertMyPatient } from "@/server/care-therapist";
import { handle, parseId } from "@/server/http";

/** Statuses of each service's assessments and plan. No clinical content. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    const id = parseId((await params).id);
    if (user.role === "therapist") await assertMyPatient(user, id);
    return { services: await clinicalSummary(id) };
  });
}
