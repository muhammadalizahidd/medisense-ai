import { z } from "zod";
import { requireUser } from "@/server/auth";
import { can } from "@/server/permissions";
import { collections } from "@/server/db";
import {
  billableDto,
  chargeRules,
  invoiceAction07,
  invoiceActionSchema07,
  invoiceDto07,
} from "@/server/finance";
import { aiInvoiceDraft } from "@/server/finance-money";
import { handle, parseId, UserFacingError } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

/** One invoice: lines, arithmetic, blockers, payments, credits, versions and communications. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    const id = parseId((await params).id);
    const db = await collections();
    const inv = await db.invoices.findOne({ _id: id });
    if (!inv) throw new UserFacingError("Invoice not found.", 404);
    const client = await db.clients.findOne({ _id: inv.clientId }, { projection: { name: 1 } });
    const names = new Map([[inv.clientId.toHexString(), client?.name ?? "Participant"]]);
    const lines = await db.billables
      .find({
        $or: [
          { invoiceId: id },
          { _id: { $in: inv.lines.flatMap((l) => (l.billableId ? [l.billableId] : [])) } },
        ],
      })
      .toArray();
    return {
      invoice: await invoiceDto07(inv, names, await chargeRules()),
      billables: lines.map((b) =>
        billableDto(b, names, new Map([[id.toHexString(), inv.number]]), new Map()),
      ),
      can: {
        officer: can(user, "finance.work"),
        manager: can(user, "finance.approve"),
      },
    };
  });
}

const aiSchema = z.object({
  type: z.literal("ai-draft"),
  purpose: z.enum(["explanation", "dispute", "reminder"]),
});

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    const id = parseId((await params).id);
    const body: unknown = await request.json().catch(() => null);
    const ai = aiSchema.safeParse(body);
    if (ai.success) return { draft: await aiInvoiceDraft(user, id, ai.data.purpose) };
    return invoiceAction07(user, id, invoiceActionSchema07.parse(body));
  });
}
