"use client";

import { CheckCircle2, Receipt, Route } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import { TextArea, TextField } from "./form-bits";
import { dayLabel, finance } from "./finance-bits";

type Line = {
  id: string;
  ref: string;
  participant: string;
  support: string;
  source: string;
  start: string;
  deliveredMinutes: number;
  billableMinutes: number;
  location: string;
  confirmed: boolean;
  travel: { km: number; evidence: string } | null;
  needsTravel: boolean;
  status: string;
  issue: string | null;
};

/**
 * Section 2: a therapist confirms the delivered time and travel for their own services. They never
 * see rates, payers or claims, and their clinical record is unaffected (AC-02).
 */
export function TherapistBilling() {
  const { data, reload } = useResource<{ lines: Line[] }>(
    "/api/me/billing",
    (e) => e.type === "care",
  );
  const [open, setOpen] = useState<Line | null>(null);
  const lines = data?.lines ?? [];
  const todo = lines.filter((l) => !l.confirmed || l.needsTravel);
  if (!data || !lines.length) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="flex size-8 items-center justify-center rounded-control bg-accent-tint text-accent">
          <Receipt className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h2 className="text-section font-semibold text-ink-900">Billing confirmations</h2>
          <p className="text-caption text-ink-500">
            Confirm what you delivered and any travel. Finance does the rest.
          </p>
        </div>
        <Tag tone={todo.length ? "watch" : "healthy"}>
          {todo.length ? `${todo.length} to confirm` : "All confirmed"}
        </Tag>
      </header>
      <ul className="divide-y divide-border">
        {lines.slice(0, 8).map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-small">
            {l.source === "Travel" ? (
              <Route className="size-4 text-ink-500" aria-hidden="true" />
            ) : (
              <CheckCircle2
                className={cn("size-4", l.confirmed ? "text-healthy" : "text-ink-400")}
                aria-hidden="true"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-ink-900">
                {l.participant} · {l.support}
              </span>
              <span className="block text-caption text-ink-500">
                {l.source} · {dayLabel(l.start)} ·{" "}
                {l.source === "Travel"
                  ? l.travel
                    ? `${l.travel.km} km confirmed`
                    : "distance to confirm"
                  : `${l.billableMinutes} min`}{" "}
                · {l.location}
              </span>
            </span>
            {!l.confirmed || l.needsTravel ? (
              <Button size="sm" variant="soft" onClick={() => setOpen(l)}>
                {l.source === "Travel" ? "Confirm travel" : "Confirm delivery"}
              </Button>
            ) : (
              <span className="text-caption text-healthy">Confirmed</span>
            )}
          </li>
        ))}
      </ul>
      {open && <ConfirmSheet line={open} onClose={() => setOpen(null)} onDone={reload} />}
    </section>
  );
}

function ConfirmSheet({
  line,
  onClose,
  onDone,
}: {
  line: Line;
  onClose: () => void;
  onDone: () => void;
}) {
  const travel = line.source === "Travel";
  const [minutes, setMinutes] = useState(String(line.billableMinutes || line.deliveredMinutes));
  const [km, setKm] = useState("");
  const [evidence, setEvidence] = useState("");
  return (
    <Sheet
      title={travel ? "Confirm travel" : "Confirm delivered service"}
      description={`${line.participant} · ${line.support} · ${dayLabel(line.start)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              travel
                ? !(Number(km) >= 0) || km === "" || evidence.trim().length < 5
                : !(Number(minutes) > 0)
            }
            onClick={async () => {
              const body = travel
                ? {
                    type: "travel",
                    travel: {
                      category: "Travel non-labour",
                      minutes: 0,
                      km: Number(km),
                      costs: 0,
                      basis: "Actual",
                      evidence,
                    },
                  }
                : { type: "confirm", minutes: Number(minutes), note: "" };
              if (
                await finance(
                  `/api/care/billing/lines/${line.id}`,
                  body,
                  "Confirmed",
                  "Thank you. Finance will review it.",
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {travel ? (
          <>
            <TextField label="Kilometres travelled" value={km} onChange={setKm} required />
            <TextArea
              label="Evidence"
              value={evidence}
              onChange={setEvidence}
              rows={2}
              placeholder="For example: odometer 48211 to 48229"
              required
            />
          </>
        ) : (
          <TextField
            label="Minutes delivered"
            value={minutes}
            onChange={setMinutes}
            hint="As recorded at check-out. Change it only if that was wrong."
          />
        )}
        <p className="text-caption text-ink-500">
          Rates, payers and claims are handled by Finance and aren&apos;t shown here.
        </p>
      </div>
    </Sheet>
  );
}
