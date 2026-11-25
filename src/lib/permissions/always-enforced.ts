/**
 * Rules that have no role: they protect patients and the record, so they are not toggles. The
 * roles screen lists them so nobody looks for a switch that does not exist.
 */
export const alwaysEnforced: readonly { title: string; detail: string }[] = [
  {
    title: "Signed records change only by amendment",
    detail:
      "Only the assessing or treating therapist signs, amends, checks in and records a session.",
  },
  {
    title: "Patients never see clinical notes",
    detail:
      "Families and patients never see clinical notes, risks or recordings. Recording is off by default.",
  },
  {
    title: "Restricted disciplines stay with their discipline",
    detail: "Psychology and trauma content is shared only when explicitly shared.",
  },
  {
    title: "Discharge needs outcomes and a signature",
    detail:
      "A discharge cannot be completed without recorded outcomes and a signature. The 48-hour rule also applies.",
  },
  {
    title: "No approving your own request",
    detail: "The person who started an approval cannot decide it. Only the Super Admin is exempt.",
  },
  {
    title: "Invoices carry no clinical narrative",
    detail: "Finance sees what a visit cost, never what happened in it.",
  },
  {
    title: "AI drafts need a named person",
    detail:
      "AI never writes the clinical assessment, and every AI output needs a named human approval before it counts.",
  },
  {
    title: "Only the Super Admin switches AI on or off",
    detail: "The organisation switch stops every AI feature at once, and each change is audited.",
  },
  {
    title: "Everything is audited",
    detail:
      "Every create, edit, approval and permission change is recorded. The audit trail cannot be edited.",
  },
  {
    title: "The Super Admin is fixed",
    detail:
      "There is one Super Admin. It cannot be deactivated or have permissions removed, and it only moves through a transfer.",
  },
];
