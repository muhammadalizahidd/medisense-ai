"use client";

import { MessageSquarePlus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, useResource } from "@/lib/live/client";
import type { ChatPersonDto } from "@/lib/live/types";
import { EmptyNote, ErrorNote, Skeleton } from "./bits";

type Group = "all" | ChatPersonDto["group"];
const groups: ChatPersonDto["group"][] = ["Office staff", "Clinicians", "Patients"];

/** The web's New message panel. */
export function NewChatSheet({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (conversationId: string) => void;
}) {
  return (
    <Sheet
      title="New message"
      description="Message anyone in the practice: office staff, clinicians or patients."
      onClose={onClose}
    >
      <PeoplePicker onOpen={onOpen} />
    </Sheet>
  );
}

/** Everyone in the system an admin can message: office staff, clinicians and patients. */
export function PeoplePicker({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const { data, error, reload } = useResource<{ people: ChatPersonDto[] }>(
    "/api/conversations/people",
  );
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const people = useMemo(() => data?.people ?? [], [data]);
  const q = query.trim().toLowerCase();
  const shown = people.filter(
    (p) =>
      (group === "all" || p.group === group) &&
      (!q || `${p.name} ${p.role}`.toLowerCase().includes(q)),
  );
  const count = (g: ChatPersonDto["group"]) => people.filter((p) => p.group === g).length;

  async function start(p: ChatPersonDto) {
    if (p.conversationId) return onOpen(p.conversationId);
    setBusy(p.id);
    try {
      const { id } = await api<{ id: string }>("/api/conversations/direct", {
        body: { userId: p.id },
      });
      onOpen(id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't open the chat.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-10 items-center gap-2 rounded-control border border-border-strong bg-canvas px-3 focus-within:border-accent focus-within:bg-surface focus-within:shadow-focus">
        <Search className="size-4 text-ink-500" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
          placeholder="Search by name or role"
          className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
        />
      </label>
      <Segmented
        label="Who"
        value={group}
        onChange={setGroup}
        options={[
          { id: "all", label: `Everyone${data ? ` (${people.length})` : ""}` },
          ...groups.map((g) => ({ id: g, label: data ? `${g} (${count(g)})` : g })),
        ]}
      />
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !data ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyNote title="Nobody matches.">Try another name or clear the filter.</EmptyNote>
      ) : (
        groups
          .filter((g) => shown.some((p) => p.group === g))
          .map((g) => (
            <section key={g} aria-label={g}>
              <h3 className="mb-1 label-caps text-ink-500">{g}</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
                {shown
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => start(p)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 bg-surface px-3 py-2.5 text-left hover:bg-canvas disabled:cursor-wait",
                          busy === p.id && "bg-accent-tint",
                        )}
                      >
                        <Avatar name={p.name} kind={p.photoKind} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-small font-semibold">{p.name}</span>
                          <span className="block truncate text-caption text-ink-500">{p.role}</span>
                        </span>
                        <span className="flex flex-none items-center gap-1 text-caption font-semibold text-accent">
                          <MessageSquarePlus className="size-4" aria-hidden="true" />
                          {busy === p.id ? "Opening…" : p.conversationId ? "Open chat" : "Message"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
