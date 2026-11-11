import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import { PresenterPanel } from "@/components/shell/presenter-panel";
import { TabBar } from "@/components/shell/tab-bar";
import { TopBar } from "@/components/shell/top-bar";
import { themeInitScript } from "@/lib/theme";
import { DemoStoreHydrator } from "@/state/demo-store-hydrator";
import "./globals.css";

/** Headings and large figures. */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
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
  variable: "--font-jetbrains-mono",
});

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
      data-theme="clear-blue"
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <DemoStoreHydrator />
        <Suspense fallback={<div className="min-h-screen bg-page" />}>
          <Today>
            <div className="flex min-h-screen bg-page">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <TopBar />
                <div className="min-w-0 flex-1">{children}</div>
                <TabBar />
              </div>
            </div>
            <PresenterPanel />
          </Today>
        </Suspense>
      </body>
    </html>
  );
}
