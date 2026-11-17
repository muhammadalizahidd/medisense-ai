"use client";

import { Check, IdCard, PieChart, X } from "lucide-react";
import { useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag, type TagTone } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard, td, th } from "./funding-bits";
import { KpiBand, ops, tableBox, tableHead, when } from "./ops-bits";

type Req = {
  id: string;
  field: string;
  from: string;
  to: string;
  kind: string;
  status: string;
  reason: string;
  at: string;
  decidedBy: string;
  clientId: string;
  participant: string;
  mrn: string;
};

const tabs = [
  { id: "Pending", label: "Waiting for review" },
  { id: "Approved", label: "Approved" },
  { id: "Rejected", label: "Not approved" },
  { id: "Withdrawn", label: "Withdrawn" },
] as const;

/** ISO dates read as Australian dates; other values stay as typed. */
const au = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v);

const tone: Record<string, TagTone> = {
  Pending: "watch",
  Approved: "healthy",
  Rejected: "over",
  Withdrawn: "neutral",
};

/** Modules 18–19: identity and health-record changes patients asked for in the app. */
export function PatientRequests() {
  const res = useResource<{ requests: Req[] }>(
    "/api/care/patient-requests",
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  const [rejecting, setRejecting] = useState<Req | null>(null);
  const now = useNow();
  const [reason, setReason] = useState("");
  if (res.error && !res.data) return <ErrorNote message={res.error} onRetry={res.reload} />;
  const all = res.data?.requests ?? [];
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const oldest = all
    .filter((r) => r.status === "Pending")
    .map((r) => r.at)
    .sort()[0];
  const decide = async (r: Req, decision: "Approve" | "Reject", why = "") => {
    const ok = await ops(
      "/api/care/patient-requests",
      { id: r.id, decision, reason: why },
      decision === "Approve"
        ? "Approved; the record is updated"
        : "Not approved; the patient sees why",
    );
    if (ok) res.reload();
    return ok;
  };
  const byKind = ["Identity", "Medical record"].map((k, i) => ({
    id: k,
    label: k === "Identity" ? "Name or date of birth" : "Health information",
    value: all.filter((r) => r.kind === k).length,
    colour: i ? colour.series2 : colour.series1,
  }));
  const rows = all.filter((r) => r.status === tab);
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Patient requests"
        description="Corrections patients asked for in their app. Identity changes apply only when approved; clinicians decide on health information."
        actions={<LiveBadge />}
      />
      <KpiBand
        label="Request figures"
        items={[
          {
            label: "Waiting for review",
            value: count("Pending"),
            sub: "Oldest first",
            tone: count("Pending") ? "watch" : undefined,
            onClick: () => setTab("Pending"),
          },
          {
            label: "Approved",
            value: count("Approved"),
            sub: "Record updated",
            onClick: () => setTab("Approved"),
          },
          {
            label: "Not approved",
            value: count("Rejected"),
            sub: "Reason shown to the patient",
            onClick: () => setTab("Rejected"),
          },
          {
            label: "Oldest waiting",
            value:
              oldest && now
                ? `${Math.max(0, Math.floor((now - Date.parse(oldest)) / 864e5))} day${Math.floor((now - Date.parse(oldest)) / 864e5) === 1 ? "" : "s"}`
                : "None",
            sub: "Aim to decide within 2 working days",
          },
          {
            label: "Health information",
            value: all.filter((r) => r.kind === "Medical record" && r.status === "Pending").length,
            sub: "Waiting for the clinician",
          },
          {
            label: "Withdrawn",
            value: count("Withdrawn"),
            sub: "By the patient",
            onClick: () => setTab("Withdrawn"),
          },
        ]}
      />
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <div className="flex flex-col xl:col-span-8">
          <Tabs
            tabs={tabs.map((t) => ({ ...t, count: count(t.id) }))}
            value={tab}
            onChange={setTab}
            label="Request status"
          />
          {tabs.map((t) => (
            <TabPanel key={t.id} id={t.id} value={tab}>
              {!res.data ? (
                <Skeleton className="mt-4 h-64" />
              ) : (
                <div className={tableBox}>
                  <table className="w-full text-left text-small">
                    <thead className={tableHead}>
                      <tr>
                        <th className={th}>Patient</th>
                        <th className={th}>Change asked for</th>
                        <th className={th}>Received</th>
                        <th className={th}>Status</th>
                        <th className={th}>
                          <span className="sr-only">Decision</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-canvas">
                          <td className={td}>
                            <a
                              href={`/care/${r.clientId}`}
                              className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                            >
                              {r.participant}
                            </a>
                            <span className="block font-mono text-caption text-ink-500">
                              {r.mrn}
                            </span>
                          </td>
                          <td className={td}>
                            <span className="font-semibold">{r.field}</span>
                            {r.from && (
                              <span className="block text-caption text-ink-500">
                                From: {au(r.from)}
                              </span>
                            )}
                            <span className="block text-caption text-ink-700">To: {au(r.to)}</span>
                            {r.reason && (
                              <span className="block text-caption text-ink-500">{r.reason}</span>
                            )}
                          </td>
                          <td className={td}>{when(r.at)}</td>
                          <td className={td}>
                            <Tag tone={tone[r.status] ?? "neutral"}>
                              {r.status === "Rejected" ? "Not approved" : r.status}
                            </Tag>
                            {r.decidedBy && (
                              <span className="mt-1 block text-caption text-ink-500">
                                {r.decidedBy}
                              </span>
                            )}
                          </td>
                          <td className={`${td} text-right`}>
                            {r.status === "Pending" && (
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => decide(r, "Approve")}
                                >
                                  <Check className="size-3.5" aria-hidden="true" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => {
                                    setReason("");
                                    setRejecting(r);
                                  }}
                                >
                                  <X className="size-3.5" aria-hidden="true" /> Reject
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-12 text-center text-small text-ink-500"
                          >
                            Nothing here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </TabPanel>
          ))}
        </div>
        <div className="flex flex-col gap-6 xl:col-span-4 [&>*:last-child]:flex-1">
          <FCard icon={PieChart} title="By type" sub="All requests received">
            <BarList data={byKind} label="Requests by type" />
          </FCard>
          <FCard icon={IdCard} title="How it works" sub="Rules, not AI">
            <ul className="flex flex-col gap-2 text-small text-ink-700">
              <li>Patients change their preferred name, pronouns and preferences directly.</li>
              <li>New email or mobile numbers apply only after a verification code.</li>
              <li>Legal name and date of birth wait for this review, then update the record.</li>
              <li>
                Health-information requests go to the treating clinician; a refused request stays on
                the record.
              </li>
            </ul>
          </FCard>
        </div>
      </div>
      {rejecting && (
        <Sheet
          title="Reject this request"
          description={`${rejecting.participant} · ${rejecting.field}`}
          onClose={() => setRejecting(null)}
          footer={
            <Button
              variant="primary"
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (await decide(rejecting, "Reject", reason)) setRejecting(null);
              }}
            >
              Reject with reason
            </Button>
          }
        >
          <Field label="Reason the patient will see">
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Sheet>
      )}
    </>
  );
}
