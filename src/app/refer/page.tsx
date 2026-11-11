import type { Metadata } from "next";
import { PublicShell } from "@/features/live/public-shell";
import { ReferralForm } from "@/features/live/referral-form";

export const metadata: Metadata = { title: "Make a referral · Medisense" };

/** Public: participants, families and referrers send a referral without creating an account. */
export default function ReferPage() {
  return (
    <PublicShell
      title="Make a referral"
      description="For participants, families, support coordinators and other referrers. No account needed: you'll get a reference number and a private link to follow the referral."
    >
      <ReferralForm mode="public" />
    </PublicShell>
  );
}
