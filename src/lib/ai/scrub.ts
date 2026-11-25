import { mentionsAi, withoutAiWording } from "./wording";

/*
 * The safety net behind the explicit labels: while the switch is off, any text left on the page
 * (seeded records, stored audit entries, server messages) is reworded where it is shown. Nothing
 * stored changes, and turning the switch back on restores the originals.
 */

const ATTRIBUTES = ["aria-label", "title", "placeholder", "alt"] as const;
/** Typed text belongs to the person; the switch's own screen has to name what it switches. */
const SKIP = "script,style,textarea,[contenteditable='true'],[data-keep-words]";

type Change = { from: string; to: string };

/**
 * React owns these nodes, and changing one before it hydrates breaks hydration. React stores the
 * props on an element once it and the text inside it have been checked against the server's HTML.
 */
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactProps$"));

export function startScrub() {
  const texts = new Map<Text, Change>();
  const attributes = new Map<Element, Map<string, Change>>();
  let retry: number | undefined;
  let waiting = false;
  /*
   * While a page is first loading, React may hydrate a section, pause and check it again, so
   * nothing is touched until the document has loaded and the main thread has gone quiet.
   */
  let settled = false;

  function text(node: Text) {
    const parent = node.parentElement;
    const value = node.nodeValue ?? "";
    if (!parent || !mentionsAi(value) || parent.closest(SKIP)) return;
    if (parent.tagName !== "TITLE" && !hydrated(parent)) {
      waiting = true;
      return;
    }
    const to = withoutAiWording(value);
    texts.set(node, { from: value, to });
    node.nodeValue = to;
  }

  function element(el: Element) {
    if (el.closest("script,style,[data-keep-words]")) return;
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (!value || !mentionsAi(value)) continue;
      if (!hydrated(el)) {
        waiting = true;
        continue;
      }
      const to = withoutAiWording(value);
      const changes = attributes.get(el) ?? new Map<string, Change>();
      attributes.set(el, changes.set(name, { from: value, to }));
      el.setAttribute(name, to);
    }
  }

  function walk(root: Node) {
    if (root instanceof Text) return text(root);
    if (!(root instanceof Element)) return;
    element(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text) text(node);
      else element(node as Element);
    }
  }

  /** Streamed sections hydrate after they appear, so anything skipped is tried again shortly. */
  function sweep() {
    waiting = false;
    walk(document.head);
    walk(document.body);
    schedule();
  }
  function schedule() {
    if (!waiting || retry !== undefined) return;
    retry = window.setTimeout(() => {
      retry = undefined;
      sweep();
    }, 120);
  }

  const observer = new MutationObserver((records) => {
    if (!settled) return;
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(walk);
      else if (r.type === "characterData") walk(r.target);
      else element(r.target as Element);
    }
    schedule();
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES],
  });
  let idle: number | undefined;
  const settle = () => {
    const start = () => {
      settled = true;
      sweep();
    };
    idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 2000 })
      : window.setTimeout(start, 200);
  };
  if (document.readyState === "complete") settle();
  else window.addEventListener("load", settle, { once: true });

  return () => {
    observer.disconnect();
    window.removeEventListener("load", settle);
    if (idle !== undefined) {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    }
    window.clearTimeout(retry);
    // Restore only what nobody has rewritten since.
    for (const [node, c] of texts) if (node.nodeValue === c.to) node.nodeValue = c.from;
    for (const [el, changes] of attributes) {
      for (const [name, c] of changes) {
        if (el.getAttribute(name) === c.to) el.setAttribute(name, c.from);
      }
    }
  };
}
