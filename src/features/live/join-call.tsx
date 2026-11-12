"use client";

import {
  Check,
  Hourglass,
  LogOut,
  Mic,
  MicOff,
  Phone,
  RefreshCw,
  ShieldCheck,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { Field } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { useNow, useResource } from "@/lib/live/client";
import type { TelehealthDto } from "@/lib/live/telehealth";
import { slotLabel } from "@/lib/live/time";
import { cn } from "@/lib/cn";
import { Skeleton } from "./bits";
import { TextField, Tick } from "./form-bits";
import { RecordingBadge, SelfView } from "./telehealth-room";

const relationships = [
  "Participant",
  "Parent or guardian",
  "Authorised representative",
  "Support person",
] as const;

/**
 * The participant's side of a video visit (section 12, E2E-10): no account. Verify, give each
 * consent separately, test the device, wait to be admitted, then join.
 */
export function JoinCall({ token }: { token: string }) {
  const url = `/api/join/${encodeURIComponent(token)}`;
  const { data, error, reload } = useResource<{ call: TelehealthDto }>(url);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [left, setLeft] = useState(false);

  const dead = Boolean(error && !data);
  useEffect(() => {
    if (dead) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [reload, dead]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error ?? "That didn't work.");
      reload();
      return true;
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="max-w-140 rounded-card border border-border bg-surface p-8 shadow-lift">
        <p className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
          Video visit
        </p>
        <h2 className="mt-2 type-display text-h2">This link can&apos;t be used</h2>
        <p className="mt-2 text-body text-ink-700">{error}</p>
        <div className="mt-6">
          <Button onClick={reload}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!data) return <Skeleton className="h-96 max-w-180" />;
  const c = data.call;
  if (left) {
    return (
      <Card title="You've left the call">
        <p className="text-small text-ink-700">
          Thank you. Your clinician will be in touch about next steps.
        </p>
      </Card>
    );
  }

  const step = !c.guest?.verified
    ? "verify"
    : !c.consents.video
      ? "consent"
      : !c.device
        ? "device"
        : c.state === "In call"
          ? "call"
          : c.state === "Ended"
            ? "ended"
            : "wait";

  return (
    <div className="max-w-240">
      <ol className="mb-6 flex flex-wrap gap-2 text-caption font-semibold">
        {["verify", "consent", "device", "wait", "call"].map((s, i) => {
          const order = ["verify", "consent", "device", "wait", "call", "ended"];
          const done = order.indexOf(step) > i;
          return (
            <li
              key={s}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1",
                done
                  ? "border-accent-fill bg-accent-tint"
                  : step === s
                    ? "border-ink-900 bg-surface"
                    : "border-border text-ink-500",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
              {
                {
                  verify: "Your details",
                  consent: "Consent",
                  device: "Device check",
                  wait: "Waiting room",
                  call: "Visit",
                }[s]
              }
            </li>
          );
        })}
      </ol>
      {step === "verify" && (
        <Verify busy={busy} act={act} therapist={c.therapist} start={c.start} />
      )}
      {step === "consent" && <Consents busy={busy} act={act} />}
      {step === "device" && <DeviceCheck busy={busy} act={act} />}
      {step === "wait" && <Waiting c={c} busy={busy} act={act} />}
      {step === "call" && (
        <InCall
          c={c}
          busy={busy}
          act={act}
          onLeave={async () => {
            if (await act({ action: "leave" })) setLeft(true);
          }}
        />
      )}
      {step === "ended" && (
        <Card title="The visit has ended">
          <p className="text-small text-ink-700">
            Thanks for joining. Your clinician will share a summary in the app.
          </p>
        </Card>
      )}
      {fail && (
        <p role="alert" className="mt-3 rounded-control bg-over-bg px-3 py-2 text-small text-over">
          {fail}
        </p>
      )}
      <Trouble busy={busy} act={act} />
    </div>
  );
}

type Act = (body: Record<string, unknown>) => Promise<boolean>;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 type-display text-h2">{title}</h2>
      {children}
    </section>
  );
}

