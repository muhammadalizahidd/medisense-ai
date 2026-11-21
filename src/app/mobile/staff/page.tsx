import type { Metadata } from "next";
import { AdminApp } from "@/features/live/admin-app";

export const metadata: Metadata = { title: "Admin app · Medisense" };

export default function AdminAppPage() {
  return <AdminApp />;
}
