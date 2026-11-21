"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PresenterPanel = dynamic(
  () => import("./presenter-panel").then((m) => m.PresenterPanel),
  { ssr: false },
);

/**
 * Listens for the presenter shortcut and loads the panel on the first press, so nobody else
 * downloads it. After that the panel handles its own toggling.
 */
export function PresenterLauncher() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        (event.key === "." || event.key === ">")
      ) {
        event.preventDefault();
        setArmed(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  return armed ? <PresenterPanel startOpen /> : null;
}
