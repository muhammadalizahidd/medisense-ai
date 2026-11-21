import "server-only";
import { collections } from "./db";

/**
 * A short-lived memory cache for heavy read-only lists. The database is far away (every query is
 * a round trip of 100 ms or more), so lists people open again and again are kept for a minute.
 * Any change in the database clears everything at once (a change stream), so nobody sees stale
 * data after an edit, wherever the edit came from.
 */
type Entry = { at: number; value: Promise<unknown> };
const g = globalThis as unknown as { __msCache?: Map<string, Entry>; __msWatching?: boolean };
const store = (g.__msCache ??= new Map<string, Entry>());

/** Collections that change on every page view and say nothing about the records on screen. */
const noise = ["sessions", "events", "notifications", "audit", "counters"];

async function watch() {
  if (g.__msWatching) return;
  g.__msWatching = true;
  try {
    const { db } = await collections();
    const stream = db.watch([{ $match: { "ns.coll": { $nin: noise } } }]);
    stream.on("change", () => store.clear());
    stream.on("error", () => {
      store.clear();
      g.__msWatching = false;
    });
    stream.on("close", () => {
      store.clear();
      g.__msWatching = false;
    });
  } catch {
    // Without a change stream, entries simply expire on their own.
    g.__msWatching = false;
  }
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  void watch();
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), value });
  value.catch(() => store.delete(key));
  return value;
}

/** For a write the change stream may not see yet: the next read loads fresh. */
export function clearCache() {
  store.clear();
}

/** One entry per address and signed-in person, so nobody sees another person's filtered list. */
export function cacheKey(request: Request) {
  const session = /medisense_session=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "";
  return `${request.url}|${session}`;
}
