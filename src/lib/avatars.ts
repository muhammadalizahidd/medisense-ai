/**
 * Demo profile photos (public/avatars, from Unsplash; see CREDITS.md there). Keyed by display
 * name. Staff and patients are kept apart because a few patients share a name with a clinician.
 * Children, and names shared by more than one patient, keep their initials on purpose.
 */
const staff: Record<string, string> = {
  "Sarah Thompson": "sarah-thompson",
  "Neil Hensley": "neil-hensley",
  "Jo Marsh": "jo-marsh",
  "Emma Clarke": "emma-clarke",
  "Jessica Nguyen": "jessica-nguyen",
  "Marcus Bell": "marcus-bell",
  "Daniel Okafor": "daniel-okafor",
  "Hannah Wright": "hannah-wright",
  "Tom Fitzgerald": "tom-fitzgerald",
  "Liam Patel": "liam-patel",
  "Ben Holloway": "ben-holloway",
  "Aisha Karim": "aisha-karim",
  "Jacob Morris": "jacob-morris",
  "Nadia Hassan": "nadia-hassan",
  "Olivia Reyes": "olivia-reyes",
  "Chloe Adams": "chloe-adams",
  "Ryan Cole": "ryan-cole",
  "Sam O'Connor": "sam-o-connor",
  "Lucy Grant": "lucy-grant",
  "Olivia Carter": "olivia-carter",
  "Arslan Zafar": "arslan-zafar",
  "Sam Rivera": "sam-rivera",
  "Morgan Blake": "morgan-blake",
  "Helen Brooks": "helen-brooks",
  "Marco Silva": "marco-silva",
  "Priya Raman": "priya-raman",
  "Grace Liu": "grace-liu",
  "Mei Tanaka": "mei-tanaka",
  "Ethan Walsh": "ethan-walsh",
  "Jordan Lee": "jordan-lee",
  "Noah Bennett": "noah-bennett",
};

const patients: Record<string, string> = {
  "Harper Nguyen": "harper-nguyen",
  "Harold Pike": "harold-pike",
  "Edith Collins": "edith-collins",
  "Charlotte MacLeod": "charlotte-macleod",
  "Alex Chen": "alex-chen",
  "Marcus Doyle": "marcus-doyle",
  "Ruby Nguyen": "ruby-nguyen",
  "Elsie Fitzroy": "elsie-fitzroy",
  "Olivia Reed": "olivia-reed",
  "Priya Raman": "priya-raman-p",
  "Pippa Whitmore": "pippa-whitmore",
  "Matilda Singh": "matilda-singh",
  "Priya Shah": "priya-shah",
  "Grace Whitfield": "grace-whitfield",
  "Frankie Delaney": "frankie-delaney",
  "Ivy Murray": "ivy-murray",
  "Isabella Kowalski": "isabella-kowalski",
  "Sienna Tanaka": "sienna-tanaka",
  "Aria Ashworth": "aria-ashworth",
  "Darcy Huang": "darcy-huang",
  "Kai Thompson": "kai-thompson",
  "Mason Fernando": "mason-fernando",
  "Daniel Kovac": "daniel-kovac",
  "Jasper Castillo": "jasper-castillo",
  "Jordan Lee": "jordan-lee-p",
  "Lucas Ferreira": "lucas-ferreira",
  "Xavier Dubois": "xavier-dubois",
  "Lachlan O'Brien": "lachlan-obrien",
  "Remy Sorensen": "remy-sorensen",
  "Lincoln Harlow": "lincoln-harlow",
  "Oscar Papadopoulos": "oscar-papadopoulos",
  "Kai Abara": "kai-abara",
  "Beau Petrov": "beau-petrov",
  "William Park": "william-park",
  "Walter Reid": "walter-reid",
};

export type PhotoKind = "staff" | "patient";

/** With no kind, staff are matched first (signed-in users, team lists). */
export function photoFor(name: string | null | undefined, kind?: PhotoKind): string | null {
  const n = name?.trim();
  if (!n) return null;
  const key =
    kind === "patient" ? patients[n] : kind === "staff" ? staff[n] : (staff[n] ?? patients[n]);
  return key ? `/avatars/${key}.jpg` : null;
}
