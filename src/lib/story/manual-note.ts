import { noteSectionTitles, type SessionNote } from "./types";

/**
 * A note the clinician writes without drafting help: their dictated or typed lines start in
 * Subjective, and every other section begins empty for them to fill in.
 */
export function manualNote(lines: string[]): SessionNote {
  const sections = Object.fromEntries(
    noteSectionTitles.map(({ id }) => [id, [{ id: `own-${id}`, text: "", line: null }]]),
  ) as SessionNote["sections"];
  if (lines.length) {
    sections.subjective = lines.map((text, i) => ({
      id: `own-line-${i + 1}`,
      text,
      line: i + 1,
    }));
  }
  return { sections, missing: [] };
}
