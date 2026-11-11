import { requireUser } from "@/server/auth";
import { invoiceAction, invoiceActionSchema, invoiceDetail } from "@/server/billing";
import { handle, parseId, readJson } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    await requireUser("admin");
    return { invoice: await invoiceDetail(parseId((await params).id)) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const id = parseId((await params).id);
    await invoiceAction(admin, id, await readJson(request, invoiceActionSchema));
    return { invoice: await invoiceDetail(id) };
  });
}
