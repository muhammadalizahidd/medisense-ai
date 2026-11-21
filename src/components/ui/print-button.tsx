"use client";

import { Printer } from "lucide-react";
import { Button } from "./button";

/** Prints the page; the app frame and on-screen controls hide in print. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}
