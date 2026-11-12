import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata = { title: "Design check · Medisense", robots: { index: false } };

/** Every shared component in every state, for checking the design across themes. Dev only. */
export default function DesignCheckPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
