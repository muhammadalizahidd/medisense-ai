import { bookingActionSchema } from "@/lib/live/booking";
import { requireUser } from "@/server/auth";
import { bookingAgentAction, bookingAgentView } from "@/server/booking-agent";
import { handle, readJson } from "@/server/http";

/** The guided booking agent for admins, therapists and patients. Confirming goes to /api/agent. */
export async function GET() {
  return handle(async () => bookingAgentView(await requireUser()));
}

export async function POST(request: Request) {
  return handle(async () =>
    bookingAgentAction(await requireUser(), await readJson(request, bookingActionSchema)),
  );
}
