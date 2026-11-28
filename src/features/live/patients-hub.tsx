"use client";

import { Copy, ExternalLink, Plus } from "lucide-react";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { useResource, useSession } from "@/lib/live/client";
import type { ReferralSummaryDto } from "@/lib/live/types";
import { canOpenPage, pageAccessFor } from "@/lib/permissions/pages";
import { LiveBadge } from "./bits";
import { CareBoard } from "./care-board";
import { PatientRequests } from "./patient-requests";
import { ReferralQueue } from "./referral-queue";

const allTabs = [
  { id: "patients", label: "Patients" },
  { id: "referrals", label: "Referrals" },
  { id: "requests", label: "Patient requests" },
] as const;

type TabId = (typeof allTabs)[number]["id"];

/**
 * One place for a patient's whole journey in the office: the referral that brings them in, the
 * patient waiting for and then seeing a therapist, and the corrections they ask for in their app.
 * Each tab shows only to people whose role opens it.
 */
export function PatientsHub() {
  const { user } = useSession();
  const access = user?.role === "admin" ? pageAccessFor(user) : null;
  const canReferrals = canOpenPage("/care/referrals", access);
  const canRequests = canOpenPage("/care/patient-requests", access);

  const referrals = useResource<{ referrals: ReferralSummaryDto[] }>(
    canReferrals ? "/api/care/referrals" : null,
    (e) => e.type === "care",
  );
  const requests = useResource<{ requests: { status: string }[] }>(
    canRequests ? "/api/care/patient-requests" : null,
    (e) => e.type === "care",
  );
  const newReferrals = (referrals.data?.referrals ?? []).filter(
    (r) => r.status === "Submitted" || r.status === "Under Admin Review",
  ).length;
  const waitingRequests = (requests.data?.requests ?? []).filter(
    (r) => r.status === "Pending",
  ).length;

  const tabs = allTabs
    .filter((t) => (t.id === "referrals" ? canReferrals : t.id === "requests" ? canRequests : true))
    .map((t) =>
      t.id === "referrals"
        ? { ...t, count: newReferrals, alert: newReferrals > 0 }
        : t.id === "requests"
          ? { ...t, count: waitingRequests, alert: waitingRequests > 0 }
          : t,
    );
  const [chosen, setTab] = useTab<TabId>(allTabs);
  // A tab named in the address but closed to this person falls back to Patients.
  const tab: TabId = tabs.some((t) => t.id === chosen) ? chosen : "patients";
  const [copied, setCopied] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Patients"
        description="Every patient from referral to active care, and the changes they ask for in their app"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge />
            {tab === "referrals" && canReferrals && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(`${window.location.origin}/refer`);
                    setCopied(true);
                  }}
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-small font-semibold text-ink-900 hover:bg-canvas"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  {copied ? "Link copied" : "Copy public form link"}
                </button>
                <ButtonLink href="/refer" target="_blank">
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Public form
                </ButtonLink>
              </>
            )}
            {canReferrals && (
              <ButtonLink href="/care/new" variant="primary">
                <Plus className="size-4" aria-hidden="true" />
                Enter a referral
              </ButtonLink>
            )}
          </div>
        }
      />
      {tabs.length > 1 && <Tabs label="Patients" tabs={tabs} value={tab} onChange={setTab} />}
      <TabPanel id="patients" value={tab}>
        <CareBoard embedded />
      </TabPanel>
      {canReferrals && (
        <TabPanel id="referrals" value={tab}>
          <ReferralQueue embedded />
        </TabPanel>
      )}
      {canRequests && (
        <TabPanel id="requests" value={tab}>
          <PatientRequests embedded />
        </TabPanel>
      )}
    </>
  );
}
