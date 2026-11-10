import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInScreen } from "@/features/live/sign-in-screen";
import { homeFor, safeNext } from "@/lib/live/routes";
import { currentUser } from "@/server/auth";
import { DatabaseUnavailable } from "@/server/db";

export const metadata: Metadata = { title: "Sign in · Medisense" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  let offline = false;
  try {
    const user = await currentUser();
    if (user) redirect(next ?? homeFor(user.role));
  } catch (error) {
    if (!(error instanceof DatabaseUnavailable)) throw error;
    offline = true;
  }
  return <SignInScreen next={next} offline={offline} />;
}
