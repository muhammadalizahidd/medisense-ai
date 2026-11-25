"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { LiveEvent, SessionUser } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Fetches JSON from the platform's API and turns error responses into readable messages. */
async function request<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("You seem to be offline. Check your connection and try again.", 0);
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(data.error ?? "Something went wrong. Try again.", response.status);
  }
  return data as T;
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Reads share one request while it is in flight: the sidebar, top bar and account menu all ask
 * for the signed-in user on every page, and they now cost one round trip instead of three.
 */
export function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const method = init?.method ?? (init?.body === undefined ? "GET" : "POST");
  if (method !== "GET") return request<T>(url, init);
  const pending = inFlight.get(url);
  if (pending) return pending as Promise<T>;
  const started = request<T>(url, init).finally(() => inFlight.delete(url));
  inFlight.set(url, started);
  return started;
}

/* ------------------------------------------------------------ live events */

type Listener = (event: LiveEvent) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;
let status: "connecting" | "live" | "offline" = "offline";
const statusListeners = new Set<() => void>();

function setStatus(next: typeof status) {
  status = next;
  statusListeners.forEach((l) => l());
}

function connect() {
  if (source || typeof window === "undefined") return;
  setStatus("connecting");
  source = new EventSource("/api/events");
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data as string) as LiveEvent;
      if (event.type === "connected") setStatus("live");
      listeners.forEach((l) => l(event));
    } catch {
      // A malformed frame is skipped; the next one carries on.
    }
  };
  source.onerror = () => {
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      setStatus("offline");
    } else {
      setStatus("connecting");
    }
  };
}

function disconnect() {
  source?.close();
  source = null;
  setStatus("offline");
}

/** Calls `onEvent` for every live change while mounted. One connection is shared by the page. */
export function useLiveEvents(onEvent: Listener, enabled = true) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const listener: Listener = (event) => handler.current(event);
    listeners.add(listener);
    connect();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) disconnect();
    };
  }, [enabled]);
}

export function useLiveStatus() {
  // Server and first client render agree on "connecting"; the real state arrives after mount.
  const [value, setValue] = useState<typeof status>("connecting");
  useEffect(() => {
    const update = () => setValue(status);
    statusListeners.add(update);
    update();
    return () => {
      statusListeners.delete(update);
    };
  }, []);
  return value;
}

/* ------------------------------------------------------------- data hooks */

/** Identical reads already on their way are shared, so several components cost one request. */
const sharedInFlight = new Map<string, Promise<unknown>>();
function shared<T>(url: string): Promise<T> {
  const pending = sharedInFlight.get(url);
  if (pending) return pending as Promise<T>;
  const p = api<T>(url)
    .then((data) => {
      lastGood.set(url, data);
      return data;
    })
    .finally(() => sharedInFlight.delete(url));
  sharedInFlight.set(url, p);
  return p;
}

/*
 * The last answer for each address, kept in this browser tab only. Going back to a page shows it
 * at once while a fresh copy loads, instead of a skeleton every time. It is written only by
 * fetches, which run in the browser, so the server never holds anyone's data here; signing in or
 * out empties it.
 */
const lastGood = new Map<string, unknown>();

/**
 * Loads the main pages' data in the background, so the first visit to each is already warm.
 * Reads only; anything already loaded or on its way is left alone.
 */
export function preload(urls: string[]) {
  for (const url of urls) {
    if (!lastGood.has(url) && !sharedInFlight.has(url)) shared(url).catch(() => undefined);
  }
}

export type Resource<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/**
 * Loads a URL and keeps the last good data while reloading. With `reloadOn`, it also listens for
 * live changes and reloads when one matches (and after every reconnect, in case one was missed).
 */
export function useResource<T>(
  url: string | null,
  reloadOn?: (event: LiveEvent) => boolean,
): Resource<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: url !== null,
  });
  // A page already seen shows its last answer before the browser paints, so there's no skeleton
  // flash. It runs after hydration, never during it, so the server's HTML always matches.
  useLayoutEffect(() => {
    if (url === null || !lastGood.has(url)) return;
    const known = lastGood.get(url) as T;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the remembered answer once
    setState((s) => (s.data === null ? { data: known, error: null, loading: false } : s));
  }, [url]);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    shared<T>(url)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch(
        (error: unknown) =>
          !cancelled &&
          setState((s) => ({
            ...s,
            error: error instanceof Error ? error.message : "Couldn't load this.",
            loading: false,
          })),
      );
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  // The first "connected" arrives right after the page's own first load; reloading then fetched
  // everything twice. Only a reconnect (a later "connected") can have missed changes.
  const connectedOnce = useRef(false);
  useLiveEvents(
    (event) => {
      if (event.type === "connected") {
        if (connectedOnce.current) reload();
        connectedOnce.current = true;
      } else if (reloadOn?.(event)) reload();
    },
    url !== null && reloadOn !== undefined,
  );

  return { ...state, reload };
}

/*
 * Parts of the page that outlive a sign-in (the sidebar sits in the root layout) would keep the
 * signed-out answer from the login screen. Signing in or out tells every useSession to ask again.
 */
const sessionListeners = new Set<() => void>();

export function sessionChanged() {
  // Another person's answers must never show, even for a moment.
  lastGood.clear();
  sessionListeners.forEach((listener) => listener());
}

export function useSession() {
  const me = useResource<{ user: SessionUser | null }>("/api/auth/me");
  const { reload } = me;
  useEffect(() => {
    sessionListeners.add(reload);
    return () => {
      sessionListeners.delete(reload);
    };
  }, [reload]);
  return { user: me.data?.user ?? null, loading: me.loading && !me.data, reload };
}

export async function signOut() {
  await api("/api/auth/logout", { method: "POST" });
  disconnect();
  sessionChanged();
}

/* ------------------------------------------------------------- the time */

let firstRead: number | null = null;
const noSubscribe = () => () => undefined;

/**
 * The time on this device, read once. It's null while the page is being built on the server,
 * because a pre-built page can't depend on the moment it was built.
 */
export function useNow(): number | null {
  return useSyncExternalStore(
    noSubscribe,
    () => (firstRead ??= Date.now()),
    () => null,
  );
}

/** Today in Brisbane as "YYYY-MM-DD", or null while building on the server. */
export function useToday(): string | null {
  const now = useNow();
  return now === null ? null : new Date(now + 10 * 3_600_000).toISOString().slice(0, 10);
}

/** Starts a file download without leaving the page or opening a pop-up. */
export function downloadFile(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
}
