import type { Metadata } from "next";
import { Suspense } from "react";
import { AppointmentLink } from "@/features/live/appointment-link";
import { Skeleton } from "@/features/live/bits";
import { PublicShell } from "@/features/live/public-shell";

export const metadata: Metadata = {
  title: "Your appointment · Medisense",
  robots: { index: false, follow: false },
};

async function Appointment({ params }: { params: Promise<{ token: string }> }) {
  return <AppointmentLink token={(await params).token} />;
}

/** Public: the participant confirms or asks to change a visit from a secure link (AT-10). */
export default function AppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <PublicShell title="Your appointment">
      <Suspense fallback={<Skeleton className="h-96 max-w-160" />}>
        <Appointment params={params} />
      </Suspense>
    </PublicShell>
  );
}
