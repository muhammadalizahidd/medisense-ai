import { requireUser } from "@/server/auth";
import { dischargePatient, dischargeSchema } from "@/server/discharge";
import { handle, parseId, readJson } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return dischargePatient(
      user,
      parseId((await params).id),
      await readJson(request, dischargeSchema),
    );
  });
}
