/** One role as the roles screen sees it. */
export type RoleDto = {
  slug: string;
  name: string;
  description: string;
  builtIn: boolean;
  /** What a person's account stores when they hold this role. */
  key: string;
  permissions: string[];
  /** How many accounts hold it. */
  memberCount: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type RolesDto = { roles: RoleDto[] };
