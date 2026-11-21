import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import { PresenterLauncher } from "@/components/shell/presenter-launcher";
import { TabBar } from "@/components/shell/tab-bar";
import { TopBar } from "@/components/shell/top-bar";
import { DashboardLoading } from "@/components/ui/page";
import { themeInitScript } from "@/lib/theme";
import { DemoStoreHydrator } from "@/state/demo-store-hydrator";
import "./globals.css";

/** Headings and large figures. */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

/** The interface. */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument-sans",
});

/** Codes, references and keyboard hints. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  preload: false,
  variable: "--font-jetbrains-mono",
});

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
      data-theme="clear-blue"
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <DemoStoreHydrator />
        <div className="flex min-h-screen bg-page">
          <Suspense
            fallback={
              <div className="hidden h-screen w-16 flex-none border-r border-sidebar-border bg-sidebar md:block xl:w-sidebar" />
            }
          >
            <Sidebar />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            <Suspense
              fallback={<div className="min-h-16 border-b border-border bg-topbar" />}
            >
              <TopBar />
            </Suspense>
            <div className="min-w-0 flex-1">
              <Suspense fallback={<DashboardLoading />}>
                <Today>{children}</Today>
              </Suspense>
            </div>
            <Suspense
              fallback={
                <div className="sticky bottom-0 h-16 flex-none border-t border-sidebar-border bg-sidebar md:hidden" />
              }
            >
              <TabBar />
            </Suspense>
          </div>
        </div>
        <PresenterLauncher />
      </body>
    </html>
  );
}
