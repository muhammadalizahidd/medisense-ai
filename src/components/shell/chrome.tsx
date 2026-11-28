"use client";

import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { isStandalone, usesDemoStore } from "@/lib/standalone";

/*
 * The staff sidebar, top bar and tab bar are loaded only on staff pages. The phone
 * apps, sign-in and patient links render none of them, so they don't download that code at all:
 * a module loaded through `dynamic` is fetched only where it renders. On staff pages the server
 * still renders them into the HTML, so nothing appears late.
 */
const Sidebar = dynamic(() => import("./sidebar").then((m) => m.Sidebar));
const TopBar = dynamic(() => import("./top-bar").then((m) => m.TopBar));
const TabBar = dynamic(() => import("./tab-bar").then((m) => m.TabBar));
const PageGuideFloating = dynamic(() => import("./page-guide").then((m) => m.PageGuideFloating));
const DemoStoreHydrator = dynamic(() =>
  import("@/state/demo-store-hydrator").then((m) => m.DemoStoreHydrator),
);

/** Pages opened inside a phone app carry ?embed=1 and hide the staff chrome, so skip loading it. */
export const EMBED_PARAM = "embed";

function useStaffPage() {
  const path = usePathname() ?? "";
  const embedded = useSearchParams()?.get(EMBED_PARAM) === "1";
  return !isStandalone(path) && !embedded;
}

export function ChromeSidebar() {
  return useStaffPage() ? <Sidebar /> : null;
}

export function ChromeTopBar() {
  return useStaffPage() ? <TopBar /> : null;
}

export function ChromeTabBar() {
  return useStaffPage() ? <TabBar /> : null;
}

/** The floating guide is the other way round: standalone pages only, staff pages use the top bar. */
export function ChromePageGuide() {
  return isStandalone(usePathname() ?? "") ? <PageGuideFloating /> : null;
}

export function ChromeDemoStore() {
  return usesDemoStore(usePathname() ?? "") ? <DemoStoreHydrator /> : null;
}
