import { requireUser } from "@/server/auth";
import { exportStaff } from "@/server/staff";

/** The staff summary as CSV. Operational columns only; every export is audited. */
export async function GET() {
  const admin = await requireUser("admin").catch(() => null);
  if (!admin) return new Response("Sign in as staff.", { status: 401 });
  const csv = await exportStaff(admin);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medisense-staff-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
