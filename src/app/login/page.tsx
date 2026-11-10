import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { clinicians } from "@/data/clinicians";
import { SignInScreen, type TestAccount } from "@/features/live/sign-in-screen";
import { homeFor, safeNext } from "@/lib/live/routes";
import { currentUser } from "@/server/auth";
import { DatabaseUnavailable } from "@/server/db";
import { staffEmail } from "@/server/seed";

export const metadata: Metadata = { title: "Sign in · Medisense" };

/** Seeded accounts, listed on the sign-in page only while running locally. */
function testAccounts(): TestAccount[] | null {
  if (process.env.NODE_ENV !== "development") return null;
  const pick = ["emma-clarke", "sarah-thompson", "olivia-reyes", "nadia-hassan"];
  return [
    { name: "Jo Marsh", role: "Admin", email: "jo.marsh@medisense.test" },
    { name: "Neil Hensley", role: "Admin", email: "neil.hensley@medisense.test" },
    ...clinicians
      .filter((c) => pick.includes(c.id))
      .map((c) => ({ name: c.name, role: c.discipline, email: staffEmail(c.name) })),
  ];
}

/** Reads the address and session inside Suspense, so the page shell can show straight away. */
async function SignInGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  let offline = false;
  try {
    const user = await currentUser();
    if (user) redirect(next ?? homeFor(user.role));
  } catch (error) {
    if (!(error instanceof DatabaseUnavailable)) throw error;
    offline = true;
  }
  return <SignInScreen next={next} offline={offline} testAccounts={testAccounts()} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<SignInScreen next={null} offline={false} testAccounts={null} />}>
      <SignInGate searchParams={searchParams} />
    </Suspense>
  );
}
