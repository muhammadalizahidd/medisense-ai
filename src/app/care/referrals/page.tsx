import { redirect } from "next/navigation";

/** Referrals is now a tab of Patients. */
export default function Page() {
  redirect("/care?tab=referrals");
}
