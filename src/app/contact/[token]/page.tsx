import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/features/live/bits";
import { ContactView } from "@/features/live/contact-view";
import { PublicShell } from "@/features/live/public-shell";

export const metadata: Metadata = {
  title: "Appointments · Medisense",
  robots: { index: false, follow: false },
};

async function View({ params }: { params: Promise<{ token: string }> }) {
  return <ContactView token={(await params).token} />;
}

/** Public: an authorised guardian or coordinator sees appointments only (AT-24). */
export default function ContactPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <PublicShell title="Appointments">
      <Suspense fallback={<Skeleton className="h-96 max-w-180" />}>
        <View params={params} />
      </Suspense>
    </PublicShell>
  );
}
