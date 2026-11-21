import type { Metadata } from "next";
import { TherapistApp } from "@/features/live/therapist-app";

export const metadata: Metadata = { title: "Therapist app · Medisense" };

export default function TherapistAppPage() {
  return <TherapistApp />;
}
