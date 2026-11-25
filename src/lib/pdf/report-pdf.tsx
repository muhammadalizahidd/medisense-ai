import "server-only";
import type { Snapshot } from "@/lib/live/report-files";
import { ReportDocument } from "./documents/report";
import { renderPdf } from "./render";

/** The PDF for an export snapshot, ready to send as a file. */
export async function reportPdf(e: Snapshot, viewer: string) {
  const body = await renderPdf(<ReportDocument e={e} viewer={viewer} />);
  return {
    body,
    type: "application/pdf",
    name: `${`${e.ref}-${e.reportId}`.toLowerCase()}.pdf`,
    inline: true,
  };
}
