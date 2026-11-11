import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { documentFile } from "@/server/referrals";

/** Streams a stored document to staff allowed to see it. Each view is audited. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("admin", "therapist");
    const doc = await documentFile(user, parseId((await params).id));
    return new NextResponse(new Uint8Array(doc.data.buffer), {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `inline; filename="${doc.name.replace(/["\\r\n]/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handle(async () => {
      throw error;
    });
  }
}
