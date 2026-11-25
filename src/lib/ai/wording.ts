/*
 * The wording used while the organisation has the AI switch off. Screens pass labels through
 * here, and the page scrub applies it to anything left over, including stored records, so the
 * word never shows. Order matters: the exact phrases come before the general rules.
 */

const phrases: readonly [RegExp, string][] = [
  [/\bAI Assisted\b/g, "Assisted"],
  [/\bMedisense AI\b(?![ -]\w)/g, "Medisense"],
  [/\bAsk AI\b/g, "Ask"],
  [/\bLive AI\b/g, "Live assistance"],
  [/\bNotes for AI\b/g, "Notes for drafting"],
  [/\bused AI\b(?![ -]\w)/g, "used assistance"],
  [/, not AI\b(?![ -]\w)/g, ""],
  [/\b([Ww])hat AI prepared\b/g, "$1hat was prepared"],
  [/\b(filled|written|drafted|read) by AI\b/gi, "$1 automatically"],
  [/\b(could|can|does|should|would) AI\b(?![ -]\w*(?:draft|note|brief|answer))/gi, "$1 the system"],
  // "drafts" as a thing rather than something the system does.
  [/^AI drafts$/g, "Drafts"],
  [/(?<=[\w}] )AI drafts\b/g, "drafts"],
  [/\bAI drafts(?=(?:, (?:signing|amendments))| (?:awaiting|waiting|are)\b)/g, "drafts"],
  [/\b([Aa])n AI[ -](?=[b-df-hj-np-tv-z])/g, "$1 "],
  [/\bAsk Medisense AI\b/g, "Ask Medisense"],
  [/\bAI briefs\b/g, "Supervision briefs"],
  [/\bAI brief\b/g, "Supervision brief"],
  [/\bAI [Ww]orkspace\b/g, "Workspace"],
  [/\b(Operations|Reports) and AI\b(?![ -]\w)/g, "$1"],
  [/\bAI and reports\b/g, "Reports"],
  [/\bAI[ -](?:assisted|powered)\b[ -]?/gi, ""],
  [/\bAI[ -](prepared|generated|drafted|suggested|extracted)\b/gi, "$1"],
  [/,? (?:and|or) AI\b(?![ -]\w)/g, ""],
  [/ (?:with|by|from|using) (?:the )?AI\b(?![ -]\w)/gi, ""],
  [/\bnever AI\b/g, "never automatic"],
  // "AI drafts it" describes the assistant doing something; the system does it instead.
  [
    /\bAI (?=(?:drafts|reads|suggests|prepares|writes|checks|flags|fills|copies|turns|thinks|leaves|never|can|may|will|is|was|has)\b)/g,
    "the system ",
  ],
  [/\bAI ?[·:—] /g, ""],
  [/ ?[·—] AI\b(?![ -]\w)/g, ""],
  [/\bAI[ -](?=\w)/g, ""],
];

const lone = /^\s*AI\s*$/;

/** True when a line is about the feature itself, so lists can leave it out instead of rewording. */
export const mentionsAi = (text: string) => /\bAI\b/.test(text);

/** The same text without the word "AI". Text that never had it comes back unchanged. */
export function withoutAiWording(text: string): string {
  if (!mentionsAi(text)) return text;
  if (lone.test(text)) return text.replace("AI", "Assist");
  let out = text;
  for (const [pattern, replacement] of phrases) out = out.replace(pattern, replacement);
  out = out
    .replace(/\bAI\b/g, "assisted")
    // Tidy what removing a word leaves behind, and keep sentences starting with a capital.
    .replace(/ {2,}/g, " ")
    .replace(/ ([,.;:!?])(?=\s|$)/g, "$1")
    .replace(/([.!?] )([a-z])/g, (_, lead: string, first: string) => lead + first.toUpperCase());
  // A fragment that began in lower case is mid-sentence and stays that way.
  if (!/^\s*[a-z]/.test(text)) {
    out = out.replace(/^(\s*)([a-z])/, (_, lead: string, c: string) => lead + c.toUpperCase());
  }
  return /^\s/.test(text) ? out : out.trimStart();
}
