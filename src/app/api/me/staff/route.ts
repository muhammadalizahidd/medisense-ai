import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { myCredentialSchema, myStaffRecord, submitMyCredential } from "@/server/staff";

/** A therapist's own staff record: credentials, approved services and capacity. */
export async function GET() {
  return handle(async () => ({ staff: await myStaffRecord(await requireUser("therapist")) }));
}

/** A therapist adds a credential for review. They can't verify it themselves. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await submitMyCredential(user, await readJson(request, myCredentialSchema));
    return { ok: true };
  });
}
