import { createDocSchema } from "@/lib/live/docs";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { createDoc, docList, docOptions } from "@/server/docs";
import { ensureDocSeed } from "@/server/docs-seed";

/** Module 15: the documentation queue, and the choices for a new note. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await ensureDocSeed();
    return { rows: await docList(user), options: await docOptions(user) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return createDoc(user, await readJson(request, createDocSchema));
  });
}
