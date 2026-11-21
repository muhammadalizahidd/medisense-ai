"use client";

import { FileSignature } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { Panel } from "./bits";
import { dayLabel } from "./funding-bits";

type Constraints = {
  planEnd: string | null;
  lines: {
    support: string;
    agreement: string | null;
    status: string;
    end: string | null;
    unit: string | null;
    quantity: number | null;
    frequency: string | null;
    setting: string | null;
    scope: string | null;
    travel: boolean;
    nonFaceToFace: boolean;
  }[];
};

/** AT-29: the agreed service limits for the treating clinician. No payer, budget or prices. */
export function ServiceLimits({ clientId }: { clientId: string }) {
  const { data, error } = useResource<{ constraints: Constraints }>(
    `/api/care/therapist/funding/${clientId}`,
    (e) => e.type === "care",
  );
  if (error || !data) return null;
  const c = data.constraints;
  return (
    <Panel title="Agreed service limits">
      <p className="mb-3 text-caption text-ink-500">
        From the service agreement. Payer, budget and price details stay with Finance. Clinical
        decisions stay yours.
      </p>
      <ul className="flex flex-col gap-3">
        {c.lines.map((l) => (
          <li key={l.support} className="rounded-control border border-border p-3">
            <p className="flex flex-wrap items-center gap-2">
              <FileSignature className="size-4 text-accent" aria-hidden="true" />
              <span className="text-small font-semibold text-ink-900">{l.support}</span>
              <Tag
                tone={
                  l.status === "Signed"
                    ? "healthy"
                    : l.status === "No agreement yet"
                      ? "neutral"
                      : "watch"
                }
              >
                {l.status}
              </Tag>
            </p>
            {l.quantity !== null ? (
              <p className="mt-1 text-small text-ink-700">
                {l.quantity} {l.unit?.toLowerCase()}
                {l.quantity === 1 ? "" : "s"} · {l.frequency} · {l.setting}
                {l.end && ` · until ${dayLabel(l.end)}`}
              </p>
            ) : (
              <p className="mt-1 text-small text-ink-500">No agreed limits recorded yet.</p>
            )}
            {l.scope && <p className="mt-1 text-caption text-ink-500">{l.scope}</p>}
            <p className="mt-1 text-caption text-ink-500">
              Travel {l.travel ? "agreed as a separate line" : "not agreed"} · Non-face-to-face or
              reports {l.nonFaceToFace ? "agreed" : "not agreed"}
            </p>
          </li>
        ))}
      </ul>
      {c.planEnd && (
        <p className="mt-3 text-caption text-ink-500">
          NDIS plan end date on record: {dayLabel(c.planEnd)}.
        </p>
      )}
    </Panel>
  );
}
