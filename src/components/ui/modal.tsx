"use client";

import { type ReactNode } from "react";
import { Dialog } from "./dialog";

/**
 * A centred window for seeing a whole list without the page underneath changing shape: the "View
 * all" behind a short list. The body runs edge to edge so list rows keep their own padding.
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
  size?: "md" | "lg";
}) {
  return (
    <Dialog
      title={title}
      description={description}
      onRequestClose={onClose}
      toolbar={toolbar}
      size={size === "lg" ? "wide" : "md"}
      plain
      flush
    >
      {children}
    </Dialog>
  );
}
