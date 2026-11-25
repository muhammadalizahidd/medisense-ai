import { AiRouteGuard } from "@/components/ai/ai-route-guard";
import { AiSwitchSync } from "@/components/ai/ai-switch-sync";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { PageGuideFloating } from "@/components/shell/page-guide";
import { PresenterLauncher } from "@/components/shell/presenter-launcher";
import { TabBar } from "@/components/shell/tab-bar";
import { TopBar } from "@/components/shell/top-bar";
import { Toaster } from "@/components/ui/toast";
import { DashboardLoading } from "@/components/ui/page";
import { NamePhotos } from "@/components/ui/name-photos";
import { NoteAssistEverywhere } from "@/components/ai/note-assist-everywhere";
import { AppearanceSync } from "@/features/appearance/appearance-sync";
import { DemoStoreHydrator } from "@/state/demo-store-hydrator";
import { fontVariables } from "./fonts";
import { ThemeScript } from "./theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medisense · Clinical Operations & Supervision",
  description:
    "Medisense Clinical Operations & Supervision Intelligence Platform: an AI-assisted operational layer for allied health teams.",
};

/**
 * Dates follow today (see `lib/clock`), so page content renders per request instead of being
 * frozen at build time; the browser computes the same day, so hydration matches. Only the page
 * waits here: the sidebar and top bar are prerendered and show immediately.
 */
async function Today({ children }: { children: ReactNode }) {
  await connection();
  return children;
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en-AU"
      data-theme="premium-light"
      data-scheme="light"
      data-accent="paired"
      data-type="instrument"
      data-density="comfortable"
      data-text="default"
      suppressHydrationWarning
      className={fontVariables}
    >
      <head>
        <ThemeScript />
      </head>
      <body suppressHydrationWarning>
        <DemoStoreHydrator />
        <Suspense fallback={null}>
          <AiSwitchSync />
        </Suspense>
        <Toaster />
        <AppearanceSync />
        <NoteAssistEverywhere />
        <NamePhotos />
        <div className="flex min-h-screen bg-page">
          <div data-chrome className="contents">
            <Suspense
              fallback={
                <div className="xl:w-sidebar hidden h-screen w-16 flex-none border-r border-sidebar-border bg-sidebar md:block" />
              }
            >
              <Sidebar />
            </Suspense>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div data-chrome className="contents">
              <Suspense
                fallback={<div className="min-h-(--topbar-h) border-b border-border bg-topbar" />}
              >
                <TopBar />
              </Suspense>
            </div>
            <div className="min-w-0 flex-1">
              <Suspense fallback={<DashboardLoading />}>
                <Today>
                  <AiRouteGuard>{children}</AiRouteGuard>
                </Today>
              </Suspense>
            </div>
            <div data-chrome className="contents">
              <Suspense
                fallback={
                  <div className="sticky bottom-0 h-16 flex-none border-t border-sidebar-border bg-sidebar md:hidden" />
                }
              >
                <TabBar />
              </Suspense>
            </div>
          </div>
        </div>
        <div data-chrome className="contents">
          <Suspense fallback={null}>
            <PageGuideFloating />
          </Suspense>
          <PresenterLauncher />
        </div>
      </body>
    </html>
  );
}
