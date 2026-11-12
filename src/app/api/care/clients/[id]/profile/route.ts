import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import {
  participantAction,
  participantActionSchema,
  participantProfile,
} from "@/server/participants";

type Params = { params: Promise<{ id: string }> };

/** Module 03: the participant's details, contacts, consents and clinical context. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    await requireUser("admin");
    return { profile: await participantProfile(parseId((await params).id)) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const action = await readJson(request, participantActionSchema);
    return participantAction(admin, parseId((await params).id), action);
  });
}
