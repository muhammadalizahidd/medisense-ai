"use client";

import { type ReactNode } from "react";
import { Dialog } from "./dialog";

/**
 * A "View all" list in the shared popup. Rows run edge to edge on a white card, so they keep
 * their own padding inside the dialog's body.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  toolbar,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Filters or tabs that stay put while the body scrolls. */
  toolbar?: ReactNode;
  /** Kept for callers; every popup now shares one size. */
  size?: "md" | "lg";
}) {
  return (
    <Dialog title={title} description={description} onRequestClose={onClose} toolbar={toolbar}>
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-card border border-border bg-surface">
        {children}
      </div>
    </Dialog>
  );
}