function Verify({
  busy,
  act,
  therapist,
  start,
}: {
  busy: boolean;
  act: Act;
  therapist: string;
  start: string;
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<(typeof relationships)[number]>("Participant");
  const [dob, setDob] = useState("");
  const [authority, setAuthority] = useState(false);
  return (
    <Card title="Confirm who's joining">
      <p className="mb-4 text-small text-ink-700">
        Video visit with <strong>{therapist}</strong>, {slotLabel(start)}.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Your name" required value={name} onChange={setName} />
        <Field label="You are the">
          <Select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as (typeof relationships)[number])}
          >
            {relationships.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <TextField
          label="Participant's date of birth"
          type="date"
          required
          value={dob}
          onChange={setDob}
          hint="To confirm we have the right person"
        />
      </div>
      {relationship !== "Participant" && (
        <div className="mt-4">
          <Tick checked={authority} onChange={setAuthority}>
            I am authorised to attend this visit for the participant.
          </Tick>
        </div>
      )}
      <Button
        variant="primary"
        className="mt-5"
        disabled={busy || name.trim().length < 2 || !dob}
        onClick={() => act({ action: "verify", name, relationship, dateOfBirth: dob, authority })}
      >
        Continue
      </Button>
    </Card>
  );
}

function Consents({ busy, act }: { busy: boolean; act: Act }) {
  const [c, setC] = useState({
    video: true,
    recording: false,
    transcription: false,
    sharing: true,
  });
  const set = (k: keyof typeof c) => (v: boolean) => setC((x) => ({ ...x, [k]: v }));
  return (
    <Card title="Your choices">
      <p className="mb-4 text-small text-ink-700">
        Each is a separate choice. Only the video consultation is needed to go ahead; you can say no
        to the rest.
      </p>
      <div className="flex flex-col gap-3">
        <Tick checked={c.video} onChange={set("video")}>
          <strong>Video consultation.</strong> I agree to this visit happening by video.
        </Tick>
        <Tick checked={c.recording} onChange={set("recording")}>
          <strong>Recording.</strong> The clinician may record the visit for my clinical record.
          I&apos;ll always see when it&apos;s on.
        </Tick>
        <Tick checked={c.transcription} onChange={set("transcription")}>
          <strong>AI transcription.</strong> Speech may be transcribed to help draft the
          clinician&apos;s note, which they check and sign.
        </Tick>
        <Tick checked={c.sharing} onChange={set("sharing")}>
          <strong>Information sharing.</strong> Notes from this visit may be shared with my care
          team.
        </Tick>
      </div>
      <Button
        variant="primary"
        className="mt-5"
        disabled={busy}
        onClick={() => act({ action: "consent", ...c })}
      >
        Save my choices
      </Button>
    </Card>
  );
}

function DeviceCheck({ busy, act }: { busy: boolean; act: Act }) {
  const [camera, setCamera] = useState<boolean | null>(null);
  const [microphone, setMicrophone] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCamera(s.getVideoTracks().length > 0);
      setMicrophone(s.getAudioTracks().length > 0);
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setCamera(false);
      setMicrophone(false);
    } finally {
      setTesting(false);
    }
  }
  const tested = camera !== null;
  const network =
    typeof navigator !== "undefined" &&
    (
      navigator as Navigator & { connection?: { effectiveType?: string } }
    ).connection?.effectiveType?.includes("2g")
      ? "poor"
      : "good";
  return (
    <Card title="Check your camera and microphone">
      <div className="grid gap-4 md:grid-cols-2">
        <SelfView on={tested && Boolean(camera)} label="You" />
        <ul className="flex flex-col gap-2 text-small">
          <li className="flex items-center gap-2">
            {camera ? (
              <Video className="size-4 text-healthy" aria-hidden="true" />
            ) : (
              <VideoOff className="size-4 text-ink-500" aria-hidden="true" />
            )}{" "}
            Camera {tested ? (camera ? "working" : "not available") : "not tested"}
          </li>
          <li className="flex items-center gap-2">
            {microphone ? (
              <Mic className="size-4 text-healthy" aria-hidden="true" />
            ) : (
              <MicOff className="size-4 text-ink-500" aria-hidden="true" />
            )}{" "}
            Microphone {tested ? (microphone ? "working" : "not available") : "not tested"}
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-healthy" aria-hidden="true" /> Connection {network}
          </li>
          <li>
            <Button size="sm" disabled={testing} onClick={test}>
              {testing ? "Testing…" : tested ? "Test again" : "Test my device"}
            </Button>
          </li>
        </ul>
      </div>
      <Button
        variant="primary"
        className="mt-5"
        disabled={busy || !tested}
        onClick={() =>
          act({
            action: "device",
            camera: Boolean(camera),
            microphone: Boolean(microphone),
            network,
          })
        }
      >
        {tested && !camera ? "Continue without camera" : "Continue"}
      </Button>
    </Card>
  );
}

