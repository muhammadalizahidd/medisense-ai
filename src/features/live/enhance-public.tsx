"use client";

import { useAiEnabled } from "@/components/ai/ai-switch";
import { AiSettings } from "./ai-settings";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { changeOptions, type ChatMessage, type OversightDto } from "@/lib/live/enhance";
import { shortDate, timeOfDay } from "@/lib/live/time";
import { Card, ChatThread, Field, Pick } from "./enhance-ui";

/* Public and admin pieces of AI Enhancements 02 and 07, and the admin's oversight view. */

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

/* ------------------------------------------------------------------ 02 check-in by link */

type LinkView = {
  verified: boolean;
  submitted: boolean;
  firstName?: string;
  therapist?: string;
  visitAt?: string;
  service?: string;
  extraQuestions?: string[];
};

export function CheckinByLink({ token }: { token: string }) {
  const [dob, setDob] = useState("");
  const [view, setView] = useState<LinkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<"Self" | "Parent or guardian" | "Carer">("Self");
  const [change, setChange] = useState<(typeof changeOptions)[number] | "">("");
  const [changeDetail, setChangeDetail] = useState("");
  const [questions, setQuestions] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done)
    return (
      <Card className="max-w-140">
        <p className="text-section font-semibold text-ink-900">Thank you</p>
        <p className="mt-1 text-small text-ink-700">
          Your answers went to your care team. You can close this page.
        </p>
      </Card>
    );
  if (!view?.verified)
    return (
      <Card className="max-w-140">
        <p className="mb-3 text-small text-ink-700">
          To keep this private, enter the participant&apos;s date of birth. Nothing about the visit
          shows until it matches.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-ink-700">
            Participant&apos;s date of birth
          </span>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="rounded-control border border-border-strong bg-surface px-3 py-2 text-small"
          />
        </label>
        {view && !view.verified && (
          <p className="mt-2 text-small text-over">Those details don&apos;t match our records.</p>
        )}
        {error && <p className="mt-2 text-small text-over">{error}</p>}
        <Button
          variant="primary"
          className="mt-3"
          disabled={!dob}
          onClick={async () => {
            setError(null);
            const r = await fetch(`/api/enhance/checkin/${encodeURIComponent(token)}?dob=${dob}`);
            const json = (await r.json()) as LinkView & { error?: string };
            if (!r.ok) setError(json.error ?? "This link can't be used.");
            else setView(json);
          }}
        >
          Continue
        </Button>
      </Card>
    );
  if (view.submitted)
    return (
      <Card className="max-w-140">
        <p className="text-small text-ink-700">This check-in was already sent. Thank you.</p>
      </Card>
    );
  return (
    <Card className="max-w-140">
      <p className="mb-3 text-small text-ink-700">
        {view.firstName}&apos;s {view.service} visit with {view.therapist}
        {view.visitAt ? `, ${shortDate(view.visitAt)}, ${timeOfDay(view.visitAt)}` : ""}.
      </p>
      <div className="flex flex-col gap-3">
        <Field label="Your name" value={name} onChange={setName} />
        <Pick
          label="You are"
          value={relationship}
          onChange={setRelationship}
          options={["Self", "Parent or guardian", "Carer"] as const}
        />
        <Pick
          label="Since the last visit, are things…"
          value={change}
          onChange={setChange}
          options={changeOptions}
        />
        {change === "Worse" && (
          <Field label="What's worse?" value={changeDetail} onChange={setChangeDetail} area />
        )}
        <Field label="Questions for the therapist" value={questions} onChange={setQuestions} area />
        {(view.extraQuestions ?? []).map((q) => (
          <Field
            key={q}
            label={q}
            value={extra[q] ?? ""}
            onChange={(v) => setExtra((x) => ({ ...x, [q]: v }))}
          />
        ))}
        {error && <p className="text-small text-over">{error}</p>}
        <Button
          variant="primary"
          loading={busy}
          disabled={name.trim().length < 2 || !change}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await post(`/api/enhance/checkin/${encodeURIComponent(token)}`, {
                dob,
                respondent: { name, relationship },
                answers: { change, changeDetail, questions, extra, accurate: true },
              });
              setDone(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't send.");
            }
            setBusy(false);
          }}
        >
          Send to my care team
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ 07 visitor assistant */

