import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, pgEnum, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "expired"]);
export const channelStatusEnum = pgEnum("channel_status", ["PENDING", "ACTIVE", "PAUSED"]);
export const authStatusEnum = pgEnum("auth_status", ["PENDING", "AUTHORIZED"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"]);
export const durationTypeEnum = pgEnum("duration_type", ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"]);
export const offlinePaymentStatusEnum = pgEnum("offline_payment_status", ["PENDING", "APPROVED", "REJECTED"]);
export const jobTypeEnum = pgEnum("job_type", ["SINGLE", "BULK"]);
export const jobStatusEnum = pgEnum("job_status", ["QUEUED", "PENDING", "SENT", "DELIVERED", "READ", "FAILED", "PARTIAL"]);
export const messageStatusEnum = pgEnum("message_status", ["QUEUED", "PENDING", "SENT", "DELIVERED", "READ", "FAILED", "REPLIED"]);
export const balanceTransactionTypeEnum = pgEnum("balance_transaction_type", ["topup", "allocate", "refund", "sync", "adjustment"]);
export const channelDaysSourceEnum = pgEnum("channel_days_source", ["ADMIN_MANUAL", "PAYPAL", "OFFLINE", "MIGRATION"]);

// Users table
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  daysBalance: integer("days_balance").notNull().default(0), // DEPRECATED: Use channel_days_ledger instead
  status: userStatusEnum("status").notNull().default("active"),
  whapiToken: text("whapi_token"), // Per-user WHAPI token if needed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  subscriptions: many(subscriptions),
  channels: many(channels),
  templates: many(templates),
  jobs: many(jobs),
  workflows: many(workflows),
  offlinePayments: many(offlinePayments),
  auditLogs: many(auditLogs),
}));

