import type { AgreementDto } from "@/lib/live/funding";
import {
  BulletList,
  Callout,
  DataTable,
  Doc,
  DocPage,
  MetaGrid,
  Section,
  SignatureBlock,
  StatTiles,
  TitleBlock,
  type TableColumn,
} from "../components";

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Brisbane",
  }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+10:00` : iso));

const columns: TableColumn[] = [
  { key: "support", label: "Support", align: "left", flex: 2 },
  { key: "scope", label: "What it covers", align: "left", flex: 3 },
  { key: "amount", label: "Amount", align: "left", flex: 1.4 },
  { key: "estimate", label: "Estimate", align: "right", flex: 1 },
];

/** A service agreement as a PDF: the parties, the supports and prices, the terms, and signatures. */
export function AgreementDocument({ a }: { a: AgreementDto }) {
  const accepted = a.acceptance;
  const rows = a.lines.map((l) => ({
    support: l.support,
    scope: l.scope || "—",
    amount: `${l.quantity} ${l.unit} · ${l.frequency} · ${aud(l.unitPrice)}`,
    estimate: aud(l.estimate),
  }));
  return (
    <Doc title={`Service agreement ${a.ref}`} author="Medisense">
      <DocPage kind="Service agreement" footer={`${a.ref} · Version ${a.version} · Confidential`}>
        <TitleBlock
          title={`Service agreement ${a.ref}`}
          subtitle={`${a.participant} · Version ${a.version} · ${a.status}`}
        />
        {a.status !== "Signed" && (
          <Callout tone="watch" title="Not signed yet">
            This agreement does not take effect until the signatory accepts it.
          </Callout>
        )}
        <StatTiles
          tiles={[
            { label: "Total estimate", value: aud(a.total) },
            { label: "Starts", value: day(a.start) },
            { label: "Ends", value: day(a.end) },
          ]}
        />
        <Section title="The parties">
          <MetaGrid
            items={[
              ["Provider", a.provider],
              ["Participant", a.participant],
              ["Type", a.type],
              ["Funding plan", a.planRef ?? "—"],
              ["Signatory", a.signatory.name],
              ["Authority", a.signatory.authority],
            ]}
          />
        </Section>
        <Section title="Supports and prices">
          <DataTable columns={columns} rows={rows} />
        </Section>
        <Section title="Cancellations">
          <Callout title="Cancellation terms">{a.cancellation}</Callout>
        </Section>
        {a.rights.length > 0 && (
          <Section title="Your rights">
            <BulletList items={a.rights} />
          </Section>
        )}
        <Section title="How we keep in touch">
          <BulletList
            items={[...a.communication, ...(a.communicationNote ? [a.communicationNote] : [])]}
          />
        </Section>
        {a.sharing ? (
          <Section title="Sharing information">
            <Callout title="Who sees your information">{a.sharing}</Callout>
          </Section>
        ) : null}
        <Section title="Agreement">
          {accepted ? (
            <Callout title={`Accepted by ${accepted.name}`}>
              {`${accepted.role} · ${day(accepted.at)} · ${accepted.method} · version ${accepted.version}`}
            </Callout>
          ) : (
            <SignatureBlock
              people={[
                { name: a.signatory.name, role: a.signatory.authority },
                { name: a.provider, role: "Provider" },
              ]}
            />
          )}
        </Section>
      </DocPage>
    </Doc>
  );
}
