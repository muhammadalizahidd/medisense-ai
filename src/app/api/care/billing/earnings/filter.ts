import { earningsFilterSchema } from "@/lib/live/pay";

/** Reads the report filters from the query string. */
export function readFilter(request: Request) {
  const q = new URL(request.url).searchParams;
  return earningsFilterSchema.parse({
    from: q.get("from") || undefined,
    to: q.get("to") || undefined,
    service: q.get("service") || undefined,
    therapist: q.get("therapist") || undefined,
  });
}
