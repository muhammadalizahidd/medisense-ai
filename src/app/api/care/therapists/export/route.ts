import { requireUser } from "@/server/auth";
import { can } from "@/server/permissions";
import { exportStaff } from "@/server/staff";

/** The staff summary as CSV. Operational columns only; every export is audited. */
export async function GET() {
  const admin = await requireUser("admin").catch(() => null);
  if (!admin) return new Response("Sign in as staff.", { status: 401 });
  if (!can(admin, "therapists.export")) {
    return new Response("You don't have access to this.", { status: 403 });
  }
  const csv = await exportStaff(admin);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medisense-staff-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
