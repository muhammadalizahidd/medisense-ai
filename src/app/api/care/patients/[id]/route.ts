import { requireUser } from "@/server/auth";
import { clientDetail } from "@/server/care-admin";
import { assertMyPatient } from "@/server/care-therapist";
import { handle, parseId } from "@/server/http";

/** A patient's full record: admins see anyone, therapists only the patients they were asked to see. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    const id = parseId((await params).id);
    if (user.role === "therapist") await assertMyPatient(user, id);
    return { client: await clientDetail(id, { therapist: user.role === "therapist" }) };
  });
}
