import { ZodError } from "zod";
import { AuthError } from "@/server/auth-error";
import { requireUser } from "@/server/auth";
import { UserFacingError } from "@/server/http";
import { earningsCsv } from "@/server/pay";
import { readFilter } from "../filter";

/** Therapist earnings as CSV for payroll and accounting. Finance only; every export is audited. */
export async function GET(request: Request) {
  try {
    const user = await requireUser("admin");
    const { filename, text } = await earningsCsv(user, readFilter(request));
    return new Response(text, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return new Response(error.message, { status: error.status });
    if (error instanceof UserFacingError)
      return new Response(error.message, { status: error.status });
    if (error instanceof ZodError) return new Response("Check the filters.", { status: 400 });
    throw error;
  }
}