export function VisitorAssistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  return (
    <section
      data-ai-only
      aria-label="Questions about referring"
      className="mb-6 max-w-180 rounded-card border border-border bg-surface p-4"
    >
      <button type="button" onClick={() => setOpen((x) => !x)} className="cursor-pointer text-left">
        <span className="block text-section font-semibold text-ink-900">
          Questions before you refer? Ask Medisense
        </span>
        <span className="block text-caption text-ink-500">
          General help only. It can&apos;t see anyone&apos;s records and doesn&apos;t give medical
          advice.
        </span>
      </button>
      {open && (
        <div className="mt-3">
          <ChatThread
            messages={msgs}
            starters={["What documents do I need?", "Do you take NDIS?", "What are your hours?"]}
            placeholder="Ask a general question"
            onSend={async (text) => {
              setMsgs((m) => [...m, { role: "user", text, at: new Date().toISOString() }]);
              try {
                const r = await post<{
                  reply: { text: string; outcome: string; sources: string[] };
                }>("/api/enhance/public", { text });
                setMsgs((m) => [
                  ...m,
                  {
                    role: "assistant",
                    text: r.reply.text,
                    outcome: r.reply.outcome as ChatMessage["outcome"],
                    sources: r.reply.sources,
                    at: new Date().toISOString(),
                  },
                ]);
              } catch {
                setMsgs((m) => [
                  ...m,
                  {
                    role: "assistant",
                    text: "The assistant isn't available right now.",
                    outcome: "No authorised source",
                    at: new Date().toISOString(),
                  },
                ]);
              }
            }}
          />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ admin oversight */

function Counts({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  return (
    <Card>
      <p className="label-caps text-ink-500">{title}</p>
      {entries.length === 0 ? (
        <p className="mt-2 text-small text-ink-500">None yet</p>
      ) : (
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-small">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-700">{k}</dt>
              <dd className="text-right font-semibold text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

export function AiOversight() {
  const ai = useAiEnabled();
  const r = useResource<OversightDto>("/api/enhance", (e) => e.type === "care");
  const d = r.data;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="label-caps text-ink-500">Live care</p>
        <h1 className="type-display text-h1 text-ink-900">AI oversight</h1>
        <p className="mt-1 max-w-180 text-small text-ink-700">
          {ai
            ? "How the AI assistants are being used, in counts only. Admins don't see private chats, answers or clinical text; clinicians review those."
            : "Turn the organisation's assistant features back on here."}
        </p>
      </header>
      <AiSettings />
      {!ai ? null : !d ? (
        <div className="h-60 animate-pulse rounded-card bg-sunken" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ["AI turned off by patients", d.aiWithdrawn],
              ["Caregivers with access", d.caregiversActive],
              ["Safety escalations", d.escalations.length],
              ["AI answers flagged", (d.feedback.Inaccurate ?? 0) + (d.feedback.Unsafe ?? 0)],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="label-caps text-ink-500">{label}</p>
                <p className="type-display text-h1 text-ink-900">{value}</p>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Counts title="Pre-visit check-ins" data={d.checkins} />
            <Counts title="Home coach guidance" data={d.coach} />
            <Counts title="Concerns by status" data={d.concerns} />
            <Counts title="Concerns by category (rule)" data={d.categories} />
            <Counts title="Effectiveness insights" data={d.insights} />
            <Counts title="Answer feedback" data={d.feedback} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <p className="label-caps text-ink-500">Follow-up work queue · minimal details</p>
              {d.followUps.length === 0 ? (
                <p className="mt-2 text-small text-ink-500">Nothing open</p>
              ) : (
                <ul className="mt-2 divide-y divide-border text-small">
                  {d.followUps.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-ink-900">{f.category}</span>
                      <span className="text-ink-500">{f.owner}</span>
                      <span className="text-ink-500">
                        {f.due ? shortDate(f.due) : "No due date"}
                      </span>
                      <Tag tone={f.priority === "High" ? "over" : "neutral"}>{f.priority}</Tag>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <p className="label-caps text-ink-500">Insights waiting for clinician review</p>
              {d.insightsWaiting.length === 0 ? (
                <p className="mt-2 text-small text-ink-500">None waiting</p>
              ) : (
                <ul className="mt-2 divide-y divide-border text-small">
                  {d.insightsWaiting.map((w, i) => (
                    <li key={i} className="flex items-center justify-between py-2">
                      <span className="text-ink-700">{w.status}</span>
                      <Tag tone={w.days > 7 ? "over" : "neutral"}>
                        {w.days} day{w.days === 1 ? "" : "s"}
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card>
            <p className="label-caps text-ink-500">Safety escalations · supervisor queue</p>
            {d.escalations.length === 0 ? (
              <p className="mt-2 text-small text-ink-500">None</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-small">
                {d.escalations.map((e) => (
                  <li key={e.ref} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-mono text-ink-700">{e.ref}</span>
                    <span className="text-ink-500">{shortDate(e.at)}</span>
                    <span className="text-ink-700">{e.reviewer}</span>
                    <Tag
                      tone={
                        ["Resolved", "Closed - No Action"].includes(e.status) ? "healthy" : "watch"
                      }
                    >
                      {e.status}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
