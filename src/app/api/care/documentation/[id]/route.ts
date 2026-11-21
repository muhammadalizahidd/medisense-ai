import { docActionSchema } from "@/lib/live/docs";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { docAction, docDetail } from "@/server/docs";

type Params = { params: Promise<{ id: string }> };

/** Module 15: one clinical document, at the level this person may see. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({
    doc: await docDetail(await requireUser("admin", "therapist"), parseId((await params).id)),
  }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return docAction(user, parseId((await params).id), await readJson(request, docActionSchema));
  });
}
