import type { Metadata } from "next";
import { ReferralForm } from "@/features/live/referral-form";

export const metadata: Metadata = {
  title: "Make a referral · Medisense",
  robots: { index: false, follow: false },
};

/** The referral form as it appears inside the patient app: phone-first, no page chrome. */
export default function AppReferralPage() {
  return (
    <main className="min-h-dvh bg-surface">
      {/* Scrolling stays, but no scrollbars inside the phone. */}
      <style>{`html,body{overflow-x:clip;scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}`}</style>
      <ReferralForm mode="public" embedded />
    </main>
  );
}
