import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/features/live/bits";
import { JoinCall } from "@/features/live/join-call";
import { PublicShell } from "@/features/live/public-shell";

export const metadata: Metadata = {
  title: "Join your video visit · Medisense",
  robots: { index: false, follow: false },
};

async function Join({ params }: { params: Promise<{ token: string }> }) {
  return <JoinCall token={(await params).token} />;
}

/** Public: the participant joins with the one-time link, no account needed. */
export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <PublicShell title="Your video visit">
      <Suspense fallback={<Skeleton className="h-96 max-w-180" />}>
        <Join params={params} />
      </Suspense>
    </PublicShell>
  );
}
