import type { StateStorage } from "zustand/middleware";

/**
 * sessionStorage with writes batched. The demo store changes on every keystroke in a note, and
 * serialising the whole state each time blocks typing. The latest value is written after a short
 * pause and again when the tab is hidden or closed, so a refresh never loses anything.
 */
export function debouncedSessionStorage(delay = 300): StateStorage {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const [name, value] of pending) {
      try {
        sessionStorage.setItem(name, value);
      } catch {
        // Storage can be full or blocked; the demo carries on from memory.
      }
    }
    pending.clear();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => pending.get(name) ?? sessionStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      pending.delete(name);
      sessionStorage.removeItem(name);
    },
  };
}
