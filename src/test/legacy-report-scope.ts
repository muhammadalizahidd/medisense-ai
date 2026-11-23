import {
  domains,
  shareScopes,
  type Domain,
  type ReportScope,
  type ShareScope,
} from "@/lib/live/reports";

/**
 * The reporting scope an office-staff account got from its role names, before scopes followed
 * permissions. Frozen here as the oracle the permission defaults are tested against.
 */
export function legacyAdminScope(staffRoles: readonly string[]): ReportScope {
  const d = new Set<Domain>();
  const det = new Set<Domain>();
  const share = new Set<ShareScope>(["Private"]);
  const teams = new Set<string>();
  const has = (r: string) => staffRoles.includes(r);
  let clinical = false;
  let schedule = false;
  const add = (list: Domain[], detail: Domain[] = list) => {
    list.forEach((x) => d.add(x));
    detail.forEach((x) => det.add(x));
  };
  if (has("Super Admin")) {
    add(
      [...domains],
      domains.filter((x) => x !== "Clinical Operations"),
    );
    ["Team", "Organisation"].forEach((s) => share.add(s as ShareScope));
    ["Intake", "Scheduling", "Clinical", "Finance", "Operations"].forEach((t) => teams.add(t));
    schedule = true;
  }
  if (has("Operations Manager")) {
    add(
      [
        "Referrals",
        "Participants",
        "Staff",
        "Scheduling",
        "Clinical Operations",
        "Telehealth",
        "Automation",
        "Audit",
      ],
      ["Referrals", "Participants", "Staff", "Scheduling", "Telehealth", "Automation", "Audit"],
    );
    ["Team", "Organisation"].forEach((s) => share.add(s as ShareScope));
    teams.add("Operations");
    schedule = true;
  }
  if (has("Intake Officer")) {
    add(["Referrals", "Participants"]);
    share.add("Team");
    teams.add("Intake");
  }
  if (has("Scheduler")) {
    add(["Scheduling", "Telehealth"]);
    share.add("Team");
    teams.add("Scheduling");
  }
  if (has("Clinical Lead")) {
    add(["Clinical Operations", "Staff", "Scheduling", "Participants", "Telehealth"]);
    clinical = true;
    share.add("Team");
    teams.add("Clinical");
    schedule = true;
  }
  if (has("Finance") || has("Finance Manager")) {
    add(["Finance"]);
    share.add("Team");
    teams.add("Finance");
    if (has("Finance Manager")) schedule = true;
  }
  const label = has("Super Admin")
    ? has("Clinical Lead")
      ? "Director (clinical scope)"
      : "Director"
    : has("Operations Manager")
      ? "Operations Manager"
      : has("Clinical Lead")
        ? "Clinical Lead"
        : has("Finance Manager")
          ? "Finance Manager"
          : [
              has("Intake Officer") && "Intake",
              has("Scheduler") && "Scheduling",
              has("Finance") && "Finance",
            ]
              .filter(Boolean)
              .join(", ") || "Staff";
  return {
    label,
    domains: domains.filter((x) => d.has(x)),
    detail: domains.filter((x) => det.has(x)),
    clinicalDetail: clinical,
    share: shareScopes.filter((s) => share.has(s)),
    schedule,
    teams: [...teams],
  };
}
