/**
 * Pages drawn without the staff sidebar and top bar: the phone apps, sign-in and the public links
 * sent to patients. Kept free of imports so the root layout can check it without loading the menu.
 */
export function isStandalone(pathname: string) {
  return (
    pathname.startsWith("/family") ||
    pathname.startsWith("/mobile") ||
    pathname === "/login" ||
    pathname === "/refer" ||
    pathname.startsWith("/refer/") ||
    pathname.startsWith("/join/") ||
    pathname.startsWith("/checkin/") ||
    pathname.startsWith("/appointment/") ||
    pathname.startsWith("/agreement/") ||
    pathname.startsWith("/upload/") ||
    pathname.startsWith("/contact/")
  );
}

/** Standalone pages that still read the demo store, so it must be restored there too. */
export function usesDemoStore(pathname: string) {
  return (
    !isStandalone(pathname) ||
    pathname.startsWith("/family") ||
    pathname.startsWith("/mobile/family") ||
    pathname.startsWith("/mobile/staff")
  );
}
