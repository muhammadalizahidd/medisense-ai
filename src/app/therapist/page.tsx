import { redirect } from "next/navigation";

/** New patient requests now sit at the top of Patients, so the old address opens there. */
export default function TherapistPage() {
  redirect("/therapist/patients");
}
