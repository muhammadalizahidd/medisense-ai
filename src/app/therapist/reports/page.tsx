import { redirect } from "next/navigation";

/** Therapist reports now live with their progress: one place for figures and clinical reports. */
export default function Page() {
  redirect("/therapist/progress");
}
