"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/premium";
import { cn } from "@/lib/cn";
import { useResource } from "@/lib/live/client";
import type { TherapistHomeDto } from "@/lib/live/types";
import type { TherapistEnhanceDto } from "@/lib/live/enhance";
import { shortDate, timeOfDay } from "@/lib/live/time";
import { PatientAiTab, TherapistAiInbox, VisitCheckin } from "./enhance-therapist";

/** The therapist portal's view of the same AI assistants as the therapist app. */
export function AiWorkspace() {
  const home = useResource<TherapistHomeDto>("/api/care/therapist", (e) => e.type === "care");
  const clients = (home.data?.clients ?? []).filter((c) => !c.discharged);
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? clients[0]?.id ?? null;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="label-caps text-ink-500">Live care</p>
        <h1 className="type-display text-h1 text-ink-900">AI assistants</h1>
        <p className="mt-1 max-w-180 text-small text-ink-700">
          Home coach, pre-visit check-ins, concerns, effectiveness insights, care-team coordination
          and your clinical copilot. AI drafts and suggests; you review, approve and sign.
        </p>
      </header>
      <div className="relative max-w-180">
        <TherapistAiInbox />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Patients" className="flex flex-col gap-1.5">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setPicked(c.id)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-card border p-2.5 text-left",
                current === c.id
                  ? "border-accent-fill bg-accent-tint"
                  : "border-border bg-surface hover:bg-sunken",
              )}
            >
              <Avatar name={c.name} size={34} kind="patient" />
              <span className="min-w-0">
                <span className="block truncate text-small font-semibold text-ink-900">
                  {c.name}
                </span>
                <span className="block truncate text-caption text-ink-500">{c.discipline}</span>
              </span>
            </button>
          ))}
        </nav>
        <section aria-label="Assistants" className="relative flex min-w-0 flex-col gap-4">
          {current && <WebCheckins key={`c-${current}`} clientId={current} />}
          {current && <PatientAiTab key={current} clientId={current} />}
        </section>
      </div>
    </div>
  );
}

/** Pre-visit check-ins for the patient's upcoming visits, the same controls as the app's visit sheet. */
function WebCheckins({ clientId }: { clientId: string }) {
  const r = useResource<TherapistEnhanceDto>(
    `/api/enhance?clientId=${clientId}`,
    (e) => e.type === "care",
  );
  const visits = r.data?.upcoming ?? [];
  if (!visits.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="label-caps text-ink-500">Pre-visit check-ins</p>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {visits.slice(0, 2).map((v) => (
          <div key={v.id} className="relative">
            <p className="mb-1 text-caption text-ink-700">
              {v.service} · {shortDate(v.start)}, {timeOfDay(v.start)}
            </p>
            <VisitCheckin clientId={clientId} appointmentId={v.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
