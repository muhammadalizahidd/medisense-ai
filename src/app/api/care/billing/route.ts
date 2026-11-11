import { requireUser } from "@/server/auth";
import { listInvoices } from "@/server/billing";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => {
    await requireUser("admin");
    return { invoices: await listInvoices() };
  });
}
