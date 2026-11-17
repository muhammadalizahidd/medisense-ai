import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { myTasks } from "@/server/operations-hub";

/** A therapist's assigned operational tasks (section 2: view and complete their own). */
export async function GET() {
  return handle(async () => myTasks(await requireUser("therapist", "admin")));
}