function Waiting({ c, busy, act }: { c: TelehealthDto; busy: boolean; act: Act }) {
  const now = useNow();
  const entered = c.state === "Waiting";
  return (
    <Card title="Waiting room">
      <div className="flex items-center gap-4">
        <Avatar name={c.therapist} size={56} />
        <div>
          <p className="text-body font-semibold">{c.therapist}</p>
          <p className="text-small text-ink-700">{slotLabel(c.start)}</p>
        </div>
      </div>
      {entered ? (
        <p
          role="status"
          className="mt-5 flex items-center gap-2 rounded-control bg-accent-tint px-4 py-3 text-small"
        >
          <Hourglass className="size-4 text-accent motion-safe:animate-pulse" aria-hidden="true" />
          You&apos;re in the waiting room. {c.therapist.split(" ")[0]} will let you in shortly
          {now && c.waitingSince
            ? ` (waiting ${Math.max(0, Math.round((now - new Date(c.waitingSince).getTime()) / 60_000))} min)`
            : ""}
          .
        </p>
      ) : (
        <Button
          variant="primary"
          className="mt-5"
          disabled={busy}
          onClick={() => act({ action: "wait" })}
        >
          Enter the waiting room
        </Button>
      )}
    </Card>
  );
}

function InCall({
  c,
  busy,
  onLeave,
}: {
  c: TelehealthDto;
  busy: boolean;
  act: Act;
  onLeave: () => void;
}) {
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(Boolean(c.device?.camera));
  return (
    <section className="rounded-card bg-ink-900 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-label font-semibold tracking-wide text-surface/70 uppercase">
          DEMO ONLY · simulated video
        </p>
        <RecordingBadge status={c.recording.status} />
      </div>
      <div className={cn("grid gap-3", c.screenShare ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {c.screenShare && (
          <div className="flex aspect-video items-center justify-center rounded-card bg-surface/10 text-small text-surface md:col-span-2">
            {c.therapist.split(" ")[0]} is sharing their screen
          </div>
        )}
        <div className="relative flex aspect-video items-center justify-center rounded-card bg-surface/10">
          <Avatar name={c.therapist} size={72} />
          <span className="absolute bottom-2 left-2 rounded-full bg-ink-900/70 px-2 py-0.5 text-caption text-surface">
            {c.therapist}
          </span>
        </div>
        <SelfView on={cam} label={`${c.guest?.name ?? "You"} (you)`} />
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          aria-label={mic ? "Mute" : "Unmute"}
          onClick={() => setMic(!mic)}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface/15 text-surface"
        >
          {mic ? (
            <Mic className="size-5" aria-hidden="true" />
          ) : (
            <MicOff className="size-5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          aria-label={cam ? "Stop video" : "Start video"}
          onClick={() => setCam(!cam)}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface/15 text-surface"
        >
          {cam ? (
            <Video className="size-5" aria-hidden="true" />
          ) : (
            <VideoOff className="size-5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onLeave}
          className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-over-dot px-5 text-small font-semibold text-white"
        >
          <LogOut className="size-4" aria-hidden="true" /> Leave
        </button>
      </div>
    </section>
  );
}

function Trouble({ busy, act }: { busy: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="mt-6 rounded-card border border-border bg-surface p-4 text-small">
      <button
        type="button"
        className="cursor-pointer font-semibold text-accent"
        onClick={() => setOpen(!open)}
      >
        Having trouble connecting?
      </button>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              await act({ action: "trouble", kind: "retry" });
              window.location.reload();
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" /> Try again
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await act({ action: "trouble", kind: "phone" }))
                setDone("Your clinician has been told. They'll call the booking contact's phone.");
            }}
          >
            <Phone className="size-3.5" aria-hidden="true" /> Ask for a phone call
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await act({ action: "trouble", kind: "rebook" }))
                setDone("We'll contact you to book a new time.");
            }}
          >
            Rebook the visit
          </Button>
        </div>
      )}
      {done && (
        <p role="status" className="mt-2 text-healthy">
          {done}
        </p>
      )}
    </div>
  );
}
