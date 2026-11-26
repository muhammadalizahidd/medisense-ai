import type { Role as UserRole } from "@/lib/live/types";
import { navigationFor } from "@/lib/navigation";
import { landingPath, type AppAccess } from "./apps";
import { canOpenPage, type PageAccess } from "./pages";

/** Pages every admin shares (messages, the shared work queue); used only when nothing else opens. */
const LAST_RESORT = ["/care/messages", "/care/operations"];

/**
 * Where a person lands. The usual home when they may open it; otherwise, for an admin, the first
 * page of their own menu. Finance roles, for one, can't open the patients page that is the usual
 * admin home, and sending them there again would loop.
 */
export function landingFor(
  role: UserRole,
  staffRoles: readonly string[] | null | undefined,
  apps: AppAccess,
  access: PageAccess,
): string {
  const usual = landingPath(role, staffRoles, apps);
  if (role !== "admin" || canOpenPage(usual, access)) return usual;
  const menu = navigationFor("Admin", access, { liveOnly: true })
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => href !== usual && canOpenPage(href, access));
  return menu.find((href) => !LAST_RESORT.includes(href)) ?? menu[0] ?? "/profile";
}
