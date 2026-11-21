import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PrintButton } from "@/components/ui/print-button";
import { emilyReport } from "@/data/progress-report";
import { ReportDraft, ReportSources } from "@/features/progress-report/report-draft";

export const metadata: Metadata = { title: "Emily Carter · Progress report · Medisense" };

export default function EmilyProgressReportPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow={emilyReport.eyebrow}
        title={emilyReport.client}
        description={emilyReport.meta}
        actions={<PrintButton />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-4 print:hidden">
          <ReportSources />
        </aside>
        <div className="lg:col-span-8 print:col-span-12">
          <ReportDraft />
        </div>
      </div>
    </PageContainer>
  );
}
