"use client";

import { ArrowLeft, CalendarOff, Lock, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { engagementStatuses } from "@/lib/live/staff";
import { api, useResource } from "@/lib/live/client";
import { disciplines } from "@/lib/live/catalogue";
import { shortDate } from "@/lib/live/time";
import type { TherapistCardDto, TherapistDetailDto } from "@/lib/live/types";
import { TableFrame } from "@/components/ui/table-frame";
import { Avatar } from "@/components/ui/premium";
import { CaseloadTag, EmptyNote, ErrorNote, LiveBadge, Skeleton, Stars } from "./bits";
import { AddTherapist } from "./add-therapist";
import {
  engagementTone,
  CapacityTab,
  CredentialsTab,
  EligibilityTab,
  StaffActivity,
  StaffDetailsTab,
  StaffIdentity,
  useStaff,
} from "./staff-profile";
import { TherapistRecord } from "./therapist-record";

const day = (iso: string) => shortDate(`${iso}T00:00:00+10:00`);

/** Every therapist with their availability, caseload and rating, kept live. */
export function TherapistDirectory() {
  const { data, error, loading, reload } = useResource<{ therapists: TherapistCardDto[] }>(
    "/api/care/therapists",
    (e) => e.type === "care",
  );
  const [discipline, setDiscipline] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [sort, setSort] = useState("name");
  const [query, setQuery] = useState("");
  const all = data?.therapists ?? [];
  const services = [...new Set(all.flatMap((t) => t.approvedServices))].sort();
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((t) => !discipline || t.discipline === discipline)
    .filter((t) => !status || t.engagement === status)
    .filter((t) => !service || (t.approvedServices.includes(service) && t.blocks.length === 0))
    .filter(
      (t) =>
        !q ||
        `${t.name} ${t.staffId ?? ""} ${t.discipline} ${t.region} ${t.approvedServices.join(" ")}`
          .toLowerCase()
          .includes(q),
    )
    .sort((x, y) =>
      sort === "caseload"
        ? y.activeClients / y.capacity - x.activeClients / x.capacity
        : sort === "expiry"
          ? (x.credentialDays ?? 9999) - (y.credentialDays ?? 9999)
          : x.name.localeCompare(y.name),
    );
  const filtering = Boolean(discipline || status || service);

  return (
    <>
      <PageHeader
        eyebrow="Patient onboarding"
        title="Therapists"
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a CSV download, not a page */}
            <a
              href="/api/care/therapists/export"
              download
              className="inline-flex h-10 items-center gap-2 rounded-control border border-border-strong bg-surface px-4 text-small font-semibold text-ink-900 transition-all hover:-translate-y-px hover:border-accent hover:text-accent hover:no-underline active:scale-95"
              title="Operational columns only. Every export is recorded."
            >
              Export CSV
            </a>
            <AddTherapist onAdded={reload} />
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <span className="mr-1 text-caption font-semibold tracking-wide text-ink-500 uppercase">
          Filter
        </span>
        <div className="w-48 flex-none">
          <Select
            aria-label="Discipline"
            className="h-9"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option value="">Any discipline</option>
            {disciplines.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <div className="w-44 flex-none">
          <Select
            aria-label="Status"
            className="h-9"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Any status</option>
            {engagementStatuses.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <div className="w-60 flex-none">
          <Select
            aria-label="Eligible for service"
            className="h-9"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">Eligible for any service</option>
            {services.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <div className="w-48 flex-none">
          <Select
            aria-label="Sort"
            className="h-9"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Sort: name</option>
            <option value="caseload">Sort: caseload</option>
            <option value="expiry">Sort: credential expiry</option>
          </Select>
        </div>
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setDiscipline("");
              setStatus("");
              setService("");
            }}
            className="h-9 cursor-pointer px-2 text-small font-semibold text-accent"
          >
            Clear filters
          </button>
        )}
        <label className="ml-auto flex h-9 w-72 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search therapists"
            placeholder="Name, staff ID, discipline or service"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
      </div>
      <TableFrame>
        {error && !data ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Skeleton className="h-64" />
        ) : rows.length === 0 ? (
          <EmptyNote title="No therapists match.">Try another filter or search.</EmptyNote>
        ) : (
          <table className="table-stack w-full text-left text-small md:min-w-240">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Therapist</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Works</th>
                <th className="px-4 py-3 font-medium">Approved services</th>
                <th className="px-4 py-3 font-medium">Credentials</th>
                <th className="px-4 py-3 font-medium">Caseload</th>
                <th className="px-4 py-3 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={t.name} size={40} kind="staff" src={t.photoUrl} />
                      <span className="min-w-0">
                        <Link
                          href={`/care/therapists/${t.id}`}
                          className="font-semibold text-ink-900"
                        >
                          {t.name}
                        </Link>
                        <span className="block text-caption whitespace-nowrap text-ink-500">
                          {t.staffId && <span className="font-mono">{t.staffId} · </span>}
                          {t.discipline}
                        </span>
                        <span className="block text-caption text-ink-500">{t.region}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col items-start gap-1">
                      <Tag
                        tone={
                          engagementTone[t.engagement as keyof typeof engagementTone] ?? "neutral"
                        }
                      >
                        {t.engagement}
                      </Tag>
                      {t.blocks.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-caption text-over"
                          title={t.blocks.join(" · ")}
                        >
                          <Lock className="size-3" aria-hidden="true" /> No new patients
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="max-w-56 px-4 py-3 text-caption text-ink-700">
                    {t.availability.pattern}
                    {t.availability.away.map((a) => (
                      <span
                        key={`${a.from}-${a.to}`}
                        className="mt-0.5 flex items-center gap-1.5 text-caption"
                      >
                        <CalendarOff className="size-3.5 text-watch" aria-hidden="true" />
                        {day(a.from)}
                        {a.to !== a.from && `–${day(a.to)}`} · {a.reason}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-small font-semibold text-ink-900">
                      {t.approvedServices.length}
                    </span>
                    <span
                      className="block max-w-56 truncate text-caption text-ink-500"
                      title={t.approvedServices.join(", ")}
                    >
                      {t.approvedServices.join(", ") || "None approved"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.credentialDays === null ? (
                      <span className="text-ink-500">None</span>
                    ) : t.credentialDays < 0 ? (
                      <Tag tone="over">Expired</Tag>
                    ) : t.credentialDays <= 30 ? (
                      <Tag tone="watch">{t.credentialDays} days left</Tag>
                    ) : (
                      <Tag tone="healthy">Current</Tag>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      {t.activeClients}/{t.capacity}
                      <CaseloadTag status={t.status} />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.rating ? (
                      <span className="flex items-center gap-1.5">
                        <Stars value={t.rating.average} />
                        <span className="text-caption text-ink-500">
                          {t.rating.average.toFixed(1)} ({t.rating.count})
                        </span>
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-ink-500">None yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
    </>
  );
}

export function TherapistProfilePage({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource<{ therapist: TherapistDetailDto }>(
    `/api/care/therapists/${id}`,
    (e) => e.type === "care",
  );
  const staff = useStaff(id, reload);
  const s = staff.data?.staff;
  const tabs = [
    { id: "overview", label: "Overview" },
    {
      id: "credentials",
      label: "Credentials",
      count: s?.credentials.filter((c) => c.status !== "Verified").length,
      alert: true,
    },
    {
      id: "eligibility",
      label: "Service eligibility",
      count: s?.competencies.filter((c) => c.status === "Approved").length,
    },
    { id: "capacity", label: "Capacity and coverage" },
    { id: "details", label: "Staff profile" },
    { id: "activity", label: "Activity" },
  ] as const;
  const [tab, setTab] = useTab(tabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const t = data.therapist;
  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care/therapists" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Therapists
          </ButtonLink>
        }
        title="Staff record"
        description={`${t.discipline} · ${t.availability.pattern}`}
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <ResetPassword therapistId={t.id} name={t.name} />
          </div>
        }
      />
      {s ? (
        <StaffIdentity s={s} busy={staff.busy} act={staff.act} />
      ) : staff.error ? (
        <ErrorNote message={staff.error} onRetry={staff.reload} />
      ) : (
        <Skeleton className="mb-6 h-56" />
      )}
      <Tabs label="Staff record" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="overview" value={tab}>
        <TherapistRecord t={t} patientLinks />
      </TabPanel>
      {s && (
        <>
          <TabPanel id="credentials" value={tab}>
            <CredentialsTab s={s} busy={staff.busy} act={staff.act} />
          </TabPanel>
          <TabPanel id="eligibility" value={tab}>
            <EligibilityTab s={s} busy={staff.busy} act={staff.act} />
          </TabPanel>
          <TabPanel id="capacity" value={tab}>
            <CapacityTab s={s} busy={staff.busy} act={staff.act} />
          </TabPanel>
          <TabPanel id="details" value={tab}>
            <StaffDetailsTab s={s} busy={staff.busy} act={staff.act} />
          </TabPanel>
          <TabPanel id="activity" value={tab}>
            <StaffActivity s={s} />
          </TabPanel>
        </>
      )}
    </>
  );
}

/** Sets a one-off password the admin passes on in person or by phone. Shown once. */
function ResetPassword({ therapistId, name }: { therapistId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [temporary, setTemporary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = name.split(" ")[0];

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ temporaryPassword: string }>(
        `/api/care/therapists/${therapistId}/reset-password`,
        { method: "POST" },
      );
      setTemporary(result.temporaryPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setOpen(false);
    setTemporary(null);
    setError(null);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Reset password
      </Button>
      {open && (
        <Sheet
          title={`Reset ${first}'s password`}
          description="For when a therapist can't sign in."
          onClose={close}
          footer={
            temporary ? (
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="primary" disabled={busy} onClick={reset}>
                  {busy ? "Resetting…" : "Reset password"}
                </Button>
                <Button onClick={close}>Cancel</Button>
              </>
            )
          }
        >
          {temporary ? (
            <div className="flex flex-col gap-3">
              <p className="text-small text-ink-700">
                Give {first} this temporary password in person or by phone. It&apos;s shown only
                once. Ask them to change it in My profile after signing in.
              </p>
              <p className="rounded-control border border-border bg-canvas px-4 py-3 font-mono text-h2 tracking-wider break-all">
                {temporary}
              </p>
            </div>
          ) : (
            <ul className="list-disc pl-5 text-small text-ink-700">
              <li>{first}&apos;s current password stops working straight away.</li>
              <li>They&apos;re signed out on every device.</li>
              <li>You&apos;ll see a temporary password once, to pass on to them.</li>
            </ul>
          )}
          {error && (
            <p role="alert" className="mt-3 text-small text-over">
              {error}
            </p>
          )}
        </Sheet>
      )}
    </>
  );
}
