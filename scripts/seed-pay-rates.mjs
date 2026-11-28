#!/usr/bin/env node
// Adds demo pay rates for every active therapist who has none yet. It only inserts into the
// payRates collection: nothing is reset, restored, updated or deleted, so it is safe on the shared
// database the live and staging sites use, and running it twice changes nothing.
// Usage: pnpm demo:pay-rates            (reads CONNECTION_STRING and MONGODB_DB from .env.local)
//        pnpm demo:pay-rates --dry-run  (prints what it would add)
import { existsSync, readFileSync } from "node:fs";
import { MongoClient, ObjectId } from "mongodb";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const uri = env.CONNECTION_STRING ?? env.MONGODB_URI;
if (!uri) throw new Error("CONNECTION_STRING is not set.");
const dryRun = process.argv.includes("--dry-run");

// The start of the 2026–27 financial year, so this year's visits are all paid.
const FIRST_FROM = "2026-07-01";
// A second rate for a few therapists, so the history and a mid-year change are visible.
const CHANGE_FROM = "2026-10-01";
const CANCELLATION = ["half", "full", "none", "half"];

/** A deterministic mix: about half per appointment, a quarter hourly, a quarter revenue share. */
function ratesFor(name, i) {
  const cancellation = CANCELLATION[i % CANCELLATION.length];
  const step = (i % 3) * 500;
  if (/^Sarah\b/.test(name)) {
    // The worked example: $90 per appointment, half for Did not attend.
    return [
      {
        method: "per-appointment",
        inPersonCents: 8500,
        telehealthCents: 7000,
        cancellation: "half",
        effectiveFrom: FIRST_FROM,
        note: "Starting rate",
      },
      {
        method: "per-appointment",
        inPersonCents: 9000,
        telehealthCents: 7500,
        cancellation: "half",
        effectiveFrom: CHANGE_FROM,
        note: "Annual review",
      },
    ];
  }
  const kind = i % 4;
  const first =
    kind <= 1
      ? {
          method: "per-appointment",
          inPersonCents: 8500 + step,
          telehealthCents: 7000 + step,
          cancellation,
          effectiveFrom: FIRST_FROM,
          note: "Starting rate",
        }
      : kind === 2
        ? {
            method: "hourly",
            hourlyCents: 5000 + step,
            cancellation,
            effectiveFrom: FIRST_FROM,
            note: "Starting rate",
          }
        : {
            method: "revenue-share",
            sharePercent: 55 + (i % 3) * 5,
            cancellation,
            effectiveFrom: FIRST_FROM,
            note: "Starting rate",
          };
  if (i % 7 !== 2) return [first];
  const raised =
    first.method === "per-appointment"
      ? {
          ...first,
          inPersonCents: first.inPersonCents + 500,
          telehealthCents: first.telehealthCents + 500,
        }
      : first.method === "hourly"
        ? { ...first, hourlyCents: first.hourlyCents + 300 }
        : { ...first, sharePercent: first.sharePercent + 2.5 };
  return [first, { ...raised, effectiveFrom: CHANGE_FROM, note: "Annual review" }];
}

const client = await MongoClient.connect(uri);
try {
  const db = client.db(env.MONGODB_DB ?? "Medisense");
  const payRates = db.collection("payRates");
  if (!dryRun) await payRates.createIndex({ therapistId: 1, seq: 1 }, { unique: true });
  const therapists = await db
    .collection("therapists")
    .find({ active: { $ne: false } }, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  const counts = { "per-appointment": 0, hourly: 0, "revenue-share": 0 };
  let added = 0;
  let skipped = 0;
  for (const [i, t] of therapists.entries()) {
    if (await payRates.findOne({ therapistId: t._id }, { projection: { _id: 1 } })) {
      skipped += 1;
      continue;
    }
    const rows = ratesFor(t.name, i).map((r, n) => ({
      _id: new ObjectId(),
      therapistId: t._id,
      seq: n + 1,
      method: r.method,
      inPersonCents: r.inPersonCents ?? null,
      telehealthCents: r.telehealthCents ?? null,
      hourlyCents: r.hourlyCents ?? null,
      sharePercent: r.sharePercent ?? null,
      cancellation: r.cancellation,
      effectiveFrom: r.effectiveFrom,
      note: r.note,
      createdBy: null,
      createdByName: "Demo setup",
      createdAt: new Date(),
      withdrawnAt: null,
      withdrawnBy: null,
      demo: true,
    }));
    counts[rows.at(-1).method] += 1;
    console.log(
      `${dryRun ? "Would add" : "Adding"} ${rows.length} rate(s) for ${t.name}: ${rows.map((r) => `${r.method} from ${r.effectiveFrom}`).join(", ")}`,
    );
    if (!dryRun) {
      try {
        await payRates.insertMany(rows, { ordered: true });
      } catch (error) {
        // Someone set a rate for this therapist at the same moment; theirs stands.
        if (error?.code === 11000) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
    added += 1;
  }
  console.log(
    `${dryRun ? "Dry run: would add" : "Added"} rates for ${added} therapists (${counts["per-appointment"]} per appointment, ${counts.hourly} hourly, ${counts["revenue-share"]} revenue share). ${skipped} already had a rate and were left alone.`,
  );
} finally {
  await client.close();
}
