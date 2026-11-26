import { redirect } from "next/navigation";

/** Treatment plans is now a tab of Clinical; single records keep their own pages. */
export default function Page() {
  redirect("/care/records?tab=plans");
}
