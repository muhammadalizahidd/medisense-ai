import { appsForRole, landingPath } from "@/lib/permissions/apps";
import { currentUser } from "@/server/auth";
import { handle } from "@/server/http";
import { heldPermissions } from "@/server/permissions";
import { sessionUser } from "@/server/session-user";

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return { user: null };
    const apps = appsForRole(user.role, heldPermissions(user), user.staffRoles);
    return {
      user: await sessionUser(user),
      apps,
      home: landingPath(user.role, user.staffRoles, apps),
    };
  });
}
