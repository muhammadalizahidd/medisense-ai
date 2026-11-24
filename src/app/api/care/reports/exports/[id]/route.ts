import { NextResponse } from "next/server";
import { z } from "zod";
import { exportFile } from "@/lib/live/report-files";
import { reportPdf } from "@/lib/pdf/report-pdf";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { openExport, revokeExport } from "@/server/report-actions";

type Params = { params: Promise<{ id: string }> };

/** Download an export. Rights are checked again on every open, and every attempt is audited. */
export async function GET(request: Request, { params }: Params) {
  const format = new URL(request.url).searchParams.get("format");
  let failure: unknown = null;
  try {
    const user = await requireUser("admin", "therapist");
    const e = await openExport(user, parseId((await params).id), format);
    const chosen = format ?? e.format;
    const file =
      chosen === "PDF summary" ? await reportPdf(e, user.name) : exportFile(e, chosen, user.name);
    return new NextResponse(
      new Uint8Array(file.body instanceof Buffer ? file.body : Buffer.from(file.body)),
      {
        headers: {
          "Content-Type": file.type,
          "Content-Disposition": `${file.inline ? "inline" : "attachment"}; filename="${file.name}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    failure = error;
  }
  return handle(async () => {
    throw failure;
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    const { reason } = await readJson(
      request,
      z.object({ reason: z.string().trim().min(3, "Say why the link is revoked").max(200) }),
    );
    return revokeExport(user, parseId((await params).id), reason);
  });
}
