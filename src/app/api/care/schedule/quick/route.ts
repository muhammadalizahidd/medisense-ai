import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { quickBook, quickBookOptions, quickBookSchema } from "@/server/quick-book";

/** Clinicians and their next free times, for booking someone not yet in Medisense. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireUser("admin");
    const clientId = new URL(request.url).searchParams.get("clientId");
    if (clientId && !/^[a-f0-9]{24}$/.test(clientId)) throw new Error("Check the patient.");
    return await quickBookOptions(clientId);
  });
}

/** Books a visit from a name and phone; a provisional record is opened for intake to complete. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    return await quickBook(admin, await readJson(request, quickBookSchema));
  });
}
