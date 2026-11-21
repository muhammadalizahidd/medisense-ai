"use client";

import { useEffect, useRef } from "react";
import { loadAppearance, saveAppearance } from "@/app/theme-script";
import { useSession } from "@/lib/live/client";

/**
 * Applies the appearance saved on a person's profile when they sign in on another device.
 * The theme script has already painted the device copy, so this only changes something when the
 * two differ.
 */
export function AppearanceSync() {
  const { user } = useSession();
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.appearance || applied.current === user.id) return;
    applied.current = user.id;
    if (JSON.stringify(user.appearance) !== JSON.stringify(loadAppearance())) {
      saveAppearance(user.appearance);
    }
  }, [user]);
  return null;
}