// Plans table
export const plans = pgTable("plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  price: integer("price").notNull(), // Price in cents
  currency: text("currency").notNull().default("USD"),
  durationDays: integer("duration_days").notNull(), // 30, 180, or 365
  channelsLimit: integer("channels_limit").notNull(),
  dailyMessagesLimit: integer("daily_messages_limit").notNull(),
  bulkMessagesLimit: integer("bulk_messages_limit").notNull(),
  features: jsonb("features").notNull().default([]), // Array of feature strings
  paypalPlanId: text("paypal_plan_id"), // Optional PayPal plan ID
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
  offlinePayments: many(offlinePayments),
}));

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  status: subscriptionStatusEnum("status").notNull().default("PENDING"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  durationType: durationTypeEnum("duration_type").notNull(),
  provider: text("provider").notNull().default("DIRECT"), // DIRECT, PAYPAL, OFFLINE
  transactionId: text("transaction_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

// Offline Payments table
export const offlinePayments = pgTable("offline_payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  amount: integer("amount").notNull(), // Amount in cents
  currency: text("currency").notNull().default("USD"),
  reference: text("reference"),
  proofUrl: text("proof_url"),
  status: offlinePaymentStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const offlinePaymentsRelations = relations(offlinePayments, ({ one }) => ({
  user: one(users, {
    fields: [offlinePayments.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [offlinePayments.planId],
    references: [plans.id],
  }),
}));

// Channels table
export const channels = pgTable("channels", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  phone: text("phone").notNull(),
  status: channelStatusEnum("status").notNull().default("PENDING"), // Channel activation status (pending = not extended yet)
  authStatus: authStatusEnum("auth_status").notNull().default("PENDING"), // WhatsApp QR authorization status
  whapiChannelId: text("whapi_channel_id"), // WHAPI channel ID (from WHAPI response.id)
  whapiChannelToken: text("whapi_channel_token"), // Token for channel-specific operations (QR, messages)
  whapiStatus: text("whapi_status"), // WHAPI channel status from API response
  stopped: boolean("stopped").default(false), // WHAPI channel stopped status
  creationTS: timestamp("creation_ts"), // WHAPI channel creation timestamp
  activeTill: timestamp("active_till"), // WHAPI channel active until timestamp
  activeFrom: timestamp("active_from"), // When channel was activated/extended
  expiresAt: timestamp("expires_at"), // When channel expires (activeFrom + days * 24h)
  daysRemaining: integer("days_remaining").notNull().default(0), // Calculated from ledger entries
  lastExtendedAt: timestamp("last_extended_at"), // Last time days were added
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const channelsRelations = relations(channels, ({ one, many }) => ({
  user: one(users, {
    fields: [channels.userId],
    references: [users.id],
  }),
  jobs: many(jobs),
  daysLedger: many(channelDaysLedger),
}));

// Templates table
export const templates = pgTable("templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  header: text("header"),
  body: text("body").notNull(),
  footer: text("footer"),
  buttons: text("buttons").array().notNull().default([]), // Array of button texts
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const templatesRelations = relations(templates, ({ one }) => ({
  user: one(users, {
    fields: [templates.userId],
    references: [users.id],
  }),
}));

// Jobs table
export const jobs = pgTable("jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
  type: jobTypeEnum("type").notNull(),
  status: jobStatusEnum("status").notNull().default("QUEUED"),
  total: integer("total").notNull().default(0),
  queued: integer("queued").notNull().default(0),
  pending: integer("pending").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  delivered: integer("delivered").notNull().default(0),
  read: integer("read").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  replied: integer("replied").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  user: one(users, {
    fields: [jobs.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [jobs.channelId],
    references: [channels.id],
  }),
  messages: many(messages),
}));

// Messages table
export const messages = pgTable("messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  to: text("to").notNull(), // Phone number in E.164 format
  name: text("name"),
  email: text("email"),
  body: text("body").notNull(),
  header: text("header"),
  footer: text("footer"),
  buttons: jsonb("buttons").notNull().default([]), // Array of button objects: [{ type, title, id }]
  providerMessageId: text("provider_message_id"), // WHAPI message ID from response
  status: messageStatusEnum("status").notNull().default("QUEUED"),
  lastReply: text("last_reply"), // Text content of last reply received
  lastReplyAt: timestamp("last_reply_at"),
  sentAt: timestamp("sent_at"), // When message was sent to WHAPI
  deliveredAt: timestamp("delivered_at"), // When message was delivered to recipient
  readAt: timestamp("read_at"), // When message was read by recipient
  repliedAt: timestamp("replied_at"), // When recipient replied
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  providerMessageIdIdx: uniqueIndex("messages_provider_message_id_idx").on(table.providerMessageId),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  job: one(jobs, {
    fields: [messages.jobId],
    references: [jobs.id],
  }),
}));

// Workflows table (for Chatbot)
export const workflows = pgTable("workflows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  definitionJson: jsonb("definition_json").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowsRelations = relations(workflows, ({ one }) => ({
  user: one(users, {
    fields: [workflows.userId],
    references: [users.id],
  }),
}));

// Audit Logs table
export const auditLogs = pgTable("audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  meta: jsonb("meta").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Settings table for global app configuration
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  value: text("value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Balance Transactions table (admin main balance pool)
export const balanceTransactions = pgTable("balance_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: balanceTransactionTypeEnum("type").notNull(),
  days: integer("days").notNull(), // Positive integer
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Channel Days Ledger table (per-channel days allocations)
export const channelDaysLedger = pgTable("channel_days_ledger", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  days: integer("days").notNull(), // Number of days added
  source: channelDaysSourceEnum("source").notNull(), // Where the days came from
  balanceTransactionId: integer("balance_transaction_id").references(() => balanceTransactions.id, { onDelete: "set null" }),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  offlinePaymentId: integer("offline_payment_id").references(() => offlinePayments.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").default({}), // Additional info (admin user, notes, etc.)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const balanceTransactionsRelations = relations(balanceTransactions, ({ one }) => ({
  channel: one(channels, {
    fields: [balanceTransactions.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [balanceTransactions.userId],
    references: [users.id],
  }),
}));

export const channelDaysLedgerRelations = relations(channelDaysLedger, ({ one }) => ({
  channel: one(channels, {
    fields: [channelDaysLedger.channelId],
    references: [channels.id],
  }),
  balanceTransaction: one(balanceTransactions, {
    fields: [channelDaysLedger.balanceTransactionId],
    references: [balanceTransactions.id],
  }),
  subscription: one(subscriptions, {
    fields: [channelDaysLedger.subscriptionId],
    references: [subscriptions.id],
  }),
  offlinePayment: one(offlinePayments, {
    fields: [channelDaysLedger.offlinePaymentId],
    references: [offlinePayments.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email(),
  name: z.string().min(1),
  passwordHash: z.string().min(6),
});

export const insertPlanSchema = createInsertSchema(plans);

export const insertSubscriptionSchema = createInsertSchema(subscriptions);

export const insertOfflinePaymentSchema = createInsertSchema(offlinePayments);

export const insertChannelSchema = createInsertSchema(channels, {
  label: z.string().min(1),
  phone: z.string().min(1),
});

export const insertTemplateSchema = createInsertSchema(templates, {
  title: z.string().min(1),
  body: z.string().min(1),
});

export const insertJobSchema = createInsertSchema(jobs);

export const insertMessageSchema = createInsertSchema(messages, {
  to: z.string().min(1),
  body: z.string().min(1),
});

export const insertWorkflowSchema = createInsertSchema(workflows, {
  name: z.string().min(1),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs);

export const insertSettingSchema = createInsertSchema(settings, {
  key: z.string().min(1),
});

export const insertBalanceTransactionSchema = createInsertSchema(balanceTransactions, {
  days: z.number().int().positive(),
  note: z.string().min(1),
});

export const insertChannelDaysLedgerSchema = createInsertSchema(channelDaysLedger, {
  days: z.number().int().positive(),
});

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type OfflinePayment = typeof offlinePayments.$inferSelect;
export type InsertOfflinePayment = z.infer<typeof insertOfflinePaymentSchema>;
export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type BalanceTransaction = typeof balanceTransactions.$inferSelect;
export type InsertBalanceTransaction = z.infer<typeof insertBalanceTransactionSchema>;
export type ChannelDaysLedger = typeof channelDaysLedger.$inferSelect;
export type InsertChannelDaysLedger = z.infer<typeof insertChannelDaysLedgerSchema>;
