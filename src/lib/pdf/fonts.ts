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
  // Ordinary words stay whole. A long unbroken token (a reference, a link) is allowed to break every
  // 10 characters, as a last resort when its column is too narrow, so it can never run into the
  // column beside it or off the page. Dashes inside it are left alone.
  Font.registerHyphenationCallback((word) =>
    word.length <= 14 ? [word] : (word.match(/.{1,10}/g) ?? [word]),
  );
  registered = true;
}
