"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/live/client";
import type { PhotoKind } from "@/lib/avatars";
import { Button } from "./button";
import { Avatar } from "./premium";
import { toast } from "./toast";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE = 15 * 1024 * 1024;
const SIDE = 320;

/** Crops the middle square of a photo and shrinks it, so uploads stay small and load quickly. */
export async function squarePhoto(file: File): Promise<string> {
  if (!ACCEPT.split(",").includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  if (file.size > MAX_SOURCE) throw new Error("Choose a photo under 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That photo couldn't be opened."));
      img.src = url;
    });
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    if (edge < 64) throw new Error("Choose a larger photo.");
    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("That photo couldn't be opened.");
    ctx.imageSmoothingQuality = "high";
    // Faces sit in the upper part of most portraits, so a tall photo is cropped a little high.
    const sx = (image.naturalWidth - edge) / 2;
    const sy = image.naturalHeight > edge ? (image.naturalHeight - edge) * 0.3 : 0;
    ctx.drawImage(image, sx, sy, edge, edge, 0, 0, SIDE, SIDE);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** For a new record: choose a photo, see it, change or remove it before the form is sent. */
export function PhotoPicker({
  name,
  value,
  onChange,
  kind,
  label = "Profile photo",
}: {
  name: string;
  value: string | null;
  onChange: (photo: string | null) => void;
  kind: PhotoKind;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await squarePhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn't be opened.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      {value ? (
        <Avatar
          name={name || "New"}
          size={72}
          kind={kind}
          src={value}
          className="ring-4 ring-accent-tint"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-18 flex-none items-center justify-center rounded-full border border-dashed border-border-strong bg-sunken text-ink-500"
        >
          <Camera className="size-6" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <label htmlFor={id} className="block text-small font-semibold text-ink-900">
          {label} <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <p className="text-caption text-ink-500">
          A clear, recent photo of their face. JPEG, PNG or WebP; it&apos;s cropped to a square.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" loading={busy} onClick={() => input.current?.click()}>
            <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {value ? "Change photo" : "Choose photo"}
          </Button>
          {value && (
            <Button size="sm" variant="danger" onClick={() => onChange(null)}>
              <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Remove
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-caption text-over">
            {error}
          </p>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
    </div>
  );
}

/**
 * The profile header's avatar for an existing record, with a camera button to upload a new photo
 * or remove the uploaded one. Saves straight away.
 */
export function PhotoEdit({
  owner,
  id,
  name,
  photoUrl,
  kind,
  size = 72,
  className,
  editable = true,
}: {
  owner: "therapist" | "client";
  id: string;
  name: string;
  photoUrl: string | null;
  kind: PhotoKind;
  size?: number;
  className?: string;
  editable?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(photoUrl);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // A newer photo from the server (another tab, a reload) replaces the one shown.
  const [seen, setSeen] = useState(photoUrl);
  if (seen !== photoUrl) {
    setSeen(photoUrl);
    setCurrent(photoUrl);
  }
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function save(photo: string | null) {
    setBusy(true);
    try {
      const r = await api<{ photoUrl: string | null }>(`/api/photos/${owner}/${id}`, {
        body: { photo },
      });
      setCurrent(r.photoUrl);
      toast(photo ? "Photo updated" : "Photo removed", { tone: "success" });
    } catch (e) {
      toast("Couldn't save the photo", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    try {
      await save(await squarePhoto(file));
    } catch (e) {
      toast("Couldn't use that photo", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try another one.",
      });
    }
  }

  const avatar = <Avatar name={name} size={size} kind={kind} src={current} className={className} />;
  if (!editable) return avatar;
  return (
    <div ref={menu} className="relative">
      {avatar}
      <button
        type="button"
        aria-label={`Change ${name}'s photo`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => (current ? setOpen((o) => !o) : input.current?.click())}
        className={cn(
          "absolute -bottom-1 -left-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-surface bg-accent-fill text-on-accent transition-transform duration-(--duration-fast) hover:bg-accent-fill-hover active:scale-[0.96] disabled:cursor-wait",
          busy && "motion-safe:animate-pulse",
        )}
      >
        <Camera className="size-4" strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-30 mt-2 w-48 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-overlay"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              input.current?.click();
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-small text-ink-900 hover:bg-sunken"
          >
            <ImagePlus className="size-4 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
            Upload a new photo
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void save(null);
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-small text-over hover:bg-over-bg"
          >
            <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Remove photo
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
    </div>
  );
}
