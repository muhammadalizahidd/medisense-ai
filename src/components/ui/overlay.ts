import { useEffect, useRef } from "react";

/*
 * Overlays (sheets, dialogs, prompts) can open on top of each other. Only the topmost one answers
 * Escape and keeps Tab inside it, so closing a prompt never also closes the dialog behind it.
 */

const stack: symbol[] = [];

/** Registers an overlay for as long as it is mounted; returns whether it is the topmost one. */
export function useOverlayStack() {
  const id = useRef(Symbol("overlay"));
  useEffect(() => {
    const mine = id.current;
    stack.push(mine);
    return () => {
      const i = stack.indexOf(mine);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
  return () => stack[stack.length - 1] === id.current;
}

/** Stops the page behind an overlay from scrolling while it is open. */
export function useScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}
