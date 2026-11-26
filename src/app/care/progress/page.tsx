import { redirect } from "next/navigation";

/** Progress and reports is now a tab of Clinical; single records keep their own pages. */
export default function Page() {
  redirect("/care/records?tab=progress");
}
