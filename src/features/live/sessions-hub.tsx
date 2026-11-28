"use client";

import { useEffect } from "react";
import { PageHeader } from "@/components/ui/page";
import { LiveBadge } from "./bits";
import { DocQueue } from "./doc-queue";
import { SessionList } from "./session-list";

/** Sessions and notes is a group in the menu; each part is its own page. */
export type SessionsSection = "sessions" | "notes";

const HEAD: Record<SessionsSection, { title: string; line: string }> = {
  sessions: {
    title: "Sessions",
    line: "Every visit across the team: attendance, delivery and what happens next",
  },
  notes: {
    title: "Clinical notes",
    line: "The clinical note from each visit: what is late, drafted, flagged or awaiting co-sign",
  },
};

/**
 * The office view of every visit (Sessions) or every note (Clinical notes). Telehealth
 * recordings, the third part of the group, has its own page.
 */
export function SessionsHub({ section = "sessions" }: { section?: SessionsSection }) {
  // Old links named a tab (?tab=notes); each part has its own address now.
  useEffect(() => {
    if (section !== "sessions") return;
    const old = new URLSearchParams(window.location.search).get("tab");
    if (old === "notes") window.location.replace("/care/documentation");
    if (old === "recordings") window.location.replace("/telehealth/recordings");
  }, [section]);
  return (
    <>
      <PageHeader
        eyebrow="Sessions and notes"
        title={HEAD[section].title}
        description={HEAD[section].line}
        actions={<LiveBadge />}
      />
      {section === "sessions" ? (
        <SessionList base="/care/sessions" embedded />
      ) : (
        <DocQueue base="/care/documentation" embedded />
      )}
    </>
  );
}
