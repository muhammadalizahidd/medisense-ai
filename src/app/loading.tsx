import { PageLoading } from "@/components/ui/page";

/** Shown at once while any page loads, so moving between pages never shows a blank screen. */
export default function Loading() {
  return <PageLoading />;
}
