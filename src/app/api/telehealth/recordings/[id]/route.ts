import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { recordingAction, recordingActionSchema } from "@/server/telehealth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    return recordingAction(
      user,
      parseId((await params).id),
      await readJson(request, recordingActionSchema),
    );
  });
}
