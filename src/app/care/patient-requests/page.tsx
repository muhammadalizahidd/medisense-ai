import { redirect } from "next/navigation";

/** Patient requests is now a tab of Patients. */
export default function Page() {
  redirect("/care?tab=requests");
}
