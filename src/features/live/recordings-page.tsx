"use client";

import { Lock, PlayCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Tag } from "@/components/ui/tag";
import { api, useResource } from "@/lib/live/client";
import { RECORDING_RETENTION_DAYS, type RecordingDto } from "@/lib/live/telehealth";
import { relativeTime, shortDate, slotLabel } from "@/lib/live/time";
import { EmptyNote, ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { TextField } from "./form-bits";

const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/**
 * Telehealth recordings (section 12): purpose-limited review, no download, every view logged,
 * access restriction and deletion by a Clinical Lead under the retention policy.
 */
export function RecordingsPage() {
  const { data, error, reload } = useResource<{ recordings: RecordingDto[] }>(
    "/api/telehealth/recordings",
    (e) => e.type === "care",
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  return (
    <>
      <PageHeader
        eyebrow="Telehealth"
        title="Recordings"
        description={`Recorded only with the participant's consent and the clinician's permission. Kept ${RECORDING_RETENTION_DAYS} days (PROPOSED, to confirm with Medisense), then reviewed for deletion. Playback is a DEMO ONLY sample.`}
        actions={<LiveBadge />}
      />
      {!data ? (
        <Skeleton className="h-40" />
      ) : data.recordings.length === 0 ? (
        <EmptyNote title="No recordings.">
          Recordings appear here after a consented telehealth visit is recorded.
        </EmptyNote>
      ) : (
        <div className="flex flex-col gap-4">
          {data.recordings.map((r) => (
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
  const [playing, setPlaying] = useState<{ label: string; durationSec: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      const res = await api<{ playback?: { label: string; durationSec: number } }>(
        `/api/telehealth/recordings/${r.id}`,
        { body },
      );
      if (res.playback) setPlaying(res.playback);
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
      <p className="-mt-2 mb-4 text-caption text-ink-500">
        {r.therapist} · {minutes(r.durationSec)} recorded
        {r.retentionUntil && !r.deleted && ` · review for deletion ${shortDate(r.retentionUntil)}`}
      </p>
      {r.deleted ? (
        <p className="text-small text-ink-700">
          Deleted {relativeTime(r.deleted.at)} by {r.deleted.byName}: {r.deleted.reason}.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            {playing ? (
              <div className="flex aspect-video flex-col items-center justify-center rounded-card bg-ink-900 text-surface">
                <PlayCircle className="size-10" aria-hidden="true" />
                <p className="mt-2 text-small font-semibold">{playing.label}</p>
                <p className="text-caption text-surface/70">
                  {minutes(playing.durationSec)} · download disabled
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <TextField
                  label="Purpose of this review"
                  required
                  value={purpose}
                  onChange={setPurpose}
                  placeholder="For example, checking goal measures for the progress report"
                />
                <Button
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
          <div>
            <h3 className="mb-2 text-caption font-semibold text-ink-500 uppercase">Access log</h3>
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
