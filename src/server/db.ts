import "server-only";
import { MongoClient, type Db } from "mongodb";
import type {
  AppointmentDoc,
  AssessmentDoc,
  AssignmentDoc,
  AuditDoc,
  ClientDoc,
  ConversationDoc,
  DirectChatDoc,
  DocumentDoc,
  EventDoc,
  InvoiceDoc,
  MessageDoc,
  NotificationDoc,
  PlanDoc,
  ReferralDoc,
  SessionDoc,
  TelehealthDoc,
  FundingPlanDoc,
  PayerDoc,
  PayRateDoc,
  PriceItemDoc,
  AgreementDoc,
  FundingAckDoc,
  BillableDoc,
  ClaimDoc,
  PaymentDoc,
  StatementLineDoc,
  AdjustmentDoc,
  PlatformDoc,
  RoleDoc,
  TherapistDoc,
  UserDoc,
  OpsApprovalDoc,
  OpsMessageDoc,
  OpsReviewDoc,
  ReportExportDoc,
  ReportInsightDoc,
  ReportScheduleDoc,
  ReportViewDoc,
  OpsRuleDoc,
  OpsRunDoc,
  OpsTaskDoc,
} from "./models";
import { migrate } from "./migrate";
import { seedIfEmpty } from "./seed";

const DATABASE = process.env.MONGODB_DB ?? "Medisense";

type Cache = { client: MongoClient; ready: Promise<Db> };
const globalCache = globalThis as unknown as { __medisenseMongo?: Cache };

/** Thrown when the database can't be used, so routes can answer with a clear 503. */
export class DatabaseUnavailable extends Error {}

function connectionString() {
  const value = process.env.CONNECTION_STRING ?? process.env.MONGODB_URI;
  if (!value) throw new DatabaseUnavailable("No database connection string is set.");
  return value;
}

async function prepare(client: MongoClient) {
  await client.connect();
  const db = client.db(DATABASE);
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("roles").createIndex({ slug: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("therapists").createIndex({ slug: 1 }, { unique: true }),
    db.collection("therapists").createIndex({ discipline: 1, region: 1 }),
    db.collection("clients").createIndex({ createdAt: -1 }),
    db.collection("assignments").createIndex({ therapistId: 1, status: 1 }),
    db.collection("assignments").createIndex({ clientId: 1 }),
    db
      .collection("appointments")
      .createIndex(
        { therapistId: 1, start: 1 },
        { unique: true, partialFilterExpression: { holdsSlot: true } },
      ),
    db.collection("appointments").createIndex({ clientId: 1, start: 1 }),
    db.collection("notifications").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("conversations").createIndex({ memberIds: 1 }),
    db.collection("conversations").createIndex({ clientId: 1, therapistId: 1 }, { unique: true }),
    db.collection("messages").createIndex({ conversationId: 1, createdAt: 1 }),
    db.collection("directChats").createIndex({ pairKey: 1 }, { unique: true }),
    db.collection("directChats").createIndex({ memberIds: 1 }),
    db.collection("events").createIndex({ createdAt: 1 }, { expireAfterSeconds: 86_400 }),
    db.collection("audit").createIndex({ clientId: 1, at: -1 }),
    db.collection("audit").createIndex({ referralId: 1, at: -1 }),
    db.collection("referrals").createIndex({ reference: 1 }, { unique: true }),
    db.collection("referrals").createIndex({ trackingHash: 1 }, { unique: true }),
    db.collection("referrals").createIndex({ status: 1, createdAt: -1 }),
    db.collection("documents").createIndex({ referralId: 1 }),
    db.collection("documents").createIndex({ clientId: 1 }),
    db.collection("assessments").createIndex({ clientId: 1, needId: 1, createdAt: -1 }),
    db.collection("plans").createIndex({ clientId: 1, needId: 1, createdAt: -1 }),
    db.collection("invoices").createIndex({ number: 1 }, { unique: true }),
    db.collection("invoices").createIndex({ clientId: 1, status: 1 }),
    db.collection("telehealth").createIndex({ appointmentId: 1 }, { unique: true }),
    db.collection("telehealth").createIndex({ tokenHash: 1 }),
    db.collection("fundingPlans").createIndex({ clientId: 1, start: -1 }),
    db.collection("fundingPlans").createIndex({ referralId: 1 }),
    db.collection("agreements").createIndex({ clientId: 1, createdAt: -1 }),
    db.collection("agreements").createIndex({ "link.hash": 1 }),
    db.collection("billables").createIndex({ sourceKey: 1 }),
    db.collection("billables").createIndex({ clientId: 1, start: -1 }),
    db.collection("payments").createIndex({ reference: 1 }),
    db.collection("billables").createIndex({ appointmentId: 1 }),
    db.collection("appointments").createIndex({ therapistId: 1, start: -1, status: 1 }),
    db.collection("payRates").createIndex({ therapistId: 1, seq: 1 }, { unique: true }),
    db.collection("payRates").createIndex({ therapistId: 1, effectiveFrom: -1 }),
    db
      .collection("opsTasks")
      .createIndex(
        { idemKey: 1 },
        { unique: true, partialFilterExpression: { idemKey: { $type: "string" } } },
      ),
    db.collection("opsTasks").createIndex({ status: 1, dueAt: 1 }),
    db.collection("opsRules").createIndex({ code: 1 }, { unique: true }),
    db.collection("opsRuns").createIndex({ at: -1 }),
    db.collection("opsRuns").createIndex({ key: 1 }),
    db.collection("opsApprovals").createIndex({ key: 1 }),
    db.collection("opsMessages").createIndex({ key: 1 }),
    db.collection("opsReviews").createIndex({ referralId: 1 }, { unique: true }),
    db.collection("reportExports").createIndex({ idemKey: 1, generatedAt: -1 }),
    db.collection("reportViews").createIndex({ ownerId: 1, name: 1 }),
  ]);
  await seedIfEmpty(db);
  await migrate(db);
  return db;
}

