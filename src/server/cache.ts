import "server-only";
import { collections } from "./db";

/**
 * A short-lived memory cache for heavy read-only lists. The database is far away (every query is
 * a round trip of 100 ms or more), so lists people open again and again are kept for a minute.
 * Any change in the database clears everything at once (a change stream), so nobody sees stale
 * data after an edit, wherever the edit came from.
 */
type Entry = { at: number; value: Promise<unknown> };
type Warm = { load: () => Promise<unknown>; usedAt: number };
const g = globalThis as unknown as {
  __msCache?: Map<string, Entry>;
  __msWatching?: boolean;
  __msWarm?: Map<string, Warm>;
  __msWarmTimer?: ReturnType<typeof setTimeout>;
};
const store = (g.__msCache ??= new Map<string, Entry>());
/** Heavy answers rebuilt in the background after a change, while someone is still using them. */
const warm = (g.__msWarm ??= new Map<string, Warm>());
const WARM_FOR = 10 * 60_000;
const WARM_AFTER = 4000;

function put(key: string, load: () => Promise<unknown>) {
  const value = load();
  store.set(key, { at: Date.now(), value });
  value.catch(() => store.delete(key));
  return value;
}

/**
 * After a burst of changes settles, rebuild the warm answers people opened recently, so the next
 * visit finds them ready instead of waiting seconds for the database.
 */
function rewarm() {
  if (!warm.size) return;
  clearTimeout(g.__msWarmTimer);
  g.__msWarmTimer = setTimeout(() => {
    const now = Date.now();
    for (const [key, w] of warm) {
      if (now - w.usedAt > WARM_FOR) warm.delete(key);
      else if (!store.has(key)) void put(key, w.load).catch(() => undefined);
    }
  }, WARM_AFTER);
}

/** Collections that change on every page view and say nothing about the records on screen. */
const noise = ["sessions", "events", "notifications", "audit", "counters"];

async function watch() {
  if (g.__msWatching) return;
  g.__msWatching = true;
  try {
    const { db } = await collections();
    const stream = db.watch([{ $match: { "ns.coll": { $nin: noise } } }]);
    stream.on("change", () => {
      store.clear();
      rewarm();
    });
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

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  options: { warm?: boolean } = {},
): Promise<T> {
  void watch();
  if (options.warm) warm.set(key, { load, usedAt: Date.now() });
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  return put(key, load) as Promise<T>;
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
