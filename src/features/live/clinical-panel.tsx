"use client";

import { ClipboardList, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { api, useResource } from "@/lib/live/client";
import type { ClinicalSummaryDto } from "@/lib/live/clinical";
import { shortDate } from "@/lib/live/time";
import type { NeedDto } from "@/lib/live/types";
import { needLabel, needTone, Panel } from "./bits";
import { planTone } from "./plan-editor";

/**
 * Each service's clinical work: assessment, recommendation, treatment plan and review.
 * The treating therapist acts here; admins see statuses only (least privilege).
 */
export function ClinicalPanel({
  clientId,
  needs,
  mode,
  myName,
}: {
  clientId: string;
  needs: NeedDto[];
  mode: "therapist" | "admin";
  myName?: string;
}) {
  const router = useRouter();
  const { data, reload } = useResource<{ services: ClinicalSummaryDto[] }>(
    `/api/care/clients/${clientId}/clinical`,
    (e) => e.type === "care" && (!e.payload.clientId || e.payload.clientId === clientId),
  );
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const shown =
    mode === "therapist"
      ? needs.filter(
          (n) =>
            n.therapistName === myName && (n.status === "assigned" || n.status === "completed"),
        )
      : needs;
  if (!shown.length) return null;

  async function start(url: string, body: Record<string, unknown>, to: (id: string) => string) {
    setBusy(true);
    setFail(null);
    try {
      const { id } = await api<{ id: string }>(url, { body });
      router.push(to(id));
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
      reload();
    }
  }

  return (
    <Panel title={mode === "therapist" ? "Clinical work" : "Clinical progress"}>
      <ul className="flex flex-col gap-4">
        {shown.map((n) => {
          const s = data?.services.find((x) => x.needId === n.id);
          const latest = s?.assessments[0];
          const signed = s?.assessments.find(
            (a) => a.status === "Signed" || a.status === "Amended",
          );
          const plan = s?.plan;
          return (
            <li key={n.id} className="rounded-card border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-small font-semibold">{n.support}</p>
                <Tag tone={needTone[n.status]}>{needLabel[n.status]}</Tag>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-control bg-canvas p-3">
                  <p className="flex items-center gap-2 text-caption font-semibold text-ink-500">
                    <ClipboardList className="size-3.5" aria-hidden="true" /> Assessment
                  </p>
                  <p className="mt-1 text-small">
                    {latest ? (
                      <>
                        {latest.kind}: <strong>{latest.status}</strong>
                        {latest.recommendation && ` · ${latest.recommendation}`}
                      </>
                    ) : (
                      "Not started"
                    )}
                  </p>
                  {mode === "therapist" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {latest && (
                        <ButtonLink
                          size="sm"
                          variant={
                            latest.status === "Draft" || latest.status === "In Progress"
                              ? "primary"
                              : "secondary"
                          }
                          href={`/therapist/assessments/${latest.id}`}
                        >
                          {latest.status === "Draft" || latest.status === "In Progress"
                            ? "Resume"
                            : "Open"}
                        </ButtonLink>
                      )}
                      {!latest && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            start(
                              "/api/clinical/assessments",
                              { clientId, needId: n.id, kind: "Initial" },
                              (id) => `/therapist/assessments/${id}`,
                            )
                          }
                        >
                          Start assessment
                        </Button>
                      )}
                      {signed && plan?.status === "Active" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            start(
                              "/api/clinical/assessments",
                              { clientId, needId: n.id, kind: "Reassessment" },
                              (id) => `/therapist/assessments/${id}`,
                            )
                          }
                        >
                          Reassess
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-control bg-canvas p-3">
                  <p className="flex items-center gap-2 text-caption font-semibold text-ink-500">
                    <Target className="size-3.5" aria-hidden="true" /> Treatment plan
                  </p>
                  <p className="mt-1 text-small">
                    {plan ? (
                      <>
                        <Tag tone={planTone[plan.status]}>{plan.status}</Tag> {plan.achieved}/
                        {plan.goals} goals achieved
                        {plan.reviewDate && (
                          <span className="block text-caption text-ink-500">
                            Review {shortDate(`${plan.reviewDate}T00:00:00Z`)}
                          </span>
                        )}
                      </>
                    ) : signed?.recommendation === "Report only" ? (
                      "Assessment only: no plan needed"
                    ) : (
                      "None yet"
                    )}
                  </p>
                  {mode === "therapist" && (
                    <div className="mt-2">
                      {plan ? (
                        <ButtonLink
                          size="sm"
                          href={`/therapist/plans/${plan.id}`}
                          variant={
                            plan.status === "Draft" || plan.status === "Revised"
                              ? "primary"
                              : "secondary"
                          }
                        >
                          {plan.status === "Draft" || plan.status === "Revised"
                            ? "Finish plan"
                            : "Open plan"}
                        </ButtonLink>
                      ) : (
                        signed &&
                        signed.recommendation !== "Report only" && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              start(
                                "/api/clinical/plans",
                                { clientId, needId: n.id },
                                (id) => `/therapist/plans/${id}`,
                              )
                            }
                          >
                            Create plan
                          </Button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {fail && (
        <p role="alert" className="mt-3 text-small text-over">
          {fail}
        </p>
      )}
    </Panel>
  );
}
