import { NextResponse } from "next/server";
import { createElement } from "react";
import { AgreementDocument } from "@/lib/pdf/documents/agreement";
import { renderPdf } from "@/lib/pdf/render";
import { requireUser } from "@/server/auth";
import { agreementDetail } from "@/server/agreements";
import { handle, parseId } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

/** A service agreement as a PDF file. Open to the same people who can open the agreement. */
export async function GET(_: Request, { params }: Params) {
  let failure: unknown = null;
  try {
    await requireUser("admin");
    const { agreement } = await agreementDetail(parseId((await params).id));
    const bytes = await renderPdf(createElement(AgreementDocument, { a: agreement }));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${agreement.ref.toLowerCase()}-v${agreement.version}.pdf"`,
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
