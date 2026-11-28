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
  size = "md",
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Filters or tabs that stay put while the body scrolls. */
  toolbar?: ReactNode;
  /** A list reads best at `md`; `lg` for wide tables. */
  size?: "md" | "lg";
}) {
  return (
    <Dialog
      title={title}
      description={description}
      onRequestClose={onClose}
      toolbar={toolbar}
      size={size}
    >
      <div className="w-full overflow-hidden rounded-card border border-border bg-surface">
        {children}
      </div>
    </Dialog>
  );
}