export async function getDb(): Promise<Db> {
  if (!globalCache.__medisenseMongo) {
    const client = new MongoClient(connectionString(), {
      appName: "medisense",
      serverSelectionTimeoutMS: 10_000,
    });
    const ready = prepare(client).catch((error: unknown) => {
      globalCache.__medisenseMongo = undefined;
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new DatabaseUnavailable(`Database connection failed: ${reason}`);
    });
    globalCache.__medisenseMongo = { client, ready };
  }
  return globalCache.__medisenseMongo.ready;
}

/** Typed collections, so every query is checked against the models. */
export async function collections() {
  const db = await getDb();
  return {
    db,
    users: db.collection<UserDoc>("users"),
    roles: db.collection<RoleDoc>("roles"),
    platform: db.collection<PlatformDoc>("platform"),
    sessions: db.collection<SessionDoc>("sessions"),
    therapists: db.collection<TherapistDoc>("therapists"),
    clients: db.collection<ClientDoc>("clients"),
    assignments: db.collection<AssignmentDoc>("assignments"),
    appointments: db.collection<AppointmentDoc>("appointments"),
    notifications: db.collection<NotificationDoc>("notifications"),
    conversations: db.collection<ConversationDoc>("conversations"),
    messages: db.collection<MessageDoc>("messages"),
    directChats: db.collection<DirectChatDoc>("directChats"),
    events: db.collection<EventDoc>("events"),
    audit: db.collection<AuditDoc>("audit"),
    referrals: db.collection<ReferralDoc>("referrals"),
    documents: db.collection<DocumentDoc>("documents"),
    assessments: db.collection<AssessmentDoc>("assessments"),
    plans: db.collection<PlanDoc>("plans"),
    invoices: db.collection<InvoiceDoc>("invoices"),
    telehealth: db.collection<TelehealthDoc>("telehealth"),
    fundingPlans: db.collection<FundingPlanDoc>("fundingPlans"),
    payers: db.collection<PayerDoc>("payers"),
    payRates: db.collection<PayRateDoc>("payRates"),
    priceItems: db.collection<PriceItemDoc>("priceItems"),
    agreements: db.collection<AgreementDoc>("agreements"),
    fundingAcks: db.collection<FundingAckDoc>("fundingAcks"),
    readinessReviews: db.collection<FundingAckDoc>("readinessReviews"),
    billables: db.collection<BillableDoc>("billables"),
    claims: db.collection<ClaimDoc>("claims"),
    payments: db.collection<PaymentDoc>("payments"),
    statement: db.collection<StatementLineDoc>("statementLines"),
    adjustments: db.collection<AdjustmentDoc>("adjustments"),
    opsTasks: db.collection<OpsTaskDoc>("opsTasks"),
    opsRules: db.collection<OpsRuleDoc>("opsRules"),
    opsRuns: db.collection<OpsRunDoc>("opsRuns"),
    opsApprovals: db.collection<OpsApprovalDoc>("opsApprovals"),
    opsMessages: db.collection<OpsMessageDoc>("opsMessages"),
    opsReviews: db.collection<OpsReviewDoc>("opsReviews"),
    reportViews: db.collection<ReportViewDoc>("reportViews"),
    reportSchedules: db.collection<ReportScheduleDoc>("reportSchedules"),
    reportExports: db.collection<ReportExportDoc>("reportExports"),
    reportInsights: db.collection<ReportInsightDoc>("reportInsights"),
  };
}
