// Medisense typefaces. Each font exposes a CSS variable that globals.css reads through
// data-type="…". Only the default set (Instrument) is preloaded; the others download on demand
// when someone picks them in Appearance.
//
// next/font needs every option written out in each call (no shared object or spread).
import {
  Atkinson_Hyperlegible,
  Fraunces,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Sans,
  Instrument_Serif,
  Inter,
  Inter_Tight,
  JetBrains_Mono,
  Literata,
  Newsreader,
  Source_Code_Pro,
  Source_Sans_3,
  Source_Serif_4,
} from "next/font/google";

export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--ff-instrument-serif",
  display: "swap",
});
export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--ff-instrument-sans",
  display: "swap",
});
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--ff-jetbrains-mono",
  display: "swap",
});

export const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--ff-newsreader",
});
export const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--ff-source-sans",
});
export const sourceCode = Source_Code_Pro({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "500"],
  variable: "--ff-source-code",
});
export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--ff-fraunces",
});
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--ff-inter",
});
export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--ff-source-serif",
});
export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "500", "600", "700"],
  variable: "--ff-plex-sans",
});
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "500"],
  variable: "--ff-plex-mono",
});
export const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["500", "600"],
  variable: "--ff-inter-tight",
});
export const literata = Literata({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--ff-literata",
});
export const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "700"],
  variable: "--ff-atkinson",
});

/** Put this on <html className={fontVariables}>. */
export const fontVariables = [
  instrumentSerif,
  instrumentSans,
  jetbrainsMono,
  newsreader,
  sourceSans,
  sourceCode,
  fraunces,
  inter,
  sourceSerif,
  plexSans,
  plexMono,
  interTight,
  literata,
  atkinson,
]
  .map((f) => f.variable)
  .join(" ");
