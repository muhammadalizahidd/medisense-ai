import { z } from "zod";
import { allocationSchema } from "@/lib/live/finance";
import { requireUser } from "@/server/auth";
import { allocatePayment, reversePayment } from "@/server/finance-money";
import { handle, parseId, readJson } from "@/server/http";

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("allocate"), allocations: allocationSchema.shape.allocations }),
  z.object({ type: z.literal("reverse"), reason: z.string().trim().min(5).max(300) }),
]);

/** Allocate a receipt across invoices and claims, or reverse it (Finance Manager). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    const id = parseId((await params).id);
    const action = await readJson(request, schema);
    if (action.type === "allocate")
      return allocatePayment(user, id, { allocations: action.allocations });
    await reversePayment(user, id, action.reason);
    return { ok: true };
  });
}
