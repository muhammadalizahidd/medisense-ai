import type { Metadata } from "next";
import { CheckinByLink } from "@/features/live/enhance-public";
import { PublicShell } from "@/features/live/public-shell";

export const metadata: Metadata = { title: "Pre-visit check-in · Medisense" };

/** Public: a pre-visit check-in by secure link, for someone without the app. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <PublicShell
      title="Pre-visit check-in"
      description="A few questions before your visit, so your therapist can prepare. Your answers go only to your care team."
    >
      <CheckinByLink token={token} />
    </PublicShell>
  );
}
