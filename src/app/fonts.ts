// Medisense typefaces. Each font exposes a CSS variable that globals.css reads
// through data-type="…". Only the default set (Instrument) is preloaded; the
// others download on demand when a user picks them in Appearance.
import {
  Instrument_Serif, Instrument_Sans, JetBrains_Mono,
  Newsreader, Source_Sans_3, Source_Code_Pro,
  Fraunces, Inter, Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono,
  Inter_Tight, Literata, Atkinson_Hyperlegible,
} from "next/font/google";

export const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--ff-instrument-serif", display: "swap" });
export const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--ff-instrument-sans", display: "swap" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--ff-jetbrains-mono", display: "swap" });

const lazy = { subsets: ["latin"] as ["latin"], display: "swap" as const, preload: false };
export const newsreader = Newsreader({ ...lazy, variable: "--ff-newsreader" });
export const sourceSans = Source_Sans_3({ ...lazy, variable: "--ff-source-sans" });
export const sourceCode = Source_Code_Pro({ ...lazy, weight: ["400", "500"], variable: "--ff-source-code" });
export const fraunces = Fraunces({ ...lazy, variable: "--ff-fraunces" });
export const inter = Inter({ ...lazy, variable: "--ff-inter" });
export const sourceSerif = Source_Serif_4({ ...lazy, variable: "--ff-source-serif" });
export const plexSans = IBM_Plex_Sans({ ...lazy, weight: ["400", "500", "600", "700"], variable: "--ff-plex-sans" });
export const plexMono = IBM_Plex_Mono({ ...lazy, weight: ["400", "500"], variable: "--ff-plex-mono" });
export const interTight = Inter_Tight({ ...lazy, weight: ["500", "600"], variable: "--ff-inter-tight" });
export const literata = Literata({ ...lazy, variable: "--ff-literata" });
export const atkinson = Atkinson_Hyperlegible({ ...lazy, weight: ["400", "700"], variable: "--ff-atkinson" });

/** Put this on <html className={fontVariables}>. */
export const fontVariables = [
  instrumentSerif, instrumentSans, jetbrainsMono, newsreader, sourceSans, sourceCode,
  fraunces, inter, sourceSerif, plexSans, plexMono, interTight, literata, atkinson,
].map((f) => f.variable).join(" ");
