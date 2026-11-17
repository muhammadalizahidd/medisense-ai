import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/features/live/bits";
import { FundingUpload } from "@/features/live/funding-upload";
import { PublicShell } from "@/features/live/public-shell";

export const metadata: Metadata = {
  title: "Send documents · Medisense",
  robots: { index: false, follow: false },
};

async function Upload({ params }: { params: Promise<{ token: string }> }) {
  return <FundingUpload token={(await params).token} />;
}

/** Public: send the plan documents Medisense asked for. No account needed. */
export default function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <PublicShell title="Send your documents">
      <Suspense fallback={<Skeleton className="h-96 max-w-160" />}>
        <Upload params={params} />
      </Suspense>
    </PublicShell>
  );
}
