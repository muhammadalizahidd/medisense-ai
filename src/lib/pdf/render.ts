import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { registerFonts } from "./fonts";

type Doc = Parameters<typeof renderToBuffer>[0];

/** Renders a document to the bytes of a PDF file. */
export async function renderPdf(element: ReactElement): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(element as Doc);
}
