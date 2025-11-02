import { db } from "./db";
import { eq, and, desc, sql, like } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User,
  InsertUser,
  Plan,
  InsertPlan,
  Subscription,
  InsertSubscription,
  Channel,
  InsertChannel,
  Template,
  InsertTemplate,
  Job,
  InsertJob,
  Message,
  InsertMessage,
  Workflow,
  InsertWorkflow,
  OfflinePayment,
  InsertOfflinePayment,
  AuditLog,
  InsertAuditLog,
  Setting,
  InsertSetting,
  ChannelDaysLedger,
  InsertChannelDaysLedger,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<InsertUser, "passwordHash"> & { passwordHash: string }): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Plans
  getPlans(): Promise<Plan[]>;
  getPlan(id: number): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<Plan>): Promise<Plan | undefined>;

  // Subscriptions
  getActiveSubscriptionForUser(userId: number): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription | undefined>;

  // Channels
  getChannelsForUser(userId: number): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: number, data: Partial<Channel>): Promise<Channel | undefined>;
  deleteChannel(id: number): Promise<void>;

  // Templates
  getTemplatesForUser(userId: number): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: number, data: Partial<Template>): Promise<Template | undefined>;
  deleteTemplate(id: number): Promise<void>;

  // Jobs
  getJobsForUser(userId: number): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, data: Partial<Job>): Promise<Job | undefined>;

  // Messages
  getMessagesForJob(jobId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, data: Partial<Message>): Promise<Message | undefined>;

  // Workflows
  getWorkflowsForUser(userId: number): Promise<Workflow[]>;
  getWorkflow(id: number): Promise<Workflow | undefined>;
  createWorkflow(workflow: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow | undefined>;
  deleteWorkflow(id: number): Promise<void>;

  // Offline Payments
  getOfflinePayments(status?: string): Promise<OfflinePayment[]>;
  getOfflinePayment(id: number): Promise<OfflinePayment | undefined>;
  createOfflinePayment(payment: InsertOfflinePayment): Promise<OfflinePayment>;
  updateOfflinePayment(id: number, data: Partial<OfflinePayment>): Promise<OfflinePayment | undefined>;

  // Plan Requests
  getPlanRequests(status?: string): Promise<schema.PlanRequest[]>;
  getPlanRequest(id: number): Promise<schema.PlanRequest | undefined>;
  createPlanRequest(request: schema.InsertPlanRequest): Promise<schema.PlanRequest>;
  updatePlanRequest(id: number, data: Partial<schema.PlanRequest>): Promise<schema.PlanRequest | undefined>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string | null): Promise<Setting>;
  getSettingsByPrefix(prefix: string): Promise<Setting[]>;
  
  // Balance Transactions
  createBalanceTransaction(transaction: Omit<schema.InsertBalanceTransaction, "createdAt">): Promise<schema.BalanceTransaction>;
  getBalanceTransactions(limit?: number): Promise<schema.BalanceTransaction[]>;
  getBalanceTransaction(id: number): Promise<schema.BalanceTransaction | null>;
  deleteBalanceTransaction(id: number): Promise<void>;
  getMainDaysBalance(): Promise<number>;
  updateMainDaysBalance(change: number): Promise<number>;

  // Channel Days Ledger
  addDaysToChannel(params: {
    channelId: number;
    days: number;
    source: "ADMIN_MANUAL" | "PAYPAL" | "OFFLINE" | "MIGRATION";
    balanceTransactionId?: number;
    subscriptionId?: number;
    offlinePaymentId?: number;
    metadata?: any;
  }): Promise<{ ledgerEntry: ChannelDaysLedger; updatedChannel: Channel }>;
  getChannelDaysLedger(channelId: number): Promise<ChannelDaysLedger[]>;
  calculateChannelDaysRemaining(channelId: number): Promise<number>;

  // Bulk Logs
  createBulkLog(log: schema.InsertBulkLog): Promise<schema.BulkLog>;
  getBulkLogs(filters?: {
    userId?: number;
    jobId?: number;
    level?: string;
    category?: string;
    limit?: number;
  }): Promise<schema.BulkLog[]>;

  // Terms & Conditions
  getActiveTermsDocuments(): Promise<schema.TermsDocument[]>;
  getTermsDocument(id: number): Promise<schema.TermsDocument | undefined>;
  getTermsDocumentByType(type: string): Promise<schema.TermsDocument | undefined>;
  createTermsDocument(document: schema.InsertTermsDocument): Promise<schema.TermsDocument>;
  updateTermsDocument(id: number, data: Partial<schema.TermsDocument>): Promise<schema.TermsDocument | undefined>;
  setActiveTermsDocument(id: number): Promise<schema.TermsDocument | undefined>;

  // Webhook Events (for idempotency)
  getWebhookEvent(provider: string, eventId: string): Promise<schema.WebhookEvent | undefined>;
  createWebhookEvent(event: schema.InsertWebhookEvent): Promise<schema.WebhookEvent>;
  markWebhookProcessed(id: number, error?: string): Promise<schema.WebhookEvent | undefined>;

  // Ledger
  createLedgerEntry(entry: schema.InsertLedger): Promise<schema.Ledger>;
  getLedgerEntries(userId?: number, limit?: number): Promise<schema.Ledger[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: Omit<InsertUser, "passwordHash"> & { passwordHash: string }): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  }

  // Plans
  async getPlans(): Promise<Plan[]> {
    return await db.select().from(schema.plans).orderBy(schema.plans.price);
  }

  async getPlan(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
    return plan || undefined;
  }

  async createPlan(insertPlan: InsertPlan): Promise<Plan> {
    const [plan] = await db.insert(schema.plans).values(insertPlan).returning();
    return plan;
  }

  async updatePlan(id: number, data: Partial<Plan>): Promise<Plan | undefined> {
    const [plan] = await db
      .update(schema.plans)
      .set(data)
      .where(eq(schema.plans.id, id))
      .returning();
    return plan;
  }

  // Subscriptions
  async getActiveSubscriptionForUser(userId: number): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, "ACTIVE")))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    return subscription || undefined;
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db.insert(schema.subscriptions).values(insertSubscription).returning();
    return subscription;
  }

  async updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription | undefined> {
    const [subscription] = await db
      .update(schema.subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, id))
      .returning();
    return subscription || undefined;
  }

  // Channels
  async getChannelsForUser(userId: number): Promise<Channel[]> {
    return await db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.userId, userId))
      .orderBy(desc(schema.channels.createdAt));
  }

  async getChannel(id: number): Promise<Channel | undefined> {
    const [channel] = await db.select().from(schema.channels).where(eq(schema.channels.id, id));
    return channel || undefined;
  }

  async createChannel(insertChannel: InsertChannel): Promise<Channel> {
    const [channel] = await db.insert(schema.channels).values(insertChannel).returning();
    return channel;
  }

  async updateChannel(id: number, data: Partial<Channel>): Promise<Channel | undefined> {
    const [channel] = await db
      .update(schema.channels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.channels.id, id))
      .returning();
    return channel || undefined;
  }

  async deleteChannel(id: number): Promise<void> {
    await db.delete(schema.channels).where(eq(schema.channels.id, id));
  }

  // Templates
  async getTemplatesForUser(userId: number): Promise<Template[]> {
    return await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.userId, userId))
      .orderBy(desc(schema.templates.createdAt));
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    const [template] = await db.select().from(schema.templates).where(eq(schema.templates.id, id));
    return template || undefined;
  }

  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(schema.templates).values(insertTemplate).returning();
    return template;
  }

  async updateTemplate(id: number, data: Partial<Template>): Promise<Template | undefined> {
    const [template] = await db
      .update(schema.templates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.templates.id, id))
      .returning();
    return template || undefined;
  }

  async deleteTemplate(id: number): Promise<void> {
    await db.delete(schema.templates).where(eq(schema.templates.id, id));
  }

  // Jobs
  async getJobsForUser(userId: number): Promise<Job[]> {
    return await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.userId, userId))
      .orderBy(desc(schema.jobs.createdAt));
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    return job || undefined;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(schema.jobs).values(insertJob).returning();
    return job;
  }

  async updateJob(id: number, data: Partial<Job>): Promise<Job | undefined> {
    const [job] = await db
      .update(schema.jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .returning();
    return job || undefined;
  }

  // Messages
  async getMessagesForJob(jobId: number): Promise<Message[]> {
    return await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.jobId, jobId))
      .orderBy(desc(schema.messages.createdAt));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(schema.messages).values(insertMessage).returning();
    return message;
  }

  async updateMessage(id: number, data: Partial<Message>): Promise<Message | undefined> {
    const [message] = await db
      .update(schema.messages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.messages.id, id))
      .returning();
    return message || undefined;
  }

  // Workflows
  async getWorkflowsForUser(userId: number): Promise<Workflow[]> {
    return await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.userId, userId))
      .orderBy(desc(schema.workflows.createdAt));
  }

  async getWorkflow(id: number): Promise<Workflow | undefined> {
    const [workflow] = await db.select().from(schema.workflows).where(eq(schema.workflows.id, id));
    return workflow || undefined;
  }

  async createWorkflow(insertWorkflow: InsertWorkflow): Promise<Workflow> {
    const [workflow] = await db.insert(schema.workflows).values(insertWorkflow).returning();
    return workflow;
  }

  async updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow | undefined> {
    const [workflow] = await db
      .update(schema.workflows)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.workflows.id, id))
      .returning();
    return workflow || undefined;
  }

  async deleteWorkflow(id: number): Promise<void> {
    await db.delete(schema.workflows).where(eq(schema.workflows.id, id));
  }

  // Offline Payments
  async getOfflinePayments(status?: string): Promise<OfflinePayment[]> {
    if (status) {
      return await db
        .select()
        .from(schema.offlinePayments)
        .where(eq(schema.offlinePayments.status, status as any))
        .orderBy(desc(schema.offlinePayments.createdAt));
    }
    return await db.select().from(schema.offlinePayments).orderBy(desc(schema.offlinePayments.createdAt));
  }

  async getOfflinePayment(id: number): Promise<OfflinePayment | undefined> {
    const [payment] = await db.select().from(schema.offlinePayments).where(eq(schema.offlinePayments.id, id));
    return payment || undefined;
  }

  async createOfflinePayment(insertPayment: InsertOfflinePayment): Promise<OfflinePayment> {
    const [payment] = await db.insert(schema.offlinePayments).values(insertPayment).returning();
    return payment;
  }

  async updateOfflinePayment(id: number, data: Partial<OfflinePayment>): Promise<OfflinePayment | undefined> {
    const [payment] = await db
      .update(schema.offlinePayments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.offlinePayments.id, id))
      .returning();
    return payment || undefined;
  }

  // Plan Requests
  async getPlanRequests(status?: string): Promise<schema.PlanRequest[]> {
    if (status) {
      return await db
        .select()
        .from(schema.planRequests)
        .where(eq(schema.planRequests.status, status as any))
        .orderBy(desc(schema.planRequests.createdAt));
    }
    return await db.select().from(schema.planRequests).orderBy(desc(schema.planRequests.createdAt));
  }

  async getPlanRequest(id: number): Promise<schema.PlanRequest | undefined> {
    const [request] = await db.select().from(schema.planRequests).where(eq(schema.planRequests.id, id));
    return request || undefined;
  }

  async createPlanRequest(insertRequest: schema.InsertPlanRequest): Promise<schema.PlanRequest> {
    const [request] = await db.insert(schema.planRequests).values(insertRequest).returning();
    return request;
  }

  async updatePlanRequest(id: number, data: Partial<schema.PlanRequest>): Promise<schema.PlanRequest | undefined> {
    const [request] = await db
      .update(schema.planRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.planRequests.id, id))
      .returning();
    return request || undefined;
  }

  // Audit Logs
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(schema.auditLogs).values(insertLog).returning();
    return log;
  }

  // Settings
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    return setting || undefined;
  }

  async setSetting(key: string, value: string | null): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db
        .update(schema.settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.settings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.settings).values({ key, value }).returning();
      return created;
    }
  }

  async getSettingsByPrefix(prefix: string): Promise<Setting[]> {
    return await db
      .select()
      .from(schema.settings)
      .where(like(schema.settings.key, `${prefix}%`));
  }

  // Balance Transactions
  async createBalanceTransaction(
    insertTransaction: Omit<schema.InsertBalanceTransaction, "createdAt">
  ): Promise<schema.BalanceTransaction> {
    const [transaction] = await db
      .insert(schema.balanceTransactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async getBalanceTransactions(limit?: number): Promise<schema.BalanceTransaction[]> {
    const query = db
      .select()
      .from(schema.balanceTransactions)
      .orderBy(desc(schema.balanceTransactions.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getBalanceTransaction(id: number): Promise<schema.BalanceTransaction | null> {
    const [transaction] = await db
      .select()
      .from(schema.balanceTransactions)
      .where(eq(schema.balanceTransactions.id, id));
    return transaction || null;
  }

  async deleteBalanceTransaction(id: number): Promise<void> {
    await db.delete(schema.balanceTransactions).where(eq(schema.balanceTransactions.id, id));
  }

  async getMainDaysBalance(): Promise<number> {
    const setting = await this.getSetting("main_days_balance");
    return setting ? parseInt(setting.value || "0") : 0;
  }

  async updateMainDaysBalance(change: number): Promise<number> {
    const currentBalance = await this.getMainDaysBalance();
    const newBalance = currentBalance + change;
    
    // Prevent negative balance
    if (newBalance < 0) {
      throw new Error(`Insufficient main balance. Current: ${currentBalance}, Requested change: ${change}`);
    }
    
    await this.setSetting("main_days_balance", newBalance.toString());
    return newBalance;
  }

  // Channel Days Ledger
  async addDaysToChannel(params: {
    channelId: number;
    days: number;
    source: "ADMIN_MANUAL" | "PAYPAL" | "OFFLINE" | "MIGRATION";
    balanceTransactionId?: number;
    subscriptionId?: number;
    offlinePaymentId?: number;
    metadata?: any;
  }): Promise<{ ledgerEntry: ChannelDaysLedger; updatedChannel: Channel }> {
    const channel = await this.getChannel(params.channelId);
    if (!channel) {
      throw new Error(`Channel ${params.channelId} not found`);
    }

    // Create ledger entry
    const [ledgerEntry] = await db
      .insert(schema.channelDaysLedger)
      .values({
        channelId: params.channelId,
        days: params.days,
        source: params.source,
        balanceTransactionId: params.balanceTransactionId,
        subscriptionId: params.subscriptionId,
        offlinePaymentId: params.offlinePaymentId,
        metadata: params.metadata || {},
      })
      .returning();

    // Calculate new expiration date
    const now = new Date();
    let newExpiresAt: Date;
    let newActiveFrom: Date | null = channel.activeFrom;
    let newStatus: "PENDING" | "ACTIVE" | "PAUSED" = channel.status;

    if (channel.status === "PENDING" || !channel.expiresAt) {
      // First activation
      newActiveFrom = now;
      newExpiresAt = new Date(now.getTime() + params.days * 24 * 60 * 60 * 1000);
      newStatus = "ACTIVE";
    } else {
      // Extending existing channel
      const currentExpiry = new Date(channel.expiresAt);
      if (currentExpiry > now) {
        // Add to existing expiry
        newExpiresAt = new Date(currentExpiry.getTime() + params.days * 24 * 60 * 60 * 1000);
      } else {
        // Expired, start fresh from now
        newActiveFrom = now;
        newExpiresAt = new Date(now.getTime() + params.days * 24 * 60 * 60 * 1000);
        newStatus = "ACTIVE";
      }
    }

    // Calculate remaining days
    const daysRemaining = Math.max(0, Math.ceil((newExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    // Update channel
    const [updatedChannel] = await db
      .update(schema.channels)
      .set({
        status: newStatus,
        activeFrom: newActiveFrom,
        expiresAt: newExpiresAt,
        daysRemaining,
        lastExtendedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.channels.id, params.channelId))
      .returning();

    return { ledgerEntry, updatedChannel };
  }

  async getChannelDaysLedger(channelId: number): Promise<ChannelDaysLedger[]> {
    return await db
      .select()
      .from(schema.channelDaysLedger)
      .where(eq(schema.channelDaysLedger.channelId, channelId))
      .orderBy(desc(schema.channelDaysLedger.createdAt));
  }

  async calculateChannelDaysRemaining(channelId: number): Promise<number> {
    const channel = await this.getChannel(channelId);
    if (!channel || !channel.expiresAt) {
      return 0;
    }

    const now = new Date();
    const expiresAt = new Date(channel.expiresAt);
    
    if (expiresAt <= now) {
      return 0;
    }

    return Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  // Bulk Logs
  async createBulkLog(log: schema.InsertBulkLog): Promise<schema.BulkLog> {
    const [newLog] = await db.insert(schema.bulkLogs).values(log).returning();
    return newLog;
  }

  async getBulkLogs(filters?: {
    userId?: number;
    jobId?: number;
    level?: string;
    category?: string;
    limit?: number;
  }): Promise<schema.BulkLog[]> {
    let query = db.select().from(schema.bulkLogs);

    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(schema.bulkLogs.userId, filters.userId));
    }
    if (filters?.jobId) {
      conditions.push(eq(schema.bulkLogs.jobId, filters.jobId));
    }
    if (filters?.level) {
      conditions.push(eq(schema.bulkLogs.level, filters.level as any));
    }
    if (filters?.category) {
      conditions.push(eq(schema.bulkLogs.category, filters.category as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    query = query.orderBy(desc(schema.bulkLogs.createdAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    return await query;
  }

  // Terms & Conditions
  async getActiveTermsDocuments(): Promise<schema.TermsDocument[]> {
    return await db
      .select()
      .from(schema.termsDocuments)
      .where(eq(schema.termsDocuments.isActive, true))
      .orderBy(schema.termsDocuments.type);
  }

  async getTermsDocument(id: number): Promise<schema.TermsDocument | undefined> {
    const [doc] = await db
      .select()
      .from(schema.termsDocuments)
      .where(eq(schema.termsDocuments.id, id));
    return doc || undefined;
  }

  async getTermsDocumentByType(type: string): Promise<schema.TermsDocument | undefined> {
    const [doc] = await db
      .select()
      .from(schema.termsDocuments)
      .where(and(
        eq(schema.termsDocuments.type, type),
        eq(schema.termsDocuments.isActive, true)
      ))
      .orderBy(desc(schema.termsDocuments.createdAt))
      .limit(1);
    return doc || undefined;
  }

  async createTermsDocument(document: schema.InsertTermsDocument): Promise<schema.TermsDocument> {
    const [doc] = await db.insert(schema.termsDocuments).values(document).returning();
    return doc;
  }

  async updateTermsDocument(id: number, data: Partial<schema.TermsDocument>): Promise<schema.TermsDocument | undefined> {
    const [doc] = await db
      .update(schema.termsDocuments)
      .set(data)
      .where(eq(schema.termsDocuments.id, id))
      .returning();
    return doc || undefined;
  }

  async setActiveTermsDocument(id: number): Promise<schema.TermsDocument | undefined> {
    const doc = await this.getTermsDocument(id);
    if (!doc) {
      return undefined;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.termsDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.termsDocuments.type, doc.type));

      await tx
        .update(schema.termsDocuments)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(schema.termsDocuments.id, id));
    });

    return await this.getTermsDocument(id);
  }

  // Webhook Events
  async getWebhookEvent(provider: string, eventId: string): Promise<schema.WebhookEvent | undefined> {
    const [event] = await db
      .select()
      .from(schema.webhookEvents)
      .where(and(
        eq(schema.webhookEvents.provider, provider),
        eq(schema.webhookEvents.eventId, eventId)
      ));
    return event || undefined;
  }

  async createWebhookEvent(event: schema.InsertWebhookEvent): Promise<schema.WebhookEvent> {
    const [newEvent] = await db.insert(schema.webhookEvents).values(event).returning();
    return newEvent;
  }

  async markWebhookProcessed(id: number, error?: string): Promise<schema.WebhookEvent | undefined> {
    const [event] = await db
      .update(schema.webhookEvents)
      .set({
        processed: true,
        processedAt: new Date(),
        error: error || null,
      })
      .where(eq(schema.webhookEvents.id, id))
      .returning();
    return event || undefined;
  }

  // Ledger
  async createLedgerEntry(entry: schema.InsertLedger): Promise<schema.Ledger> {
    const [ledgerEntry] = await db.insert(schema.ledger).values(entry).returning();
    return ledgerEntry;
  }

  async getLedgerEntries(userId?: number, limit: number = 100): Promise<schema.Ledger[]> {
    let query = db.select().from(schema.ledger);
    
    if (userId) {
      query = query.where(eq(schema.ledger.userId, userId)) as any;
    }
    
    query = query.orderBy(desc(schema.ledger.createdAt)).limit(limit) as any;
    
    return await query;
  }
}

export const storage = new DatabaseStorage();
