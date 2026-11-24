# Reports redesign: plan

Status: built, except the guided three-step builder (the builder opens as-is in a dialog). Surface: `/care/reports`. Mode: operate. Someone who has never used a reporting tool should be able to see how the organisation is doing in ten seconds, open the detail they want, and download it, without learning the module first.

## 1. What is wrong today

From the code (`reports-hub.tsx`, `reports-analytics.tsx`, `reports-admin.tsx`):

- **Twelve tabs in one strip**, mixing three different jobs: areas to read (referrals, participants, capacity, visits, clinical, finance, telehealth, automation), tools to make things (builder, schedules) and records of what was made (exports and audit).
- **A filter bar and a scope line sit above every tab**, so the first thing a person sees is controls, not answers.
- **Each area tab stacks everything on one page**: a grid of KPIs, two charts, then two to four full tables. The answer to "how are referrals going?" is buried in the scroll.
- **The home tab is a menu of cards plus a catalogue**, not a picture of the organisation.
- **Jargon leaks**: report ids and measure codes appear in the interface.

## 2. Principles

1. **Answers first, detail on request.** A tab shows a summary. Everything else opens in a dialog.
2. **No more screens.** Going deeper never changes the page. It opens a large closable dialog, the same one used in Roles & permissions, with a second dialog on top for a single record.
3. **One way to download.** A **Download** button on every summary and every dialog, with plain choices.
4. **Plain words.** No report ids or measure codes in the interface. "What does this mean?" explains a number in one sentence.
5. **Nothing is lost.** Every report, measure, filter, suppression rule and permission scope that exists today stays; only where it appears changes.

## 3. The new structure

```
Reports and analytics                      [ This quarter ▾ ] [ Compare ▾ ] [ Filters ] [ Download ▾ ] [ ⋯ ]
Overview · Referrals · Patients · Clinicians · Visits · Clinical · Finance · Automation
─────────────────────────────────────────────────────────────────────────────────────────────
OVERVIEW
 ┌ Referrals ┐ ┌ Patients ┐ ┌ Visits ┐ ┌ Capacity ┐ ┌ Revenue ┐ ┌ Needs attention ┐   six headline numbers
 │ 128  ▲12% │ │ 293 ▲ 3% │ │ 1,402 │ │ 82%      │ │ $214k    │ │ 7                │
 └───────────┘ └──────────┘ └───────┘ └──────────┘ └──────────┘ └──────────────────┘
 Activity over time (one chart, switch measure)          │ Needs attention (top five, each opens its area)
 Area cards: two or three numbers + a sparkline + "Open"  │ Recent downloads · Scheduled reports status
```

### Overview (the default page)

- **Six headline tiles**, one per major area the person may read, each with its number, comparison and a one-line meaning. A tile is a button to its tab.
- **One activity chart** with a measure switch (referrals, visits, revenue).
- **Needs attention**: the top five insights, each opening the area and the record.
- **Area cards** that mirror the tabs: two or three numbers and a sparkline, then **Open**.
- **Recent downloads** and **scheduled reports** as two small lists, each with a link that opens its dialog.

### Tabs: one clean summary each

Every area tab uses the same template, so nothing has to be relearned:

1. A **title and one-sentence takeaway**, written from the data ("Referrals are up 12% on last quarter; 9 are waiting on information").
2. **At most four tiles**, the measures that matter most for that area.
3. **One primary chart**, plus one short ranked list (top five, with "See all").
4. A footer with **Open the full report** and **Download**.

Tab count: **eight area tabs and Overview**, down from twelve. The three tools move out of the tab strip:

| Today | Becomes |
|---|---|
| Builder | **Create a report** button in the header, opens a guided dialog |
| Scheduled reports | **Schedules** in the header menu and on Overview, opens a dialog |
| Exports and audit | **Downloads** in the header menu and on Overview, opens a dialog |
| Telehealth | Folded into **Visits** as a section. It still honours its own permission, so someone without it never sees it. |
| Participants / Capacity | Shown as **Patients** / **Clinicians** |

### The full-report dialog

Opens from a tab's **Open the full report** or a tile.

