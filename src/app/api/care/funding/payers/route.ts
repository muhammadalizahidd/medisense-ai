import { requireUser } from "@/server/auth";
import { payerAction, payerActionSchema } from "@/server/funding";
import { handle, readJson } from "@/server/http";

/** Adds a payer to the directory. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    return payerAction(user, null, await readJson(request, payerActionSchema));
  });
}
