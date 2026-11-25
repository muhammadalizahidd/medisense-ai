"use client";

import {
  CalendarCheck,
  Check,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  KeyRound,
  Languages,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { PhotoEdit } from "@/components/ui/photo-picker";
import { Field, inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { AppearanceSettings } from "@/features/appearance/appearance-settings";
import { api, useResource } from "@/lib/live/client";
import type { StaffRecordDto } from "@/lib/live/staff";
import type { SessionUser, TherapistDetailDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { AvailabilityEditor } from "./availability-editor";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { MyLeave } from "./my-leave";
import { MyTimesheet } from "./my-timesheet";
import { TherapistRecord } from "./therapist-record";
import { MyCredentials, engagementTone } from "./staff-profile";

type Profile = {
  user: SessionUser & { phone: string | null };
  therapist: TherapistDetailDto | null;
};

const allTabs = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Personal details" },
  { id: "availability", label: "Availability" },
  { id: "leave", label: "Leave" },
  { id: "timesheet", label: "Timesheet" },
  { id: "credentials", label: "Credentials" },
  { id: "security", label: "Security" },
  { id: "appearance", label: "Appearance" },
] as const;

type TabId =
  | "overview"
  | "details"
  | "availability"
  | "leave"
  | "timesheet"
  | "credentials"
  | "security"
  | "appearance";

const roleLabel = { admin: "Administration", therapist: "Therapist", client: "Patient" } as const;

/** My profile, for admins and therapists: an identity header, then everything in tabs. */
export function ProfilePage() {
  const { data, error, loading, reload } = useResource<Profile>(
    "/api/me/profile",
    (e) => e.type === "care",
  );
  const isTherapist = data?.user.role === "therapist";
  const staff = useResource<{ staff: StaffRecordDto }>(
    isTherapist ? "/api/me/staff" : null,
    (e) => e.type === "care",
  );
  const s = staff.data?.staff ?? null;
  const pendingCreds = s?.credentials.filter((c) => c.status !== "Verified").length ?? 0;

  const tabs: { id: TabId; label: string; count?: number; alert?: boolean }[] = isTherapist
    ? [
        { id: "overview", label: "Overview" },
        { id: "details", label: "Personal details" },
        { id: "availability", label: "Availability" },
        { id: "leave", label: "Leave" },
        { id: "timesheet", label: "Timesheet" },
        { id: "credentials", label: "Credentials", count: pendingCreds || undefined, alert: true },
        { id: "security", label: "Security" },
        { id: "appearance", label: "Appearance" },
      ]
    : [
        { id: "details", label: "Personal details" },
        { id: "security", label: "Security" },
        { id: "appearance", label: "Appearance" },
      ];
  // Every tab id is known up front, so a link such as ?tab=credentials works before the profile
  // has loaded; tabs this person doesn't have fall back to the first one below.
  const [tab, setTab] = useTab(allTabs);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const { user, therapist } = data;
  // An admin opening a therapist-only tab from an old link lands on details.
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id;

  return (
    <>
      <Identity profile={data} staff={s} />
      <Tabs label="My profile" tabs={tabs} value={current} onChange={setTab} />

      {therapist && (
        <TabPanel id="overview" value={current}>
          <TherapistRecord t={therapist} patientLinks={false} />
        </TabPanel>
      )}

      <TabPanel id="details" value={current}>
        <DetailsTab
          key={`${user.phone}-${therapist?.profile.bio}-${therapist?.profile.qualifications}`}
          profile={data}
          onSaved={reload}
        />
      </TabPanel>

      {therapist && (
        <TabPanel id="availability" value={current}>
          <AvailabilityEditor
            key={JSON.stringify([therapist.weekly, therapist.timeOff])}
            weekly={therapist.weekly}
            timeOff={therapist.timeOff}
            onSaved={reload}
          />
        </TabPanel>
      )}

      {therapist && (
        <TabPanel id="leave" value={current}>
          <MyLeave />
        </TabPanel>
      )}

      {therapist && (
        <TabPanel id="timesheet" value={current}>
          <MyTimesheet />
        </TabPanel>
      )}

      {therapist && (
        <TabPanel id="credentials" value={current}>
          <CredentialSteps />
          {s ? (
            <MyCredentials s={s} onSaved={staff.reload} />
          ) : staff.error ? (
            <ErrorNote message={staff.error} onRetry={staff.reload} />
          ) : (
            <Skeleton className="h-64" />
          )}
        </TabPanel>
      )}

      <TabPanel id="security" value={current}>
        <SecurityTab email={user.email} />
      </TabPanel>

      <TabPanel id="appearance" value={current}>
        <AppearanceSettings />
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ identity */

function Identity({ profile, staff }: { profile: Profile; staff: StaffRecordDto | null }) {
  const { user, therapist: t } = profile;
  const verified = staff?.credentials.filter((c) => c.status === "Verified").length ?? 0;
  const tiles: { label: string; value: string; sub: string; icon: LucideIcon; tone?: "over" }[] = t
    ? [
        {
          label: "Upcoming visits",
          value: String(t.stats.upcoming),
          sub: `${t.stats.completed} completed so far`,
          icon: CalendarCheck,
        },
        {
          label: "Caseload",
          value: `${t.activeClients} of ${t.capacity}`,
          sub:
            t.activeClients >= t.capacity
              ? "At capacity"
              : `${t.capacity - t.activeClients} places open`,
          icon: Users,
          tone: t.activeClients > t.capacity ? "over" : undefined,
        },
        {
          label: "Rating",
          value: t.rating ? `${t.rating.average.toFixed(1)} / 5` : "No ratings",
          sub: t.rating ? `From ${t.rating.count} reviews` : "Shown after visits",
          icon: Star,
        },
        {
          label: "Credentials",
          value: staff ? `${verified} of ${staff.credentials.length} verified` : "…",
          sub: staff?.blocks.length ? "Action needed" : "Register up to date",
          icon: FileCheck2,
          tone: staff?.blocks.length ? "over" : undefined,
        },
      ]
    : [
        { label: "Access", value: roleLabel[user.role], sub: "Your workspace", icon: ShieldCheck },
        { label: "Email", value: user.email, sub: "You sign in with this", icon: Mail },
        {
          label: "Phone",
          value: user.phone || "Not added",
          sub: user.phone ? "For urgent contact" : "Add it in Personal details",
          icon: Phone,
        },
        { label: "Security", value: "Password", sub: "Change it in Security", icon: Lock },
      ];

  return (
    <section className="mb-5 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <div className="flex flex-wrap items-center gap-5 px-6 py-5">
        <div className="relative flex-none">
          {t ? (
            <PhotoEdit
              owner="therapist"
              id={t.id}
              name={user.name}
              photoUrl={t.photoUrl}
              kind="staff"
              size={68}
              className="ring-4 ring-accent-tint"
            />
          ) : (
            <Avatar name={user.name} size={68} className="ring-4 ring-accent-tint" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-[3px] border-surface",
              !staff || staff.status === "Active"
                ? "bg-healthy-dot"
                : staff.status === "On Leave"
                  ? "bg-watch-dot"
                  : "bg-over-dot",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="type-display text-h1 leading-tight text-ink-900">{user.name}</h1>
            <Tag tone="outline">{t ? t.discipline : roleLabel[user.role]}</Tag>
            {staff && <Tag tone={engagementTone[staff.status]}>{staff.status}</Tag>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-small text-ink-700">
            {staff?.staffId && (
              <span className="rounded-tag bg-sunken px-2 py-0.5 font-mono text-caption text-ink-700">
                {staff.staffId}
              </span>
            )}
            <Meta icon={Mail}>{user.email}</Meta>
            {user.phone && <Meta icon={Phone}>{user.phone}</Meta>}
            {t && <Meta icon={MapPin}>{t.region}</Meta>}
            {t && <Meta icon={Clock}>{t.availability.pattern}</Meta>}
          </div>
        </div>
        <LiveBadge />
      </div>
      <dl className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((k) => (
          <div
            key={k.label}
            className="group flex gap-3 bg-surface px-6 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas"
          >
            <span
              className={cn(
                "flex size-9 flex-none items-center justify-center rounded-control transition-transform duration-(--duration-fast) group-hover:scale-105",
                k.tone === "over" ? "bg-over-bg text-over" : "bg-accent-tint text-accent",
              )}
            >
              <k.icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {k.label}
              </dt>
              <dd className="mt-0.5 truncate text-small font-semibold text-ink-900">{k.value}</dd>
              <dd className="truncate text-caption text-ink-500">{k.sub}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Meta({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-ink-500" aria-hidden="true" />
      {children}
    </span>
  );
}

/** A titled card with an icon, used across the tabs. */
function Card({
  icon: Icon,
  title,
  sub,
  children,
  footer,
  className,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface shadow-lift",
        className,
      )}
    >
      <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-section font-semibold text-ink-900">{title}</h2>
          {sub && <p className="text-caption text-ink-500">{sub}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-canvas px-5 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase md:col-span-2">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ details */

function DetailsTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const t = profile.therapist;
  const [phone, setPhone] = useState(profile.user.phone ?? "");
  const [bio, setBio] = useState(t?.profile.bio ?? "");
  const [qualifications, setQualifications] = useState(t?.profile.qualifications ?? "");
  const [languages, setLanguages] = useState((t?.profile.languages ?? ["English"]).join(", "));
  const [busy, setBusy] = useState(false);
  const langList = languages
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  const dirty =
    phone !== (profile.user.phone ?? "") ||
    (t !== null &&
      (bio !== t.profile.bio ||
        qualifications !== t.profile.qualifications ||
        langList.join(",") !== t.profile.languages.join(",")));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: {
          phone: phone.trim() || null,
          ...(t ? { bio, qualifications, languages: langList } : {}),
        },
      });
      toast("Details saved", { tone: "success" });
      onSaved();
    } catch (e) {
      toast("Couldn't save", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid items-stretch gap-6 xl:grid-cols-12">
      <Card
        icon={UserRound}
        title="Personal details"
        sub="Your contact details and how you present to the care team"
        className="xl:col-span-8"
        footer={
          <>
            <Button type="submit" variant="primary" disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save details"}
            </Button>
            <span className="text-caption text-ink-500">
              {dirty ? "You have unsaved changes." : "Everything is saved."}
            </span>
          </>
        }
      >
        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
          <GroupLabel>Contact</GroupLabel>
          <Field label="Name" hint="Ask an admin to change your name.">
            <LockedInput value={profile.user.name} />
          </Field>
          <Field label="Email" hint="You sign in with this.">
            <LockedInput value={profile.user.email} />
          </Field>
          <Field label="Phone" hint="Used by the care team for urgent contact.">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="04xx xxx xxx"
              className={inputClass}
            />
          </Field>
          {t && (
            <Field label="Languages" hint="Separate with commas.">
              <input
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          {t && (
            <>
              <div className="mt-2 border-t border-border pt-5 md:col-span-2">
                <GroupLabel>Professional</GroupLabel>
              </div>
              <div className="md:col-span-2">
                <Field
                  label="Qualifications"
                  hint="For example: B.OccThy (UQ), Sensory integration cert."
                >
                  <input
                    value={qualifications}
                    onChange={(e) => setQualifications(e.target.value)}
                    maxLength={300}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field
                  label="About you"
                  hint={`Shown to the care team when they match patients · ${bio.length}/800`}
                >
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    maxLength={800}
                    placeholder="Your clinical interests, the ages you work with, and anything that helps matching."
                    className={`${inputClass} h-auto py-2`}
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card
        icon={Eye}
        title={t ? "How the care team sees you" : "Your account"}
        sub={t ? "Live preview while you type" : undefined}
        className="xl:col-span-4"
      >
        <div className="flex items-center gap-3">
          <Avatar name={profile.user.name} size={48} />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ink-900">{profile.user.name}</p>
            <p className="truncate text-caption text-ink-500">
              {t ? `${t.discipline} · ${t.seniority} · ${t.region}` : roleLabel[profile.user.role]}
            </p>
          </div>
        </div>
        {t ? (
          <>
            <p
              className={cn(
                "mt-4 rounded-control bg-canvas px-3 py-2.5 text-small leading-relaxed",
                bio ? "text-ink-700" : "text-ink-500 italic",
              )}
            >
              {bio || "Add a short introduction so the care team can match you well."}
            </p>
            <dl className="mt-4 flex flex-col gap-3 text-small">
              <PreviewRow icon={FileCheck2} label="Qualifications">
                {qualifications || "Not added"}
              </PreviewRow>
              <PreviewRow icon={Languages} label="Languages">
                <span className="flex flex-wrap gap-1.5">
                  {langList.length
                    ? langList.map((l) => (
                        <span
                          key={l}
                          className="rounded-tag bg-accent-tint px-2 py-0.5 text-caption font-semibold text-accent"
                        >
                          {l}
                        </span>
                      ))
                    : "Not added"}
                </span>
              </PreviewRow>
              <PreviewRow icon={Phone} label="Phone">
                {phone || "Not added"}
              </PreviewRow>
            </dl>
          </>
        ) : (
          <dl className="mt-4 flex flex-col gap-3 text-small">
            <PreviewRow icon={Mail} label="Email">
              {profile.user.email}
            </PreviewRow>
            <PreviewRow icon={Phone} label="Phone">
              {phone || "Not added"}
            </PreviewRow>
            <PreviewRow icon={ShieldCheck} label="Access">
              {roleLabel[profile.user.role]}
            </PreviewRow>
          </dl>
        )}
      </Card>
    </form>
  );
}

function LockedInput({ value }: { value: string }) {
  return (
    <div className="relative">
      <input value={value} readOnly className={`${inputClass} bg-canvas pr-9 text-ink-700`} />
      <Lock
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-ink-400"
        aria-hidden="true"
      />
    </div>
  );
}

function PreviewRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 flex-none text-ink-500" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-caption text-ink-500">{label}</dt>
        <dd className="text-ink-900">{children}</dd>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ credentials */

function CredentialSteps() {
  const steps = [
    { title: "Add credential", text: "Type, number, expiry and the evidence file" },
    { title: "Awaiting review", text: "It goes to the Clinical Lead" },
    { title: "Verified", text: "Required items in date: you can take new patients" },
  ];
  return (
    <ol className="grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift md:grid-cols-3">
      {steps.map((st, i) => (
        <li key={st.title} className="flex items-start gap-3 bg-surface px-5 py-3.5">
          <span className="flex size-7 flex-none items-center justify-center rounded-full bg-accent-tint text-caption font-semibold text-accent">
            {i + 1}
          </span>
          <div>
            <p className="text-small font-semibold text-ink-900">{st.title}</p>
            <p className="text-caption text-ink-500">{st.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ security */

const rules = [
  { label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  {
    label: "Upper and lower case letters",
    test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  { label: "A number", test: (p: string) => /\d/.test(p) },
  { label: "A symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function SecurityTab({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const passed = rules.filter((r) => r.test(next)).length;
  const strength = !next ? "" : passed <= 1 ? "Weak" : passed <= 3 ? "Fair" : "Strong";
  const mismatch = confirm.length > 0 && confirm !== next;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) return;
    setBusy(true);
    try {
      await api("/api/me/password", { body: { current, next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password changed", { tone: "success", detail: "Use it the next time you sign in." });
    } catch (e) {
      toast("Couldn't change it", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <form onSubmit={save} className="xl:col-span-8">
        <Card
          icon={KeyRound}
          title="Change password"
          sub={`For ${email}`}
          footer={
            <>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !current || next.length < 10 || next !== confirm}
              >
                {busy ? "Changing…" : "Change password"}
              </Button>
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-700 transition-colors hover:text-accent"
              >
                {show ? (
                  <EyeOff className="size-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="size-3.5" aria-hidden="true" />
                )}
                {show ? "Hide passwords" : "Show passwords"}
              </button>
            </>
          }
        >
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <div className="md:col-span-2 md:max-w-[calc(50%-10px)]">
              <Field label="Current password">
                <input
                  type={type}
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <div>
              <Field label="New password">
                <input
                  type={type}
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="mt-2 flex items-center gap-2" aria-live="polite">
                <div className="flex flex-1 gap-1">
                  {rules.map((r, i) => (
                    <span
                      key={r.label}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors duration-(--duration-fast)",
                        i < passed
                          ? passed <= 1
                            ? "bg-over-dot"
                            : passed <= 3
                              ? "bg-watch-dot"
                              : "bg-healthy-dot"
                          : "bg-sunken",
                      )}
                    />
                  ))}
                </div>
                <span className="w-14 text-right text-caption font-semibold text-ink-700">
                  {strength}
                </span>
              </div>
            </div>
            <Field
              label="Confirm new password"
              error={mismatch ? "The new passwords don't match." : undefined}
            >
              <input
                type={type}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </Field>
            <ul className="grid gap-2 rounded-control bg-canvas px-4 py-3 sm:grid-cols-2 md:col-span-2">
              {rules.map((r) => {
                const ok = r.test(next);
                return (
                  <li
                    key={r.label}
                    className={cn(
                      "flex items-center gap-2 text-caption transition-colors",
                      ok ? "text-healthy" : "text-ink-500",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full transition-colors",
                        ok ? "bg-healthy-bg" : "bg-sunken",
                      )}
                    >
                      {ok && <Check className="size-3" aria-hidden="true" />}
                    </span>
                    {r.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </form>
      <Card icon={ShieldCheck} title="Keeping your account safe" className="xl:col-span-4">
        <ul className="flex flex-col gap-3 text-small text-ink-700">
          {[
            "Use a password you don't use anywhere else.",
            "Never share it, even with the care team. Admins can reset it for you.",
            "Sign out on shared computers from the menu at the top right.",
            "Patient information stays inside Medisense: don't copy it to personal apps.",
          ].map((tip) => (
            <li key={tip} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
              {tip}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
