import type { Metadata } from "next";
import { ClientApp } from "@/features/live/client-app";

export const metadata: Metadata = { title: "Patient app · Medisense" };

export default function ClientAppPage() {
  return <ClientApp />;
}
