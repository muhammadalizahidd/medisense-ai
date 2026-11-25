import { NextResponse } from "next/server";
import { InvoiceDocument } from "@/lib/pdf/documents/invoice";
import { renderPdf } from "@/lib/pdf/render";
import { requireUser } from "@/server/auth";
import { collections } from "@/server/db";
import { chargeRules, invoiceDto07 } from "@/server/finance";
import { handle, parseId, UserFacingError } from "@/server/http";
import { createElement } from "react";

type Params = { params: Promise<{ id: string }> };

/** An invoice as a PDF file. Open to the same people who can open the invoice. */
export async function GET(_: Request, { params }: Params) {
  let failure: unknown = null;
  try {
    await requireUser("admin");
    const db = await collections();
    const inv = await db.invoices.findOne({ _id: parseId((await params).id) });
    if (!inv) throw new UserFacingError("Invoice not found.", 404);
    const client = await db.clients.findOne({ _id: inv.clientId }, { projection: { name: 1 } });
    const names = new Map([[inv.clientId.toHexString(), client?.name ?? "Participant"]]);
    const dto = await invoiceDto07(inv, names, await chargeRules());
    const bytes = await renderPdf(createElement(InvoiceDocument, { inv: dto }));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${dto.number.toLowerCase()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    failure = error;
  }
  return handle(async () => {
    throw failure;
  });
}
