/** Screens with nothing left on them while the switch is off, and where to send people instead. */
const only: readonly [path: string, instead: string][] = [
  ["/care/ai-agent", "/care/operations"],
  ["/care/ai-oversight", "/care/operations"],
  ["/therapist/ai", "/therapist"],
  ["/assistant", "/"],
  ["/sessions/oliver-grant/prepared", "/sessions/oliver-grant"],
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Holds the switch itself, so it stays open to whoever can turn the features back on. */
export const AI_SWITCH_ROUTE = "/care/ai-oversight";

/** Where a switched-off screen sends people, or null when the screen stays. */
export function aiRouteRedirect(path: string, canChange = false) {
  if (canChange && under(path, AI_SWITCH_ROUTE)) return null;
  return only.find(([p]) => under(path, p))?.[1] ?? null;
}

/** For menus: whether a link leads to a screen that is switched off for this person. */
export const isAiOnlyRoute = (href: string, canChange = false) =>
  aiRouteRedirect(href, canChange) !== null;
