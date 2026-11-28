"use client";

import { useEffect } from "react";
import { photoFor } from "@/lib/avatars";

/** Text that is exactly a person's name, in a cell or label with nothing else inside it. */
const CANDIDATES = "main :is(span, p, a, td, strong, b, h2, h3, h4, div, button, dd)";
const NAME = /^[A-Z][A-Za-z'’-]+(?: [A-Z][A-Za-z'’-]+){1,2}$/;

/**
 * Puts the person's photo beside their name in tables, lists and cards across the app, so every
 * screen reads as people rather than rows. It only adds a marker and a CSS variable to the name;
 * the page's own markup is never changed, and rows that already show a photo are left alone.
 */
/** React marks every element it has hydrated or rendered with an internal key. */
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

export function NamePhotos() {
  useEffect(() => {
    let queued = false;
    const scan = () => {
      queued = false;
      for (const el of document.querySelectorAll<HTMLElement>(CANDIDATES)) {
        if (el.childElementCount > 0 || el.dataset.photo !== undefined) continue;
        if (el.closest("[data-no-photo]")) continue;
        // A name React hasn't hydrated yet must keep the server's HTML exactly, or hydration
        // reports a mismatch; the timed scans below come back for it.
        if (!hydrated(el)) continue;
        const text = el.textContent?.trim() ?? "";
        if (text.length > 34 || !NAME.test(text)) continue;
        const row = el.closest("tr, li, [role=row]") ?? el.parentElement;
        // Skip when the row, card or anything up to six levels around the name already shows a
        // photo or avatar: the page drew its own.
        let near: HTMLElement | null = el;
        let hasPhoto = false;
        for (let up = 0; up < 6 && near && !hasPhoto; up++) {
          if (near.querySelector("img, [data-avatar]")) hasPhoto = true;
          if (near.matches("tr, li, [role=row]")) break;
          near = near.parentElement;
        }
        if (hasPhoto || row?.querySelector("img")) continue;
        if (/text-h1|text-display/.test(el.className)) continue;
        const patient = /\b(MRN|REF)-/.test(row?.textContent ?? "");
        const src = photoFor(text, patient ? "patient" : undefined);
        if (!src) continue;
        el.dataset.photo = "";
        el.style.setProperty("--name-photo", `url("${src}")`);
      }
    };
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(scan);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    // Hydration changes nothing the observer can see, so look again as streamed parts finish.
    const timers = [300, 1000, 2500].map((ms) => setTimeout(scan, ms));
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);
  return null;
}
