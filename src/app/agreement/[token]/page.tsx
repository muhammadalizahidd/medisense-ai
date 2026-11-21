import type { Metadata } from "next";
import { Suspense } from "react";
import { AgreementPublic } from "@/features/live/agreement-public";
import { Skeleton } from "@/features/live/bits";
import { PublicShell } from "@/features/live/public-shell";

export const metadata: Metadata = {
  title: "Your service agreement · Medisense",
  robots: { index: false, follow: false },
};

async function Agreement({ params }: { params: Promise<{ token: string }> }) {
  return <AgreementPublic token={(await params).token} />;
}

/** Public: the signatory reads and accepts, asks to change or declines (AT-18, AT-30). */
export default function AgreementPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <PublicShell title="Your service agreement">
      <Suspense fallback={<Skeleton className="h-96 max-w-4xl" />}>
        <Agreement params={params} />
      </Suspense>
    </PublicShell>
  );
}
