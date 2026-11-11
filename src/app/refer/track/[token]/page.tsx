import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/features/live/bits";
import { PublicShell } from "@/features/live/public-shell";
import { ReferralTracker } from "@/features/live/referral-tracker";

export const metadata: Metadata = {
  title: "Referral progress · Medisense",
  robots: { index: false, follow: false },
};

async function Tracker({ params }: { params: Promise<{ token: string }> }) {
  return <ReferralTracker token={(await params).token} />;
}

export default function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <PublicShell title="Referral progress">
      <Suspense fallback={<Skeleton className="h-64 max-w-180" />}>
        <Tracker params={params} />
      </Suspense>
    </PublicShell>
  );
}
