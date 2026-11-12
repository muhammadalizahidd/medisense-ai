#!/usr/bin/env node
// Fails when components use raw colours, gradients, glow or the old theme hooks.
// Usage: node scripts/check-design.mjs   (add to package.json: "check:design")
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["src"];
const SKIP = [/globals\.css$/, /theme-script\.tsx$/, /fonts\.ts$/, /\.test\./, /node_modules/];
const EXT = new Set([".tsx", ".ts", ".jsx", ".js", ".css"]);
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b(?![-\w])/g, "raw hex colour: use a token utility (bg-surface, text-ink-700…)"],
  [/\brgba?\(|\bhsla?\(|\boklch\(/g, "raw colour function: use a token"],
  [/\b(bg|from|via|to)-(gradient|\[linear|\[radial)/g, "gradient: the design is flat"],
  [/\blinear-gradient\(|\bradial-gradient\(/g, "gradient: the design is flat"],
  [/\b(?:text|bg|border|ring|fill|stroke|from|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g, "Tailwind palette colour: use a semantic token"],
  [/\bblue:/g, "old blue: variant: remove"],
  [/data-palette/g, "old data-palette: use data-theme / data-accent"],
  [/\b(Sparkles|Wand2?|WandSparkles)\b/g, "sparkle/wand icon: use <AiMark />"],
  [/shadow-\[0_0_/g, "glow shadow: not allowed"],
];

const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (SKIP.some((r) => r.test(p))) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (EXT.has(extname(p))) files.push(p);
  }
};
ROOTS.forEach(walk);

let count = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/design-ok/.test(line)) return; // escape hatch: // design-ok <reason>
    for (const [re, msg] of RULES) {
      re.lastIndex = 0;
      if (re.test(line)) { count++; console.log(`${f}:${i + 1}  ${msg}\n    ${line.trim().slice(0, 140)}`); }
    }
  });
}
if (count) { console.log(`\n✗ ${count} design violation(s).`); process.exit(1); }
console.log("✓ No design violations.");
