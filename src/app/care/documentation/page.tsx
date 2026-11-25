import { redirect } from "next/navigation";

/** Documentation is now the Notes tab of Sessions and notes. */
export default function Page() {
  redirect("/care/sessions?tab=notes");
}
