/** The organisation's AI switch as the browser sees it. */
export type AiFeaturesDto = {
  enabled: boolean;
  /** False when there is no database: the choice then lives in this browser (offline demo). */
  persisted: boolean;
  canChange: boolean;
  signedIn: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};
