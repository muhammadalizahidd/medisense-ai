import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { FormsWorkspace } from "@/features/forms/forms-workspace";

export const metadata: Metadata = { title: "Smart forms · Medisense" };

export default function FormsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Intake & admin"
        title="Smart forms"
        description="Funding requests, agreements and consents filled from verified patient data, approved notes and referrals. Staff complete the gaps; nothing is submitted until every required field is checked."
      />
      <Suspense
        fallback={
          <div
            className="h-96 animate-pulse rounded-card bg-border motion-reduce:animate-none"
            aria-busy="true"
          />
        }
      >
        <FormsWorkspace />
      </Suspense>
    </PageContainer>
  );
}
