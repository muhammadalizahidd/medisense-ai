import { PageContainer } from "@/components/ui/page";

/** Shown in place of a live page when the database can't be reached. */
export function OfflinePage() {
  return (
    <PageContainer>
      <div
        role="alert"
        className="mx-auto max-w-140 rounded-card border border-border bg-surface p-6"
      >
        <h1 className="type-display text-h2">We can&apos;t reach the database</h1>
        <p className="mt-2 text-small text-ink-700">
          Live patients, requests and messages need the database. Check the connection and reload
          this page.
        </p>
      </div>
    </PageContainer>
  );
}
