import "server-only";
import { cached, clearCache } from "./cache";
import { collections } from "./db";

/** How long a failed read is trusted, so a demo without a database doesn't retry on every call. */
const RETRY_MS = 30_000;
let lastKnown = true;
let failedAt = 0;

/**
 * The organisation switch, read on the way into every model call. If the database can't be read
 * the last value seen stands; a deployment that never had one (the offline demo) reads as on.
 */
export async function aiSwitchOn(): Promise<boolean> {
  if (Date.now() - failedAt < RETRY_MS) return lastKnown;
  try {
    lastKnown = await cached("ai-switch", 3_000, async () => {
      const { db } = await collections();
      const doc = await db
        .collection<{ _id: string; aiEnabled?: boolean }>("settings")
        .findOne({ _id: "org" });
      return doc?.aiEnabled ?? true;
    });
    failedAt = 0;
  } catch {
    failedAt = Date.now();
  }
  return lastKnown;
}

/** After a change: the next read loads fresh. */
export function forgetAiSwitch() {
  failedAt = 0;
  clearCache();
}
