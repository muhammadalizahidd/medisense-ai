import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { PageGuideFloating } from "@/components/shell/page-guide";
import { PresenterPanel } from "@/components/shell/presenter-panel";
import { TabBar } from "@/components/shell/tab-bar";
import { TopBar } from "@/components/shell/top-bar";
import { Toaster } from "@/components/ui/toast";
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
 * Dates follow today (see `lib/clock`), so pages render per request instead of being frozen
 * at build time; the browser computes the same day, so hydration matches.
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
        <Toaster />
        <AppearanceSync />
        <Suspense fallback={<div className="min-h-screen bg-page" />}>
          <Today>
            <div className="flex min-h-screen bg-page">
              <div data-chrome className="contents">
                <Sidebar />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div data-chrome className="contents">
                  <TopBar />
                </div>
                <div className="min-w-0 flex-1">{children}</div>
                <div data-chrome className="contents">
                  <TabBar />
                </div>
              </div>
            </div>
            <div data-chrome className="contents">
              <PageGuideFloating />
              <PresenterPanel />
            </div>
          </Today>
        </Suspense>
      </body>
    </html>
  );
}
