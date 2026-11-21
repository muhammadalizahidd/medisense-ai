import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";

/** How long an MRN keeps signing a patient in; each sign-in extends it. */
export const MRN_ACCESS_DAYS = 365;

/** The MRN is stored only as a hash on the account, like a code. */
export const mrnHash = (mrn: string) =>
  createHash("sha256").update(mrn.trim().toUpperCase()).digest("hex");

export const mrnAccess = (from = new Date()) => ({
  expiresAt: new Date(from.getTime() + MRN_ACCESS_DAYS * 86_400_000),
});

/** DDMMYYYY for a moment, on the Brisbane calendar. */
function dayKey(at: Date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}${part("month")}${part("year")}`;
}

/** The next medical record number for a day: MRN-DDMMYYYY-0001, MRN-DDMMYYYY-0002, … */
export async function nextMrn(db: Db, at = new Date()) {
  const key = dayKey(at);
  const counter = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: `mrn-${key}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `MRN-${key}-${String(counter?.seq ?? 1).padStart(4, "0")}`;
}
