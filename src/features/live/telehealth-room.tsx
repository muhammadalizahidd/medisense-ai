"use client";

import {
  ArrowLeft,
  Check,
  Circle,
  Copy,
  Mic,
  MicOff,
  MonitorUp,
  Pause,
  PhoneOff,
  Play,
  ShieldAlert,
  Square,
  UserPlus,
  Video,
  VideoOff,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Tag } from "@/components/ui/tag";
import { api, useNow, useResource } from "@/lib/live/client";
import type { TelehealthDto } from "@/lib/live/telehealth";
import { relativeTime, slotLabel, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { NoteSheet } from "./care-sheets";
import { TextArea, TextField, Tick } from "./form-bits";

/** The clinician's own camera, when the browser allows it. The far end is simulated. */
export function SelfView({ on, label }: { on: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (ref.current) ref.current.srcObject = s;
      })
      .catch(() => setFailed(true));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [on]);
  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-card bg-ink-900">
      {on && !failed ? (
        <video
          ref={ref}
          autoPlay
          muted
          playsInline
          className="size-full -scale-x-100 object-cover"
        />
      ) : (
        <Avatar name={label} size={56} />
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-ink-900/70 px-2 py-0.5 text-caption text-surface">
        {label}
      </span>
    </div>
  );
}

export function RecordingBadge({ status }: { status: string }) {
  if (status !== "Recording" && status !== "Paused") return null;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-bold text-white",
        status === "Recording" ? "bg-over-dot" : "bg-watch-dot",
      )}
    >
      <Circle
        className={cn("size-2.5 fill-white", status === "Recording" && "motion-safe:animate-pulse")}
        aria-hidden="true"
      />
      {status === "Recording" ? "Recording" : "Recording paused"}
    </span>
  );
}

const consentLabel = {
  video: "Video consultation",
  recording: "Recording",
  transcription: "AI transcription",
  sharing: "Information sharing",
} as const;