- Large, centred, closable, with an unsaved-changes prompt where it matters. Same shell as the role dialog.
- Header: area name, period, who can see it. A segmented control chooses between the reports in that area, so the area's old stack of tables becomes one table at a time.
- Toolbar: search, area filters, column picker, **Download** (CSV, Excel, PDF).
- Table: sticky header, sortable, plain column names, small-number suppression and "N/A, with reason" exactly as today.
- Row click opens a **record dialog** above it, with the existing drill-through content and a link to the real record.
- Aggregate-only roles see the summary tables and no row-level detail, as the scope rules already decide.

### Create a report (the builder, made gentle)

A three-step dialog: **What do you want to know?** (area and measure, in plain sentences), **How should it be grouped?** (by therapist, month, funding, with the existing rules turned into messages like "Rates can't be shown with counts"), **Preview and save**. Save, schedule and download are the last step.

### Filters

One compact bar: period and comparison in the header, everything else behind **Filters**, shown afterwards as removable chips. The chips make it obvious that a number is filtered. The scope line moves into the header's **⋯** menu as "What can I see?".

### Downloading

One **Download** button, one small dialog: **What** (this summary, the full data, or a chosen report), **Format** (CSV, Excel, PDF), **Period** (as shown). The file keeps today's header block (report, author, filters, freshness) and the formula-safe CSV fix. Download history lives in the Downloads dialog.

## 4. Visual design

- Calm, flat, tokens only. Cards are `bg-surface` with a hairline border and no shadow at rest; hover lift only where a card is a button.
- Numbers in the display face at 24px or more, never bold; labels in sans. Comparison shows an arrow, the change and the word ("up", "down"), never colour alone.
- **One accent colour for the primary series**, neutral greys for comparison. Semantic colours only for status (healthy, watch, at risk).
- At most **two charts per tab**, each with a plain title that states what it shows. Sparklines for context on Overview.
- Every empty, loading and "N/A" state explains itself in one sentence and offers one action.
- Phone: tiles stack two across, charts full width, dialogs full height, tables become cards.

## 5. How to build it

The data layer does not change: `ReportsHubDto`, `useReportCtx`, the report and metric catalogue, scopes, suppression and exports stay as they are and keep their tests. This is a presentation refactor.

| Phase | Work | Files |
|---|---|---|
| 1. Shell | New header (period, compare, filters, Download, menu); eight-tab strip; filter chips | `reports-hub.tsx`, `reports-bits.tsx` |
| 2. Overview | Headline tiles, activity chart, needs attention, area cards, recent lists | new `reports-overview.tsx` (replaces `HomeTab`) |
| 3. Area template | One summary component driven by a small config per area (tiles, chart, ranked list) | new `reports-summary.tsx`, `reports-areas.ts` |
| 4. Full-report dialog | Dialog with report switcher, toolbar, table, record dialog | new `reports-dialog.tsx`; reuses `ReportTable`, `DrillSheet` |
| 5. Tools as dialogs | Create a report, Schedules, Downloads, About these numbers | `reports-builder.tsx`, `reports-admin.tsx` split into dialogs |
| 6. Download dialog | One plain dialog over the existing export code | `ExportSheet` rewrite |
| 7. Clean-up and verify | Remove the old tabs and stacked layouts; check 1440, 1024, 768, 390; keyboard and focus; each role's scope | |

## 6. Risks and how they are handled

- **Permissions**: areas and tabs still appear only for domains the person can read; Visits shows if either Scheduling or Telehealth is readable, and hides the telehealth section otherwise.
- **Aggregate-only roles**: the full-report dialog shows summaries and hides record rows and detail downloads.
- **No loss of reports**: a test lists every report in the catalogue and checks it is reachable from exactly one area dialog.
- **Large tables**: paginate or virtualise at 500 rows; downloads always carry the full data.

## 7. Decisions to confirm

1. **Eight tabs plus Overview** with the three tools moved to header buttons. The alternative is to keep all twelve tabs.
2. **Merge Telehealth into Visits.** The alternative is to keep it as its own tab.
3. **Plain names** (Patients, Clinicians, Visits) in place of the current labels.
