import { endSession } from "@/server/auth";
import { handle } from "@/server/http";

export async function POST() {
  return handle(async () => {
    await endSession();
    return { ok: true };
  });
}
