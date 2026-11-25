import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { patientReport } from "@/server/patient-report";
import { ensureRecordScenarios } from "@/server/records-seed";

type Params = { params: Promise<{ id: string }> };

/** One patient's report as a PDF: their record and files, cut to what this person may see. Logged. */
export async function GET(_: Request, { params }: Params) {
  let failure: unknown = null;
  try {
    const user = await requireUser("admin", "therapist");
    await ensureRecordScenarios();
    const file = await patientReport(user, parseId((await params).id));
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.name}"`,
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