/** Section 12: the clinician hosts. Suitability, link, waiting room, call, recording, wrap-up. */
export function TelehealthRoom({ visitId }: { visitId: string }) {
  const { data, error, reload } = useResource<{ call: TelehealthDto }>(
    `/api/telehealth/${visitId}`,
    (e) => e.type === "care" && (!e.payload.visitId || e.payload.visitId === visitId),
  );
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [suitable, setSuitable] = useState(true);
  const [suitNotes, setSuitNotes] = useState("");
  const [extra, setExtra] = useState({
    name: "",
    role: "Support person" as "Support person" | "Interpreter",
  });
  const [line, setLine] = useState("");
  const [safety, setSafety] = useState("");
  const [noting, setNoting] = useState<AppointmentDto | null>(null);

  const now = useNow();
  // A guest in the waiting room has no live connection of their own: check every few seconds too.
  useEffect(() => {
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [reload]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      const r = await api<{ link?: string; minutes?: number }>(`/api/telehealth/${visitId}`, {
        body,
      });
      if (r.link) setLink(`${window.location.origin}${r.link}`);
      reload();
      return r;
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openNote() {
    const { client } = await api<{ client: { appointments: AppointmentDto[] } }>(
      `/api/care/patients/${data?.call.clientId ?? ""}`,
    ).catch(() => ({ client: { appointments: [] } }));
    const v = client.appointments.find((x) => x.id === visitId);
    if (v) setNoting(v);
  }

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-150" />;
  const c = data.call;
  const closed =
    now !== null && c.state !== "In call" && now > new Date(c.end).getTime() + 60 * 60_000;
  const inCall = c.state === "In call";
  const rec = c.recording.status;

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/therapist" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            My new patients
          </ButtonLink>
        }
        title={`Video visit · ${c.patient}`}
        description={`${slotLabel(c.start)} · hosted by ${c.therapist}`}
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge />
            <RecordingBadge status={rec} />
            <Tag tone={inCall ? "live" : c.state === "Waiting" ? "monitor" : "neutral"}>
              {c.state}
            </Tag>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-8">
          <section aria-label="Call" className="rounded-card bg-ink-900 p-3">
            <p className="mb-2 text-center text-label font-semibold tracking-wide text-surface/70 uppercase">
              DEMO ONLY · simulated video
            </p>
            <div className={cn("grid gap-3", c.screenShare ? "md:grid-cols-3" : "md:grid-cols-2")}>
              {c.screenShare && (
                <div className="flex aspect-video items-center justify-center rounded-card bg-surface/10 text-small text-surface md:col-span-2">
                  <MonitorUp className="mr-2 size-5" aria-hidden="true" /> Your screen is shared
                </div>
              )}
              <div className="relative flex aspect-video items-center justify-center rounded-card bg-surface/10">
                {inCall ? (
                  <Avatar name={c.guest?.name ?? c.patient} size={72} />
                ) : (
                  <p className="px-6 text-center text-small text-surface/80">
                    {c.state === "Waiting"
                      ? `${c.guest?.name} is in the waiting room`
                      : c.state === "Ended"
                        ? "Call ended"
                        : "Waiting for the participant to join"}
                  </p>
                )}
                {inCall && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-ink-900/70 px-2 py-0.5 text-caption text-surface">
                    {c.guest?.name} {c.device && !c.device.camera && "· camera off"}{" "}
                    {c.device?.network === "poor" && "· weak connection"}
                  </span>
                )}
              </div>
              <SelfView on={cam} label={`${c.therapist} (you)`} />
            </div>
            {c.participants.length > 1 && (
              <p className="mt-2 text-caption text-surface/80">
                Also in the call:{" "}
                {c.participants
                  .slice(1)
                  .map((p) => `${p.name} (${p.role})`)
                  .join(", ")}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <CallButton
                label={mic ? "Mute" : "Unmute"}
                on={mic}
                onClick={() => setMic(!mic)}
                icon={mic ? Mic : MicOff}
              />
              <CallButton
                label={cam ? "Stop video" : "Start video"}
                on={cam}
                onClick={() => setCam(!cam)}
                icon={cam ? Video : VideoOff}
              />
              <CallButton
                label={c.screenShare ? "Stop sharing" : "Share screen"}
                on={!c.screenShare}
                disabled={!inCall || busy}
                onClick={() => act({ action: "screen-share", on: !c.screenShare })}
                icon={MonitorUp}
              />
              {rec === "Recording" ? (
                <>
                  <CallButton
                    label="Pause recording"
                    on
                    onClick={() => act({ action: "record", command: "pause" })}
                    icon={Pause}
                    disabled={busy}
                  />
                  <CallButton
                    label="Stop recording"
                    on
                    onClick={() => act({ action: "record", command: "stop" })}
                    icon={Square}
                    disabled={busy}
                  />
                </>
              ) : rec === "Paused" ? (
                <>
                  <CallButton
                    label="Resume recording"
                    on
                    onClick={() => act({ action: "record", command: "resume" })}
                    icon={Play}
                    disabled={busy}
                  />
                  <CallButton
                    label="Stop recording"
                    on
                    onClick={() => act({ action: "record", command: "stop" })}
                    icon={Square}
                    disabled={busy}
                  />
                </>
              ) : (
                <CallButton
                  label="Record"
                  on
                  disabled={!inCall || busy}
                  onClick={() => act({ action: "record", command: "start" })}
                  icon={Circle}
                />
              )}
              <button
                type="button"
                disabled={!inCall || busy}
                onClick={async () => {
                  const r = await act({ action: "end" });
                  if (r) await openNote();
                }}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-over-dot px-5 text-small font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PhoneOff className="size-4" aria-hidden="true" />
                End call
              </button>
            </div>
          </section>
          {fail && (
            <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
              {fail}
            </p>
          )}
          {c.state === "Ended" && (
            <Panel title="Wrap-up">
              <p className="mb-3 text-small text-ink-700">
                The visit is recorded with its actual duration. Write and sign the note to verify it
                for billing.
              </p>
              <Button variant="primary" onClick={openNote}>
                Write session note
              </Button>
            </Panel>
          )}
          {c.consents.transcription?.given && (inCall || c.transcript.length > 0) && (
            <Panel title="AI transcription (consented)" action={<Tag tone="live">Draft</Tag>}>
              <p className="-mt-2 mb-3 text-caption text-ink-500">
                Simulated: type what was said, or add a sample line. The transcript only feeds a
                draft note you review and sign.
              </p>
              <ol className="mb-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto text-small">
                {c.transcript.map((t) => (
                  <li key={t.at}>
                    <strong>{t.speaker}:</strong> {t.text}{" "}
                    <span className="text-caption text-ink-500">{timeOfDay(t.at)}</span>
                  </li>
                ))}
              </ol>
              {inCall && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-60 flex-1">
                    <TextField label="Line" value={line} onChange={setLine} />
                  </div>
                  <Button
                    size="sm"
                    disabled={!line.trim()}
                    onClick={async () => {
                      await act({ action: "transcript", text: line, speaker: "Participant" });
                      setLine("");
                    }}
                  >
                    Participant said
                  </Button>
                  <Button
                    size="sm"
                    disabled={!line.trim()}
                    onClick={async () => {
                      await act({ action: "transcript", text: line, speaker: "Clinician" });
                      setLine("");
                    }}
                  >
                    I said
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      act({
                        action: "transcript",
                        speaker: "Participant",
                        text: sampleLines[c.transcript.length % sampleLines.length]!,
                      })
                    }
                  >
                    Add sample line
                  </Button>
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <Panel title="1. Clinical suitability">
            {c.suitability ? (
              <p className="flex items-center gap-2 text-small">
                <Check className="size-4 text-healthy" aria-hidden="true" />
                {c.suitability.ok
                  ? "Suitable for telehealth"
                  : `Not suitable: ${c.suitability.notes}`}{" "}
                · {c.suitability.byName}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Tick checked={suitable} onChange={setSuitable}>
                  This session can be safely delivered by telehealth
                </Tick>
                <TextArea label="Notes" value={suitNotes} onChange={setSuitNotes} rows={2} />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => act({ action: "suitability", ok: suitable, notes: suitNotes })}
                >
                  Record
                </Button>
              </div>
            )}
          </Panel>
          <Panel title="2. Join link">
            <p className="mb-2 text-caption text-ink-500">
              One-time and appointment-specific: no account needed. Creating a new link stops the
              old one.
            </p>
            {link && (
              <div className="mb-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-control bg-canvas px-2 py-1.5 text-caption">
                  {link}
                </code>
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link);
                    setCopied(true);
                  }}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
            {closed ? (
              <p className="rounded-control bg-watch-bg px-3 py-2 text-small text-watch">
                This visit was {slotLabel(c.start)}. Its video window closed an hour after it ended,
                so links no longer work. Move the visit to a new time to run the call.
              </p>
            ) : (
              <Button
                size="sm"
                disabled={busy || !c.suitability?.ok}
                onClick={() => act({ action: "send-link" })}
              >
                {c.linkSent ? "Create a new link" : "Create and send link"}
              </Button>
            )}
          </Panel>
          <Panel title="3. Waiting room">
            {c.guest ? (
              <div className="text-small">
                <p className="font-semibold">
                  {c.guest.name}{" "}
                  <span className="font-normal text-ink-500">
                    ({c.guest.relationship}
                    {c.guest.verified ? ", identity verified" : ""})
                  </span>
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {(Object.keys(consentLabel) as (keyof typeof consentLabel)[]).map((k) => (
                    <li key={k} className="flex items-center justify-between gap-2">
                      {consentLabel[k]}
                      <Tag
                        tone={
                          c.consents[k] ? (c.consents[k]!.given ? "healthy" : "over") : "neutral"
                        }
                      >
                        {c.consents[k] ? (c.consents[k]!.given ? "Yes" : "No") : "Not asked"}
                      </Tag>
                    </li>
                  ))}
                </ul>
                {c.device && (
                  <p className="mt-2 text-caption text-ink-500">
                    Device: camera {c.device.camera ? "ok" : "off"}, microphone{" "}
                    {c.device.microphone ? "ok" : "off"}, network {c.device.network}
                  </p>
                )}
                {c.state === "Waiting" && (
                  <Button
                    variant="primary"
                    className="mt-3 w-full"
                    disabled={busy}
                    onClick={() => act({ action: "admit" })}
                  >
                    Admit {c.guest.name.split(" ")[0]}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-small text-ink-500">
                Nobody yet. The participant verifies, consents and tests their device before waiting
                here.
              </p>
            )}
          </Panel>
          <Panel title="Recording">
            <p className="mb-2 flex items-center justify-between text-small">
              Status{" "}
              <Tag
                tone={rec === "Recording" ? "over" : rec === "Available" ? "healthy" : "neutral"}
              >
                {rec}
              </Tag>
            </p>
            <Tick
              checked={c.recordingAllowed}
              onChange={(on) => act({ action: "allow-recording", on })}
            >
              I permit recording for this visit
            </Tick>
            <p className="mt-2 text-caption text-ink-500">
              Off by default. Blocked without the participant&apos;s recording consent. Everyone
              sees when it&apos;s on. Reviews are logged in Recordings.
            </p>
          </Panel>
          {inCall && (
            <Panel title="Participants">
              <div className="flex flex-col gap-2">
                <TextField
                  label="Name"
                  value={extra.name}
                  onChange={(v) => setExtra((x) => ({ ...x, name: v }))}
                />
                <div className="flex gap-2">
                  {(["Support person", "Interpreter"] as const).map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      variant={extra.role === r ? "primary" : "secondary"}
                      onClick={() => setExtra((x) => ({ ...x, role: r }))}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={busy || extra.name.trim().length < 2}
                  onClick={async () => {
                    await act({ action: "add-participant", ...extra });
                    setExtra({ name: "", role: "Support person" });
                  }}
                >
                  <UserPlus className="size-3.5" aria-hidden="true" /> Add to call
                </Button>
              </div>
            </Panel>
          )}
          <Panel title="Connection or safety problem">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => act({ action: "connection", kind: "retry" })}
              >
                <WifiOff className="size-3.5" aria-hidden="true" /> Reconnect
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => act({ action: "connection", kind: "phone" })}
              >
                Switch to phone
              </Button>
              <Button
                size="sm"
                disabled={busy || c.state === "Ended"}
                onClick={() => act({ action: "connection", kind: "rebook" })}
              >
                Can&apos;t connect: rebook
              </Button>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <TextField label="Safety concern" value={safety} onChange={setSafety} />
              <Button
                size="sm"
                disabled={busy || safety.trim().length < 3}
                onClick={async () => {
                  await act({ action: "safety", text: safety });
                  setSafety("");
                }}
              >
                <ShieldAlert className="size-3.5" aria-hidden="true" /> Escalate to Clinical Lead
              </Button>
            </div>
          </Panel>
          {c.events.length > 0 && (
            <Panel title="Call log">
              <ol className="flex flex-col gap-1.5 text-caption">
                {[...c.events].reverse().map((e) => (
                  <li key={e.at + e.text}>
                    <span className="text-ink-500">{relativeTime(e.at)}</span> · {e.text}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
      {noting && <NoteSheet visit={noting} onClose={() => setNoting(null)} onSaved={reload} />}
    </>
  );
}

const sampleLines = [
  "Mornings have been easier this week.",
  "He managed three buttons by himself yesterday.",
  "The visual chart on the wardrobe is helping.",
  "We practised every day after breakfast.",
];

function CallButton({
  label,
  on,
  onClick,
  icon: Icon,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  icon: typeof Mic;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-11 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40",
        on ? "bg-surface/15 text-surface hover:bg-surface/25" : "bg-surface text-ink-900",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
