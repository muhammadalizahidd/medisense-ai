import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { listTherapists } from "@/server/therapists";

export async function GET() {
  return handle(async () => {
    await requireUser("admin");
    return { therapists: await listTherapists() };
  });
}
