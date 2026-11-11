import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { listRecordings } from "@/server/telehealth";

export async function GET() {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    return { recordings: await listRecordings(user) };
  });
}
