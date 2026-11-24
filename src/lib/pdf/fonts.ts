import path from "node:path";
import { Font } from "@react-pdf/renderer";
import { FONT } from "./theme";

let registered = false;

/** Inter in the four weights the documents use. Registered once per server process. */
export function registerFonts() {
  if (registered) return;
  const file = (weight: number) =>
    path.join(process.cwd(), "src/assets/fonts", `inter-${weight}.woff`);
  Font.register({
    family: FONT,
    fonts: [400, 500, 600, 700].map((weight) => ({ src: file(weight), fontWeight: weight })),
  });
  // A name or a reference number should never be split across two lines.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
