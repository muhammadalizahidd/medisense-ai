/** Medisense works in Brisbane, which has no daylight saving: always UTC+10. */
export const BRISBANE_OFFSET_MINUTES = 10 * 60;
const ZONE = "Australia/Brisbane";
const MINUTE = 60_000;
const DAY = 86_400_000;

/** The Brisbane calendar day of an instant, as midnight UTC of that day (a stable day key). */
export function brisbaneDay(at: Date): Date {
  const shifted = new Date(at.getTime() + BRISBANE_OFFSET_MINUTES * MINUTE);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** 1 = Monday … 7 = Sunday, for a day key from `brisbaneDay`. */
export function isoWeekday(day: Date) {
  return ((day.getUTCDay() + 6) % 7) + 1;
}

/** The instant at `minutes` after midnight Brisbane time on a day key. */
export function atBrisbane(day: Date, minutes: number): Date {
  return new Date(day.getTime() + (minutes - BRISBANE_OFFSET_MINUTES) * MINUTE);
}

/** Minutes after midnight, Brisbane time. */
export function brisbaneMinutes(at: Date) {
  return (Math.floor(at.getTime() / MINUTE) + BRISBANE_OFFSET_MINUTES + 1440 * 2) % 1440;
}

export function addDays(day: Date, days: number) {
  return new Date(day.getTime() + days * DAY);
}

/** "Thu 13 Nov" */
export function shortDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

/** "9:30 am" */
export function timeOfDay(value: Date | string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(value))
    .replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}

/** "Thu 13 Nov, 9:30 am" */
export function slotLabel(value: Date | string) {
  return `${shortDate(value)}, ${timeOfDay(value)}`;
}

/** "just now", "5 min ago", "3 h ago", or a date. */
export function relativeTime(value: Date | string, now = Date.now()) {
  const minutes = Math.round((now - new Date(value).getTime()) / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return shortDate(value);
}

/** Whole years between a "YYYY-MM-DD" birth date and now. */
export function ageFrom(dateOfBirth: string | null, now = new Date()) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
