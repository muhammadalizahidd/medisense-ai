"use client";

import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { useSession } from "@/lib/live/client";
import { canOpenPage, pageAccessFor } from "@/lib/permissions/pages";
import { LiveBadge } from "./bits";
import { DocQueue } from "./doc-queue";
import { RecordingsPage } from "./recordings-page";
import { SessionList } from "./session-list";

const tabs = [
  { id: "sessions", label: "Sessions" },
  { id: "notes", label: "Notes" },
  { id: "recordings", label: "Recordings" },
] as const;

/**
 * Every visit and the note that comes out of it, in one place for the office: the sessions with
 * attendance and delivery, and the notes with what is late, drafted by AI, flagged or awaiting
 * co-sign. Each note belongs to a session, so they share one page instead of two.
 */
export function SessionsHub() {
  const { user } = useSession();
  const recordings = canOpenPage(
    "/telehealth/recordings",
    user?.role === "admin" ? pageAccessFor(user) : null,
  );
  const shown = tabs.filter((t) => t.id !== "recordings" || recordings);
  const [chosen, setTab] = useTab(tabs);
  const tab = shown.some((t) => t.id === chosen) ? chosen : "sessions";
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Sessions and notes"
        description="Every visit across the team and the clinical note that comes out of it"
        actions={<LiveBadge />}
      />
      <Tabs label="Sessions and notes" tabs={shown} value={tab} onChange={setTab} />
      <TabPanel id="sessions" value={tab}>
        <SessionList base="/care/sessions" embedded />
      </TabPanel>
      <TabPanel id="notes" value={tab}>
        <DocQueue base="/care/documentation" embedded />
      </TabPanel>
      {recordings && (
        <TabPanel id="recordings" value={tab}>
          <RecordingsPage embedded />
        </TabPanel>
      )}
    </>
  );
}
