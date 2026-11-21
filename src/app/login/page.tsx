import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { clinicians } from "@/data/clinicians";
import { SignInScreen, type TestAccount } from "@/features/live/sign-in-screen";
import { homeFor, safeNext } from "@/lib/live/routes";
import { currentUser } from "@/server/auth";
import { DatabaseUnavailable } from "@/server/db";
import { sessionUser } from "@/server/session-user";
import type { SessionUser } from "@/lib/live/types";
import { staffEmail } from "@/server/seed";

export const metadata: Metadata = { title: "Sign in · Medisense" };

/**
 * Demo accounts, listed on the sign-in page so reviewers can pick one. Only the email is filled in;
 * the password is still needed. Set HIDE_TEST_ACCOUNTS=1 to remove the list once real people use it.
 */
function testAccounts(): TestAccount[] | null {
  if (process.env.HIDE_TEST_ACCOUNTS === "1") return null;
  const pick = ["emma-clarke", "daniel-okafor", "sarah-thompson", "olivia-reyes", "nadia-hassan"];
  return [
    {
      name: "Neil Hensley",
      role: "Super Admin · Clinical Lead",
      email: "neil.hensley@medisense.test",
    },
    {
      name: "Jo Marsh",
      role: "Admin · Intake, scheduling, finance",
      email: "jo.marsh@medisense.test",
    },
    {
      name: "Morgan Blake",
      role: "Admin · Finance Manager (approvals)",
      email: "morgan.blake@medisense.test",
    },
    {
      name: "Sam Rivera",
      role: "Admin · Intake and scheduling (no finance)",
      email: "sam.rivera@medisense.test",
    },
    ...clinicians
      .filter((c) => pick.includes(c.id))
      .map((c) => ({ name: c.name, role: c.discipline, email: staffEmail(c.name) })),
  ];
}

/** Reads the address and session inside Suspense, so the page shell can show straight away. */
async function SignInGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  let offline = false;
  // Signed in with a temporary password: they choose their own here before going anywhere.
  let pending: SessionUser | null = null;
  try {
    const user = await currentUser();
    if (user?.mustChangePassword) pending = sessionUser(user);
    else if (user) redirect(next ?? homeFor(user.role, user.staffRoles));
  } catch (error) {
    if (!(error instanceof DatabaseUnavailable)) throw error;
    offline = true;
  }
  return (
    <SignInScreen
      next={next}
      offline={offline}
      pendingUser={pending}
      testAccounts={pending ? null : testAccounts()}
      oneClick={process.env.HIDE_TEST_ACCOUNTS !== "1"}
    />
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<SignInScreen next={null} offline={false} testAccounts={null} />}>
      <SignInGate searchParams={searchParams} />
    </Suspense>
  );
}
