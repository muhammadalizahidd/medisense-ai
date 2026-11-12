"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Field, inputClass } from "@/components/ui/sheet";
import { AppearanceSettings } from "@/features/appearance/appearance-settings";
import { api, useResource } from "@/lib/live/client";
import type { SessionUser, TherapistDetailDto } from "@/lib/live/types";
import { AvailabilityEditor } from "./availability-editor";
import { ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { TherapistRecord } from "./therapist-record";

type Profile = {
  user: SessionUser & { phone: string | null };
  therapist: TherapistDetailDto | null;
};

const roleLabel = { admin: "Administration", therapist: "Therapist", client: "Patient" } as const;

/** My profile, for admins and therapists: details, password, and for therapists availability and record. */
export function ProfilePage() {
  const { data, error, loading, reload } = useResource<Profile>(
    "/api/me/profile",
    (e) => e.type === "care",
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const { user, therapist } = data;

  return (
    <>
      <PageHeader
        eyebrow="My profile"
        title={user.name}
        description={
          therapist
            ? `${therapist.discipline} · ${therapist.region} · ${therapist.availability.pattern}`
            : roleLabel[user.role]
        }
        actions={<LiveBadge />}
      />
      <div className="mb-6 grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-7">
          <DetailsForm
            key={`${user.phone}-${therapist?.profile.bio}`}
            profile={data}
            onSaved={reload}
          />
          {therapist && (
            <AvailabilityEditor
              key={JSON.stringify([therapist.weekly, therapist.timeOff])}
              weekly={therapist.weekly}
              timeOff={therapist.timeOff}
              onSaved={reload}
            />
          )}
        </div>
        <div className="xl:col-span-5">
          <PasswordForm />
        </div>
      </div>
      <div className="mb-6">
        <AppearanceSettings />
      </div>
      {therapist && (
        <>
          <h2 className="mb-4 text-section font-semibold text-ink-900">Your record</h2>
          <TherapistRecord t={therapist} patientLinks={false} />
        </>
      )}
    </>
  );
}

function DetailsForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const t = profile.therapist;
  const [phone, setPhone] = useState(profile.user.phone ?? "");
  const [bio, setBio] = useState(t?.profile.bio ?? "");
  const [qualifications, setQualifications] = useState(t?.profile.qualifications ?? "");
  const [languages, setLanguages] = useState((t?.profile.languages ?? ["English"]).join(", "));
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: boolean }>({
    busy: false,
    error: null,
    done: false,
  });

  async function save(event: FormEvent) {
    event.preventDefault();
    setState({ busy: true, error: null, done: false });
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: {
          phone: phone.trim() || null,
          ...(t
            ? {
                bio,
                qualifications,
                languages: languages
                  .split(",")
                  .map((l) => l.trim())
                  .filter(Boolean),
              }
            : {}),
        },
      });
      setState({ busy: false, error: null, done: true });
      onSaved();
    } catch (e) {
      setState({
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't save.",
        done: false,
      });
    }
  }

  return (
    <Panel title="Your details">
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Name" hint="Ask an admin to change your name.">
          <input value={profile.user.name} readOnly className={`${inputClass} bg-canvas`} />
        </Field>
        <Field label="Email" hint="You sign in with this.">
          <input value={profile.user.email} readOnly className={`${inputClass} bg-canvas`} />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
        {t && (
          <>
            <Field label="Languages" hint="Separate with commas.">
              <input
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Qualifications">
                <input
                  value={qualifications}
                  onChange={(e) => setQualifications(e.target.value)}
                  maxLength={300}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="About you" hint="Shown to the care team when they match patients.">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  maxLength={800}
                  className={`${inputClass} h-auto py-2`}
                />
              </Field>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" variant="primary" disabled={state.busy}>
            {state.busy ? "Saving…" : "Save details"}
          </Button>
          {state.done && (
            <span role="status" className="text-small text-healthy">
              Saved.
            </span>
          )}
          {state.error && (
            <span role="alert" className="text-small text-over">
              {state.error}
            </span>
          )}
        </div>
      </form>
    </Panel>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: boolean }>({
    busy: false,
    error: null,
    done: false,
  });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setState({ busy: false, error: "The new passwords don't match.", done: false });
      return;
    }
    setState({ busy: true, error: null, done: false });
    try {
      await api("/api/me/password", { body: { current, next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      setState({ busy: false, error: null, done: true });
    } catch (e) {
      setState({
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't change it.",
        done: false,
      });
    }
  }

  return (
    <Panel title="Password">
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Current password">
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="New password" hint="At least 10 characters.">
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={state.busy || !current || next.length < 10}>
            {state.busy ? "Changing…" : "Change password"}
          </Button>
          {state.done && (
            <span role="status" className="text-small text-healthy">
              Password changed.
            </span>
          )}
          {state.error && (
            <span role="alert" className="text-small text-over">
              {state.error}
            </span>
          )}
        </div>
      </form>
    </Panel>
  );
}
