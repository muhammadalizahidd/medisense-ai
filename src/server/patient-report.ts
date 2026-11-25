import "server-only";
import { createElement } from "react";
import type { ObjectId } from "mongodb";
import { sessionStats } from "@/lib/live/patient-stats";
import { PatientReportDocument } from "@/lib/pdf/documents/patient";
import { renderPdf } from "@/lib/pdf/render";
import { collections } from "./db";
import type { UserDoc } from "./models";
import { recordFor } from "./records";

/** A patient's two-page summary, built from the record this person may see. Opening it is logged. */
export async function patientReport(u: UserDoc, clientId: ObjectId) {
  const record = await recordFor(u, clientId);
  const db = await collections();
  // A therapist's attendance figures are their own sessions with the patient.
  const own = u.role === "therapist" && u.therapistId ? { therapistId: u.therapistId } : {};
  const visits = await db.appointments
    .find({ clientId, ...own }, { projection: { start: 1, status: 1 } })
    .toArray();
  const now = new Date().toISOString();
  const bytes = await renderPdf(
    createElement(PatientReportDocument, {
      r: record,
      stats: sessionStats(
        visits.map((v) => ({ start: v.start.toISOString(), status: v.status })),
        now,
      ),
      preparedBy: u.name,
      preparedAt: now,
    }),
  );
  return { bytes, name: `patient-summary-${record.participantId.toLowerCase()}.pdf` };
}
