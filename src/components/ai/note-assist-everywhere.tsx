"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { NoteAssist, wantsAssist } from "./note-assist";

/** Chat composers and search boxes are not notes. */
const NOT_NOTES = /^(write a message|message|question|ask|tell the booking agent|search)/i;

function labelOf(el: HTMLTextAreaElement) {
  const own = el.getAttribute("aria-label");
  if (own) return own;
  const byId = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const wrap = byId ?? el.closest("label");
  const text = wrap?.textContent?.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);
  const prev = el.previousElementSibling?.textContent?.trim();
  return (prev || el.placeholder || "Note").slice(0, 80);
}

/** Sets a React-controlled textarea's value the way typing would, so its state updates. */
function setValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function Attached({ el, label }: { el: HTMLTextAreaElement; label: string }) {
  const value = useSyncExternalStore(
    (notify) => {
      el.addEventListener("input", notify);
      return () => el.removeEventListener("input", notify);
    },
    () => el.value,
    () => "",
  );
  return (
    <NoteAssist label={label} value={value} onChange={(v) => setValue(el, v)} className="mt-1.5" />
  );
}

/**
 * Gives every note box in the app the same two helpers, Dictate and Write with AI, without each
 * screen wiring them up. Boxes that already show the helpers, chat composers and fields such as
 * reasons or addresses are skipped.
 */
export function NoteAssistEverywhere() {
  const [boxes, setBoxes] = useState<
    { el: HTMLTextAreaElement; host: HTMLElement; label: string }[]
  >([]);
  useEffect(() => {
    const seen = new Map<HTMLTextAreaElement, HTMLElement>();
    let queued = false;
    let counter = 0;
    const scan = () => {
      queued = false;
      let changed = false;
      for (const [el, host] of seen) {
        if (!el.isConnected) {
          host.remove();
          seen.delete(el);
          changed = true;
        }
      }
      for (const el of document.querySelectorAll<HTMLTextAreaElement>("textarea")) {
        if (seen.has(el) || el.readOnly || el.disabled || el.dataset.noAssist !== undefined)
          continue;
        // A box whose screen already shows the helpers next to it keeps those.
        if ([...(el.parentElement?.children ?? [])].some((c) => c.hasAttribute("data-note-assist")))
          continue;
        const label = labelOf(el);
        if (NOT_NOTES.test(label) || !wantsAssist(label)) {
          el.dataset.noAssist = "";
          continue;
        }
        const host = document.createElement("div");
        host.dataset.noteAssistHost = String((counter += 1));
        el.insertAdjacentElement("afterend", host);
        seen.set(el, host);
        changed = true;
      }
      if (changed) setBoxes([...seen].map(([el, host]) => ({ el, host, label: labelOf(el) })));
    };
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(scan);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => {
      observer.disconnect();
      for (const host of seen.values()) host.remove();
    };
  }, []);
  return (
    <>
      {boxes.map(({ el, host, label }) => (
        <PortalBox key={host.dataset.noteAssistHost} el={el} host={host} label={label} />
      ))}
    </>
  );
}

function PortalBox({
  el,
  host,
  label,
}: {
  el: HTMLTextAreaElement;
  host: HTMLElement;
  label: string;
}) {
  return createPortal(<Attached el={el} label={label} />, host);
}
