"use client";

import {
  Archive,
  BarChart3,
  Copy,
  Download,
  Eye,
  Pencil,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import type { ViewDto } from "@/lib/live/report-dto";
import {
  blankSpec,
  builderCategories,
  categories,
  reportById,
  rowLimits,
  runSpec,
  specErrors,
  type BuilderCategory,
  type BuilderSpec,
} from "@/lib/live/report-catalogue";
import { formatValue, timeGrains } from "@/lib/live/reports";
import { Card, ExportSheet, SaveViewSheet, td, th, type Ctx } from "./reports-bits";

const chip = (on: boolean, disabled = false) =>
  cn(
    "h-8 cursor-pointer rounded-control border px-2.5 text-caption",
    on
      ? "border-accent bg-accent-tint font-semibold text-accent"
      : "border-border-strong text-ink-700",
    disabled && "cursor-not-allowed opacity-50",
  );

export function BuilderTab({
  c,
  initial,
  openView,
}: {
  c: Ctx;
  initial: ViewDto | null;
  openView: (v: ViewDto) => void;
}) {
  const cats = builderCategories.filter((x) => c.hub.scope.domains.includes(x));
  const start =
    initial?.spec ??
    blankSpec(cats.includes("Scheduling") ? "Scheduling" : (cats[0] ?? "Referrals"));
  const [saved, setSaved] = useState<BuilderSpec>(start);
  const [spec, setSpec] = useState<BuilderSpec>(start);
  const [preview, setPreview] = useState<ReturnType<typeof runSpec> | null>(null);
  const [previewAt, setPreviewAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cat = categories[spec.category];
  const errors = specErrors(spec, c.hub.scope);
  const detailOk = c.hub.scope.detail.includes(spec.category);
  const p = (x: Partial<BuilderSpec>) => {
    setSpec((cur) => ({ ...cur, ...x }));
    setPreview(null);
  };
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const sortable =
    spec.view === "Detail"
      ? cat.columns.filter((x) => spec.columns.includes(x.key))
      : [
          ...spec.dimensions.map((d) => ({
            key: d,
            label: cat.dims.find((x) => x.key === d)?.label ?? d,
          })),
          ...spec.measures.map((m) => ({
            key: m,
            label: cat.measures.find((x) => x.key === m)?.label ?? m,
          })),
        ];
  const run = () => {
    if (errors.length) return;
    setPreview(runSpec(spec, c.facts, c.f, c.names));
    setPreviewAt(
      new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Brisbane",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    );
  };
  const units = [
    ...new Set(spec.measures.map((m) => cat.measures.find((x) => x.key === m)?.unit)),
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card
          title="Report builder"
          sub={
            initial
              ? `Editing a copy of "${initial.name}"`
              : "Choose a domain first, then measures and groupings"
          }
          icon={BarChart3}
        >
          <div className="flex flex-col gap-4">
            <Field label="Report category">
              <Select
                value={spec.category}
                onChange={(e) => {
                  const next = blankSpec(e.target.value as BuilderCategory);
                  setSpec({ ...next, name: spec.name, description: spec.description });
                  setPreview(null);
                }}
              >
                {cats.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Measures (at least one)">
              <div className="flex flex-wrap gap-1.5">
                {cat.measures.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={spec.measures.includes(m.key)}
                    onClick={() => p({ measures: toggle(spec.measures, m.key) })}
                    className={chip(spec.measures.includes(m.key))}
                  >
                    {m.label} <span className="text-ink-500">({m.unit})</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Group by (up to two)">
              <div className="flex flex-wrap gap-1.5">
                {cat.dims.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={spec.dimensions.includes(d.key)}
                    onClick={() => p({ dimensions: toggle(spec.dimensions, d.key) })}
                    className={chip(spec.dimensions.includes(d.key))}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time grain">
                <Select
                  value={spec.grain}
                  onChange={(e) => p({ grain: e.target.value as BuilderSpec["grain"] })}
                >
                  <option value="">No time series</option>
                  {timeGrains.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Time basis" hint="Declared in the report notes">
                <Select value={spec.basis} onChange={(e) => p({ basis: e.target.value })}>
                  {cat.bases.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label={`${spec.category} status`}
              hint="Only statuses for this domain are offered"
            >
              <div className="flex flex-wrap gap-1.5">
                {cat.statuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={spec.statuses.includes(s)}
                    onClick={() => p({ statuses: toggle(spec.statuses, s) })}
                    className={chip(spec.statuses.includes(s))}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <Field
              label="Data view"
              hint={detailOk ? undefined : "Detail is off: your role has aggregate access here"}
            >
              <div className="flex gap-1.5">
                {(["Aggregate", "Detail"] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    disabled={x === "Detail" && !detailOk}
                    aria-pressed={spec.view === x}
                    onClick={() => p({ view: x })}
                    className={chip(spec.view === x, x === "Detail" && !detailOk)}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </Field>
            {spec.view === "Detail" && (
              <Field label="Columns" hint="Required ID columns stay so each row can be opened">
                <div className="flex flex-wrap gap-1.5">
                  {cat.columns.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      disabled={col.required}
                      aria-pressed={spec.columns.includes(col.key)}
                      onClick={() => p({ columns: toggle(spec.columns, col.key) })}
                      className={chip(spec.columns.includes(col.key), col.required)}
                    >
                      {col.label}
                      {col.required ? " · required" : ""}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sort by">
                <Select
                  value={spec.sort.key}
                  onChange={(e) => p({ sort: { ...spec.sort, key: e.target.value } })}
                >
                  <option value="">Default</option>
                  {sortable.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Order">
                <Select
                  value={spec.sort.dir}
                  onChange={(e) =>
                    p({ sort: { ...spec.sort, dir: e.target.value as "asc" | "desc" } })
                  }
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </Select>
              </Field>
              <Field label="Row limit">
                <Select
                  value={String(spec.limit)}
                  onChange={(e) => p({ limit: Number(e.target.value) })}
                >
                  {rowLimits.map((n) => (
                    <option key={n} value={String(n)}>
                      {n === 500 ? "All permitted (500)" : n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Report name" hint="3 to 80 characters">
              <input
                className={inputClass}
                value={spec.name}
                maxLength={80}
                onChange={(e) => p({ name: e.target.value })}
              />
            </Field>
            <Field label="Description (optional)" hint={`${spec.description.length}/500`}>
              <textarea
                className={cn(inputClass, "h-16 py-2")}
                maxLength={500}
                value={spec.description}
                onChange={(e) => p({ description: e.target.value })}
              />
            </Field>
            {errors.length > 0 && (
              <ul
                role="alert"
                className="rounded-control border border-over bg-over-bg p-3 text-caption text-over"
              >
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={run} disabled={errors.length > 0}>
                <Eye className="size-4" aria-hidden="true" /> Preview
              </Button>
              <Button
                variant="secondary"
                disabled={errors.length > 0 || spec.name.trim().length < 3}
                onClick={() => setSaving(true)}
              >
                <Save className="size-4" aria-hidden="true" /> Save view
              </Button>
              <Button
                variant="secondary"
                disabled={errors.length > 0}
                onClick={() => setExporting(true)}
              >
                <Download className="size-4" aria-hidden="true" /> Export
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSpec(saved);
                  setPreview(null);
                }}
              >
                <Undo2 className="size-4" aria-hidden="true" /> Reset
              </Button>
            </div>
            {errors.length > 0 && (
              <p className="text-caption text-ink-500">
                Preview is blocked until the problems above are fixed.
              </p>
            )}
          </div>
        </Card>
        <Card
          title="Preview"
          sub={
            preview
              ? `Generated ${previewAt} · ${preview.total} rows · unit: ${units.join(", ")} · basis: ${cat.bases.find((b) => b.key === spec.basis)?.label} · global filters applied`
              : "Run Preview to see the result"
          }
          icon={Eye}
          flush
        >
          {!preview ? (
            <p className="p-6 text-small text-ink-500">
              The preview uses the filters at the top of the page and only records your role can
              see.
            </p>
          ) : !preview.rows.length ? (
            <p className="p-6 text-small text-ink-700">
              No matching records. Change the filters or measures; no sample rows are added.
            </p>
          ) : (
            <div className="max-h-[640px] overflow-auto">
              {preview.total > preview.rows.length && (
                <p className="bg-watch-bg px-4 py-2 text-caption text-watch">
                  Showing the first {preview.rows.length} of {preview.total} rows (row limit).
                </p>
              )}
              <table className="w-full">
                <thead className="sticky top-0 bg-sunken">
                  <tr>
                    {preview.columns.map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          th,
                          ["number", "money", "pct"].includes(col.kind) && "text-right",
                        )}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {preview.columns.map((col) => {
                        const v = r[col.key];
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              td,
                              ["number", "money", "pct"].includes(col.kind) &&
                                "text-right tabular-nums",
                            )}
                          >
                            {v === null || v === undefined
                              ? "N/A"
                              : col.kind === "money" && typeof v === "number"
                                ? formatValue(v, "AUD")
                                : col.kind === "pct" && typeof v === "number"
                                  ? `${v}%`
                                  : col.key === "therapistId"
                                    ? (c.names.get(String(v)) ?? String(v))
                                    : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <SavedViews c={c} openView={openView} />
      {saving && (
        <SaveViewSheet
          c={c}
          reportId={null}
          spec={spec}
          onClose={() => {
            setSaving(false);
            setSaved(spec);
          }}
        />
      )}
      {exporting && (
        <ExportSheet c={c} reportId={null} spec={spec} onClose={() => setExporting(false)} />
      )}
    </div>
  );
}

function SavedViews({ c, openView }: { c: Ctx; openView: (v: ViewDto) => void }) {
  const [rename, setRename] = useState<{ v: ViewDto; mode: "rename" | "clone" } | null>(null);
  const [name, setName] = useState("");
  const act = async (v: ViewDto, body: Record<string, unknown>, ok: string) => {
    try {
      await api(`/api/care/reports/views/${v.id}`, { body });
      toast(ok, { tone: "success" });
      c.reload();
    } catch (e) {
      toast("Couldn't do that", { tone: "error", detail: e instanceof Error ? e.message : "" });
    }
  };
  return (
    <Card
      title="Saved views"
      sub="Private views are visible to their owner only; team views to the owner's team; organisation views to everyone with access to that report"
      icon={Save}
      flush
    >
      {!c.hub.views.length ? (
        <p className="p-4 text-small text-ink-500">No saved views yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-sunken">
              <tr>
                {["View", "Report", "Owner", "Shared with", "Status", "Updated", ""].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.hub.views.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className={td}>
                    <span className="font-semibold">{v.name}</span>
                    {v.description && (
                      <span className="block text-caption text-ink-500">{v.description}</span>
                    )}
                    <span className="block text-caption text-ink-500">v{v.version}</span>
                  </td>
                  <td className={td}>
                    {v.reportId
                      ? `${v.reportId} ${reportById.get(v.reportId)?.title ?? ""}`
                      : `Custom · ${v.spec?.category}`}
                  </td>
                  <td className={td}>{v.mine ? "You" : v.owner}</td>
                  <td className={td}>
                    <Tag tone="outline">
                      {v.scope === "Team" ? `Team: ${v.team ?? "—"}` : v.scope}
                    </Tag>
                  </td>
                  <td className={td}>
                    <Tag tone={v.status === "Active" ? "healthy" : "neutral"}>{v.status}</Tag>
                  </td>
                  <td className={cn(td, "text-caption text-ink-500")}>
                    {new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
                      new Date(v.updatedAt),
                    )}
                  </td>
                  <td className={cn(td, "text-right")}>
                    <div className="flex justify-end gap-1">
                      {v.status === "Active" && (
                        <Button size="sm" variant="secondary" onClick={() => openView(v)}>
                          Open
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRename({ v, mode: "clone" });
                          setName(`${v.name} (copy)`);
                        }}
                      >
                        <Copy className="size-3.5" aria-hidden="true" /> Clone
                      </Button>
                      {v.mine && v.status === "Active" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRename({ v, mode: "rename" });
                              setName(v.name);
                            }}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" /> Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => act(v, { type: "archive" }, "View archived")}
                          >
                            <Archive className="size-3.5" aria-hidden="true" /> Archive
                          </Button>
                        </>
                      )}
                      {v.mine && v.status === "Archived" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(v, { type: "restore" }, "View restored")}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" /> Restore
                        </Button>
                      )}
                      {v.status === "Archived" && (
                        <span className="self-center text-caption text-ink-500">
                          Read-only until restored or cloned
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rename && (
        <Sheet
          title={rename.mode === "clone" ? "Clone view" : "Rename view"}
          description={
            rename.mode === "clone" ? "The copy is private to you until you share it." : undefined
          }
          onClose={() => setRename(null)}
          footer={
            <Button
              variant="primary"
              disabled={name.trim().length < 3}
              onClick={async () => {
                await act(
                  rename.v,
                  { type: rename.mode, name },
                  rename.mode === "clone" ? "View cloned" : "View renamed",
                );
                setRename(null);
              }}
            >
              {rename.mode === "clone" ? "Clone" : "Rename"}
            </Button>
          }
        >
          <Field label="Name" hint="3 to 80 characters">
            <input
              className={inputClass}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </Sheet>
      )}
    </Card>
  );
}
