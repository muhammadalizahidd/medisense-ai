"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
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
  const [value, setValue] = useState(status);
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
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    api<T>(url)
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

  useLiveEvents(
    (event) => {
      if (event.type === "connected" || reloadOn?.(event)) reload();
    },
    url !== null && reloadOn !== undefined,
  );

  return { ...state, reload };
}

export function useSession() {
  const me = useResource<{ user: SessionUser | null }>("/api/auth/me");
  return { user: me.data?.user ?? null, loading: me.loading && !me.data, reload: me.reload };
}

export async function signOut() {
  await api("/api/auth/logout", { method: "POST" });
  disconnect();
}
