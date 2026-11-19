import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { AssistantFullPage } from "@/components/shell/assistant-page";

export const metadata: Metadata = { title: "Ask Medisense AI · Medisense" };

export default function AssistantPage() {
  return (
    <PageContainer>
      <AssistantFullPage />
    </PageContainer>
  );
}
