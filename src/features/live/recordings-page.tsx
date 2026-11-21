"use client";

import { AudioLines, Clock3, Lock, PlayCircle, ShieldCheck, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { api, useResource } from "@/lib/live/client";
import {
  RECORDING_RETENTION_DAYS,
  type RecordingDto,
  type RecordingPlayback,
} from "@/lib/live/telehealth";
import { relativeTime, shortDate, slotLabel } from "@/lib/live/time";
import { EmptyNote, ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { TextField } from "./form-bits";

const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const hoursOf = (sec: number) =>
  sec >= 3600
    ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`
    : `${Math.round(sec / 60)}m`;

/**
 * Telehealth recordings (section 12): purpose-limited review, no download, every view logged,
 * access restriction and deletion by a Clinical Lead under the retention policy.
 */
export function RecordingsPage() {
  const { data, error, reload } = useResource<{ recordings: RecordingDto[] }>(
    "/api/telehealth/recordings",
    (e) => e.type === "care",
  );
  const [filter, setFilter] = useState<"All" | "Available" | "Reviewed">("All");
  const [visit, setVisit] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once after mount
    setVisit(new URLSearchParams(window.location.search).get("visit"));
  }, []);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  const all = data?.recordings ?? [];
  const one = visit ? all.filter((r) => r.visitId === visit) : [];
  const shown = (one.length ? one : all).filter((r) =>
    filter === "All"
      ? true
      : filter === "Available"
        ? r.status === "Available"
        : r.accessLog.some((a) => a.action === "Viewed"),
  );
  const views = all.reduce(
    (s, r) => s + r.accessLog.filter((a) => a.action === "Viewed").length,
    0,
  );
  return (
    <>
      <PageHeader
        eyebrow="Telehealth"
        title="Recordings"
        description={`Recorded only with the participant's consent and the clinician's permission. Kept ${RECORDING_RETENTION_DAYS} days (proposed), then reviewed for deletion. No downloads; every review is logged.`}
        actions={<LiveBadge />}
      />
      {!data ? (
        <Skeleton className="h-40" />
      ) : all.length === 0 ? (
        <EmptyNote title="No recordings.">
          Recordings appear here after a consented telehealth visit is recorded.
        </EmptyNote>
      ) : (
        <div className="flex flex-col gap-6">
          <MetricBand
            label="Recording figures"
            metrics={[
              { label: "Recordings", value: all.length },
              {
                label: "Recorded time",
                value: hoursOf(all.reduce((s, r) => s + r.durationSec, 0)),
              },
              { label: "Available", value: all.filter((r) => r.status === "Available").length },
              { label: "Reviews logged", value: views },
              {
                label: "Restricted",
                value: all.filter((r) => r.status === "Access Restricted").length,
              },
            ]}
          />
          <div className="flex items-center justify-between gap-3">
            <Segmented
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "All", label: "All" },
                { id: "Available", label: "Available" },
                { id: "Reviewed", label: "Reviewed" },
              ]}
            />
            <span className="flex items-center gap-3 text-small text-ink-500">
              {one.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setVisit(null);
                    window.history.replaceState(null, "", window.location.pathname);
                  }}
                  className="cursor-pointer font-semibold text-accent"
                >
                  Show all recordings
                </button>
              )}
              {shown.length} recording{shown.length === 1 ? "" : "s"}
            </span>
          </div>
          {shown.map((r) => (
            <Recording key={r.id} r={r} onChanged={reload} />
          ))}
        </div>
      )}
    </>
  );
}

function Recording({ r, onChanged }: { r: RecordingDto; onChanged: () => void }) {
  const [purpose, setPurpose] = useState("");
  const [reason, setReason] = useState("");
  const [playing, setPlaying] = useState<RecordingPlayback | null>(null);
  const [track, setTrack] = useState<"video" | "audio">("video");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      const res = await api<{ playback?: RecordingPlayback }>(
        `/api/telehealth/recordings/${r.id}`,
        {
          body,
        },
      );
      if (res.playback) {
        setPlaying(res.playback);
        setTrack(res.playback.video ? "video" : "audio");
      }
      onChanged();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const viewable = r.status === "Available" || (r.status === "Access Restricted" && r.canManage);
  return (
    <Panel
      title={`${r.patient} · ${slotLabel(r.at)}`}
      action={
        <Tag
          tone={
            r.status === "Available"
              ? "healthy"
              : r.status === "Deleted per policy"
                ? "neutral"
                : r.status === "Access Restricted"
                  ? "over"
                  : "monitor"
          }
        >
          {r.status}
        </Tag>
      }
    >
      <div className="-mt-1 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-small text-ink-700">
        <span className="flex items-center gap-2">
          <Avatar name={r.therapist} size={24} />
          {r.therapist}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="size-4 text-ink-500" aria-hidden="true" />
          {minutes(r.durationSec)} recorded
        </span>
        {r.discipline && <span>{r.discipline}</span>}
        {r.hasVideo && (
          <span className="flex items-center gap-1.5">
            <Video className="size-4 text-ink-500" aria-hidden="true" /> Video and sound
          </span>
        )}
        {r.retentionUntil && !r.deleted && (
          <span className="text-ink-500">Review for deletion {shortDate(r.retentionUntil)}</span>
        )}
      </div>
      {r.deleted ? (
        <p className="text-small text-ink-700">
          Deleted {relativeTime(r.deleted.at)} by {r.deleted.byName}: {r.deleted.reason}.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {playing ? (
              <div className="flex flex-col gap-3">
                {playing.video && playing.audio && (
                  <Segmented
                    label="Track"
                    value={track}
                    onChange={setTrack}
                    options={[
                      { id: "video", label: "Video" },
                      { id: "audio", label: "Audio only" },
                    ]}
                  />
                )}
                {track === "video" && playing.video ? (
                  <video
                    key={playing.video}
                    src={playing.video}
                    controls
                    autoPlay
                    controlsList="nodownload"
                    onContextMenu={(e) => e.preventDefault()}
                    className="aspect-video w-full rounded-card bg-call-stage"
                  />
                ) : playing.audio ? (
                  <div className="flex flex-col gap-3 rounded-card bg-call-stage p-5 text-call-ink">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.patient} size={48} kind="patient" />
                      <div>
                        <p className="text-section">{r.patient}</p>
                        <p className="text-caption opacity-75">
                          Audio track · {minutes(r.durationSec)}
                        </p>
                      </div>
                      <AudioLines className="ml-auto size-6 opacity-75" aria-hidden="true" />
                    </div>
                    <audio
                      key={playing.audio}
                      src={playing.audio}
                      controls
                      autoPlay
                      controlsList="nodownload"
                      className="w-full"
                    />
                  </div>
                ) : (
                  <p className="text-small text-ink-500">No media is stored for this recording.</p>
                )}
                <p className="flex items-center gap-1.5 text-caption text-ink-500">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  This review is logged with your purpose. Download is disabled.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-card bg-call-stage">
                  <div className="flex items-center gap-6 opacity-90">
                    <Avatar name={r.patient} size={96} kind="patient" />
                    <Avatar name={r.therapist} size={64} />
                  </div>
                  <span className="absolute top-3 left-3 rounded-full bg-call-tile px-2.5 py-1 text-caption text-call-ink">
                    {minutes(r.durationSec)}
                  </span>
                  <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-call-tile px-2.5 py-1 text-caption text-call-ink">
                    <Lock className="size-3" aria-hidden="true" /> State a purpose to play
                  </span>
                </div>
                <TextField
                  label="Purpose of this review"
                  required
                  value={purpose}
                  onChange={setPurpose}
                  placeholder="For example, checking goal measures for the progress report"
                />
                <Button
                  variant="primary"
                  disabled={busy || !viewable || purpose.trim().length < 5}
                  onClick={() => act({ action: "view", purpose })}
                >
                  <PlayCircle className="size-4" aria-hidden="true" />
                  Review recording
                </Button>
                {!viewable && (
                  <p className="text-caption text-ink-500">
                    {r.status === "Processing"
                      ? "Still processing. Refresh in a moment."
                      : r.status === "Access Restricted"
                        ? "Access is restricted by the Clinical Lead."
                        : "Not available."}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-5 lg:col-span-5">
            {r.transcript.length > 0 && (
              <div>
                <h3 className="mb-2 label-caps text-ink-500">Transcript (consented)</h3>
                <ol className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-card border border-border bg-sunken p-3 text-small">
                  {r.transcript.map((t, i) => (
                    <li key={i}>
                      <span
                        className={cn(
                          "font-semibold",
                          t.speaker === r.therapist ? "text-accent" : "text-ink-900",
                        )}
                      >
                        {t.speaker}:
                      </span>{" "}
                      <span className="text-ink-700">{t.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div>
              <h3 className="mb-2 label-caps text-ink-500">Access log</h3>
              {r.accessLog.length === 0 ? (
                <p className="text-small text-ink-500">Not viewed yet.</p>
              ) : (
                <ol className="flex max-h-40 flex-col gap-1.5 overflow-y-auto text-caption">
                  {[...r.accessLog].reverse().map((a) => (
                    <li key={a.at}>
                      <strong>{a.action}</strong> by {a.byName}, {relativeTime(a.at)}
                      {a.purpose && <span className="block text-ink-500">{a.purpose}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
      {r.canManage && !r.deleted && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => act({ action: "restrict", on: r.status !== "Access Restricted" })}
          >
            <Lock className="size-3.5" aria-hidden="true" />
            {r.status === "Access Restricted" ? "Restore access" : "Restrict access"}
          </Button>
          <div className="min-w-60 flex-1">
            <TextField label="Reason for deletion" value={reason} onChange={setReason} />
          </div>
          <Button
            size="sm"
            disabled={busy || reason.trim().length < 5}
            onClick={() => act({ action: "delete", reason })}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete per policy
          </Button>
        </div>
      )}
      {fail && (
        <p role="alert" className="mt-3 text-small text-over">
          {fail}
        </p>
      )}
    </Panel>
  );
}
