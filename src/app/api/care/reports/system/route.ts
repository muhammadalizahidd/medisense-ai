import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { UserFacingError } from "@/server/http";
import { serverLog } from "@/server/log";
import { downloadSystemReport, systemReportTable } from "@/server/system-reports";

const plain = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

/**
 * One system report, counted on the server. `format=json` is the on-screen preview (cached for a
 * minute, cleared by any change); `pdf` and `csv` are downloads, each written to the audit trail.
 */
export async function GET(request: Request) {
  const admin = await requireUser("admin").catch(() => null);
  if (!admin) return plain("Sign in as staff to open reports.", 401);
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "csv";
  const report = params.get("report") ?? "";
  const from = params.get("from");
  const to = params.get("to");
  const type = params.get("type");
  try {
    if (format === "json") {
      const table = await cached(cacheKey(request), 60_000, () =>
        systemReportTable(admin, report, from, to, type),
      );
      return NextResponse.json({ table }, { headers: { "Cache-Control": "no-store" } });
    }
    if (format !== "csv" && format !== "pdf") return plain("Choose PDF or CSV.", 400);
    const table = await systemReportTable(admin, report, from, to, type);
    const stamp = [[from, to].filter(Boolean).join("_to_") || "all-time", type]
      .filter(Boolean)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");
    const file = await downloadSystemReport(admin, table, format, stamp);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.type,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UserFacingError) return plain(error.message, error.status);
    serverLog(`System report failed: ${error instanceof Error ? error.message : String(error)}`);
    return plain("The report couldn't be made just now. Try again.", 503);
  }
}
