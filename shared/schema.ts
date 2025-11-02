import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, pgEnum, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "expired", "banned"]);
export const channelStatusEnum = pgEnum("channel_status", ["PENDING", "ACTIVE", "PAUSED"]);
export const authStatusEnum = pgEnum("auth_status", ["PENDING", "AUTHORIZED"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED", "PENDING_OFFLINE", "REJECTED_OFFLINE"]);
export const durationTypeEnum = pgEnum("duration_type", ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"]);
export const billingPeriodEnum = pgEnum("billing_period", ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"]);
export const requestTypeEnum = pgEnum("request_type", ["PAID", "REQUEST_QUOTE", "BOOK_DEMO"]);
export const offlinePaymentStatusEnum = pgEnum("offline_payment_status", ["PENDING", "APPROVED", "REJECTED"]);
export const jobTypeEnum = pgEnum("job_type", ["SINGLE", "BULK"]);
export const jobStatusEnum = pgEnum("job_status", ["QUEUED", "PROCESSING", "PENDING", "SENT", "DELIVERED", "READ", "FAILED", "PARTIAL", "COMPLETED"]);
export const messageStatusEnum = pgEnum("message_status", ["QUEUED", "PENDING", "SENT", "DELIVERED", "READ", "FAILED", "REPLIED"]);
export const balanceTransactionTypeEnum = pgEnum("balance_transaction_type", ["topup", "allocate", "refund", "sync", "adjustment"]);
export const channelDaysSourceEnum = pgEnum("channel_days_source", ["ADMIN_MANUAL", "PAYPAL", "OFFLINE", "MIGRATION"]);
export const workflowExecutionStatusEnum = pgEnum("workflow_execution_status", ["SUCCESS", "ERROR"]);
export const incomingMessageTypeEnum = pgEnum("incoming_message_type", ["text", "button_reply", "other"]);
export const lastReplyTypeEnum = pgEnum("last_reply_type", ["text", "buttons_reply", "list_reply", "other"]);
export const planRequestStatusEnum = pgEnum("plan_request_status", ["PENDING", "REVIEWED", "CONTACTED", "CONVERTED", "REJECTED"]);
export const bulkLogLevelEnum = pgEnum("bulk_log_level", ["info", "warn", "error"]);
export const bulkLogCategoryEnum = pgEnum("bulk_log_category", ["send", "webhook", "status", "reply", "error"]);
export const planTypeEnum = pgEnum("plan_type", ["PUBLIC", "CUSTOM"]);
export const couponStatusEnum = pgEnum("coupon_status", ["ACTIVE", "EXPIRED", "DISABLED"]);
export const ledgerTransactionTypeEnum = pgEnum("ledger_transaction_type", ["PAYMENT_IN", "PAYMENT_IN_OFFLINE", "DAYS_GRANTED", "DAYS_REFUND", "ADJUSTMENT"]);

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
  bulkWebhookToken: text("bulk_webhook_token").notNull().default(sql`gen_random_uuid()::text`),
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
  type: planTypeEnum("type").notNull().default("PUBLIC"), // PUBLIC or CUSTOM
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  price: integer("price"), // Price in cents, nullable for Quote/Demo/Custom
  billingPeriod: billingPeriodEnum("billing_period").notNull().default("MONTHLY"),
  requestType: requestTypeEnum("request_type").notNull().default("PAID"),
  paypalPlanId: text("paypal_plan_id"), // Optional PayPal plan ID for subscriptions
  daysGranted: integer("days_granted").notNull().default(30), // Days to add on subscription
  paymentMethods: jsonb("payment_methods").notNull().default(["paypal", "offline"]), // ["paypal", "offline", "both"]
  published: boolean("published").notNull().default(false), // Visible to authenticated users
  publishedOnHomepage: boolean("published_on_homepage").notNull().default(false), // Visible on landing page
  sortOrder: integer("sort_order").notNull().default(0),
  // Limits (-1 = unlimited)
  dailyMessagesLimit: integer("daily_messages_limit").notNull().default(-1),
  bulkMessagesLimit: integer("bulk_messages_limit").notNull().default(-1),
  channelsLimit: integer("channels_limit").notNull().default(1),
  chatbotsLimit: integer("chatbots_limit").notNull().default(-1),
  // Page Access (checkbox matrix)
  pageAccess: jsonb("page_access").notNull().default({
    dashboard: true,
    channels: false,
    send: false,
    bulk: false,
    templates: false,
    workflows: false,
    chatbot: false,
    outbox: false,
    logs: false,
    bulkLogs: false,
    pricing: true,
    balances: false,
    whapiSettings: false,
  }),
  features: jsonb("features").notNull().default([]), // Array of feature strings
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
  offlinePayments: many(offlinePayments),
}));

// Forward declare coupons table for reference
export const coupons = pgTable("coupons", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(),
  discountPercent: integer("discount_percent").notNull(), // 0-100
  maxUses: integer("max_uses"), // null = unlimited
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  status: couponStatusEnum("status").notNull().default("ACTIVE"),
  planScope: text("plan_scope"), // ALL, SPECIFIC, USER_SPECIFIC
  allowedPlanIds: jsonb("allowed_plan_ids"), // Array of plan IDs if SPECIFIC
  allowedUserIds: jsonb("allowed_user_ids"), // Array of user IDs if USER_SPECIFIC
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }), // Which channel this subscription is for
  couponId: integer("coupon_id").references(() => coupons.id, { onDelete: "set null" }), // Applied coupon
  status: subscriptionStatusEnum("status").notNull().default("PENDING"),
  requestType: requestTypeEnum("request_type"), // Per-user override
  daysBalance: integer("days_balance").notNull().default(0), // Days balance for this subscription
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  durationType: durationTypeEnum("duration_type").notNull(),
  provider: text("provider").notNull().default("DIRECT"), // DIRECT, PAYPAL, OFFLINE
  transactionId: text("transaction_id"),
  termsVersion: text("terms_version"), // Which T&C version was accepted
  agreedAt: timestamp("agreed_at"), // When user agreed to T&C
  // Per-user overrides (DO NOT mutate the plan) - Individual columns for type safety
  dailyMessagesLimit: integer("daily_messages_limit_override"), // null = use plan default
  bulkMessagesLimit: integer("bulk_messages_limit_override"), // null = use plan default
  channelsLimit: integer("channels_limit_override"), // null = use plan default
  chatbotsLimit: integer("chatbots_limit_override"), // null = use plan default
  pageAccess: jsonb("page_access_override"), // null = use plan default, object = override specific pages
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
  channel: one(channels, {
    fields: [subscriptions.channelId],
    references: [channels.id],
  }),
  coupon: one(coupons, {
    fields: [subscriptions.couponId],
    references: [coupons.id],
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
  requestType: requestTypeEnum("request_type"), // Request type (PAID, REQUEST_QUOTE, BOOK_DEMO)
  metadata: jsonb("metadata"), // Additional data for quote/demo requests (name, email, phone, company, message, etc.)
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: integer("rejected_by").references(() => users.id, { onDelete: "set null" }),
  rejectedAt: timestamp("rejected_at"),
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

// Plan Requests table (for REQUEST_QUOTE and BOOK_DEMO)
export const planRequests = pgTable("plan_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  businessEmail: text("business_email").notNull(),
  message: text("message").notNull(),
  requestedDate: timestamp("requested_date"), // For BOOK_DEMO only
  status: planRequestStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const planRequestsRelations = relations(planRequests, ({ one }) => ({
  plan: one(plans, {
    fields: [planRequests.planId],
    references: [plans.id],
  }),
}));

// User Custom Plans table (assigns custom plans to specific users)
export const userCustomPlans = pgTable("user_custom_plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").references(() => users.id, { onDelete: "set null" }), // Admin who assigned
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userCustomPlansRelations = relations(userCustomPlans, ({ one }) => ({
  user: one(users, {
    fields: [userCustomPlans.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [userCustomPlans.planId],
    references: [plans.id],
  }),
}));

// Terms Documents table (stores T&C documents with versioning)
export const termsDocuments = pgTable("terms_documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: text("type").notNull(), // MAIN, PRIVACY, BUTTON_FUNCTIONALITY
  version: text("version").notNull(), // e.g., "1.0", "1.1"
  title: text("title").notNull(),
  content: text("content").notNull(), // Full T&C content
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Ledger table (tracks all financial transactions)
export const ledger = pgTable("ledger", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
  transactionType: ledgerTransactionTypeEnum("transaction_type").notNull(),
  amount: integer("amount").notNull(), // Amount in cents (positive or negative)
  currency: text("currency").notNull().default("USD"),
  days: integer("days"), // Days granted/refunded if applicable
  description: text("description"),
  providerTxnId: text("provider_txn_id"), // PayPal transaction ID, etc.
  metadata: jsonb("metadata"), // Additional transaction data
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }), // Admin who created this entry
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ledgerRelations = relations(ledger, ({ one }) => ({
  user: one(users, {
    fields: [ledger.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [ledger.subscriptionId],
    references: [subscriptions.id],
  }),
  channel: one(channels, {
    fields: [ledger.channelId],
    references: [channels.id],
  }),
}));

// Webhook Events table for idempotency tracking
export const webhookEvents = pgTable("webhook_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  provider: text("provider").notNull(), // paypal, stripe, etc.
  eventId: text("event_id").notNull(), // PayPal webhook event ID
  eventType: text("event_type").notNull(), // PAYMENT.CAPTURE.COMPLETED, etc.
  payload: jsonb("payload").notNull(), // Full webhook payload
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
  error: text("error"), // Error message if processing failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  providerEventIdx: uniqueIndex("webhook_events_provider_event_idx").on(table.provider, table.eventId),
}));

// Coupons Relations
export const couponsRelations = relations(coupons, ({ many }) => ({
  subscriptions: many(subscriptions),
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
  lastReplyType: lastReplyTypeEnum("last_reply_type"), // Type of reply: text, buttons_reply, list_reply, other
  lastReplyPayload: jsonb("last_reply_payload"), // Full webhook payload for audit
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
  webhookToken: text("webhook_token").notNull().default(sql`gen_random_uuid()::text`),
  isActive: boolean("is_active").notNull().default(true),
  entryNodeId: text("entry_node_id"), // The "welcome" message node ID
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  user: one(users, {
    fields: [workflows.userId],
    references: [users.id],
  }),
  executions: many(workflowExecutions),
}));

// Conversation States table - tracks last message per phone number
export const conversationStates = pgTable("conversation_states", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workflowId: integer("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(), // Sender's phone number
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  lastMessageDate: timestamp("last_message_date").notNull().defaultNow(), // For "first message of day" check
  currentNodeId: text("current_node_id"), // Track where in the flow
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  workflowPhoneIdx: uniqueIndex("conversation_states_workflow_phone_idx").on(table.workflowId, table.phone),
}));

// First Message Flags - minimal state for "first message of day" trigger
export const firstMessageFlags = pgTable("first_message_flags", {
  phone: varchar("phone", { length: 32 }).notNull(),
  dateLocal: text("date_local").notNull(), // YYYY-MM-DD in Asia/Bahrain timezone
  firstMsgTs: timestamp("first_msg_ts", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pk: uniqueIndex("first_message_flags_phone_date_idx").on(table.phone, table.dateLocal),
}));

export const conversationStatesRelations = relations(conversationStates, ({ one }) => ({
  workflow: one(workflows, {
    fields: [conversationStates.workflowId],
    references: [workflows.id],
  }),
}));

// Workflow Executions table - logs workflow runs for debugging
export const workflowExecutions = pgTable("workflow_executions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workflowId: integer("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(), // Sender's phone number
  messageType: incomingMessageTypeEnum("message_type").notNull(),
  triggerData: jsonb("trigger_data").notNull().default({}), // Incoming webhook payload
  responsesSent: jsonb("responses_sent").notNull().default([]), // What we sent back
  status: workflowExecutionStatusEnum("status").notNull().default("SUCCESS"),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
});

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowExecutions.workflowId],
    references: [workflows.id],
  }),
}));

// Audit Logs table
export const auditLogs = pgTable("audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  actorUserId: integer("user_id").references(() => users.id, { onDelete: "set null" }), // Admin who performed action (mapped to user_id column)
  targetType: text("target_type"), // user, channel, plan, payment, etc.
  targetId: integer("target_id"), // ID of the target
  action: text("action").notNull(), // ban_user, approve_payment, delete_channel, etc.
  reason: text("reason"), // Optional reason for action
  meta: jsonb("meta").notNull().default({}),
  ip: text("ip"), // IP address
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

// Bulk logs table for message sending and webhook event tracking
export const bulkLogs = pgTable("bulk_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  level: bulkLogLevelEnum("level").notNull(),
  category: bulkLogCategoryEnum("category").notNull(),
  message: text("message").notNull(),
  meta: jsonb("meta"), // Additional structured data
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bulkLogsRelations = relations(bulkLogs, ({ one }) => ({
  user: one(users, {
    fields: [bulkLogs.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [bulkLogs.jobId],
    references: [jobs.id],
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

export const insertPlanRequestSchema = createInsertSchema(planRequests, {
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  businessEmail: z.string().email("Invalid email").min(1, "Business email is required"),
  message: z.string().min(1, "Message is required"),
  requestedDate: z.union([z.string(), z.date()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
});

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

export const insertConversationStateSchema = createInsertSchema(conversationStates, {
  phone: z.string().min(1),
});

export const insertFirstMessageFlagSchema = createInsertSchema(firstMessageFlags, {
  phone: z.string().min(1),
  dateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const insertWorkflowExecutionSchema = createInsertSchema(workflowExecutions, {
  phone: z.string().min(1),
});

export const insertBulkLogSchema = createInsertSchema(bulkLogs, {
  message: z.string().min(1),
});

export const insertCouponSchema = z.object({
  code: z.string().min(1).max(50),
  discountPercent: z.number().int().min(0).max(100),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.union([z.string(), z.date()]).nullable().optional().transform((val) => {
    if (!val) return null;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  status: z.enum(["ACTIVE", "EXPIRED", "DISABLED"]).optional(),
  planScope: z.string().nullable().optional(),
  allowedPlanIds: z.any().nullable().optional(),
  allowedUserIds: z.any().nullable().optional(),
});

export const insertUserCustomPlanSchema = createInsertSchema(userCustomPlans);

export const insertTermsDocumentSchema = createInsertSchema(termsDocuments, {
  type: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
});

export const insertLedgerSchema = createInsertSchema(ledger, {
  amount: z.number().int(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents, {
  provider: z.string().min(1),
  eventId: z.string().min(1),
  eventType: z.string().min(1),
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
export type PlanRequest = typeof planRequests.$inferSelect;
export type InsertPlanRequest = z.infer<typeof insertPlanRequestSchema>;
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
export type ConversationState = typeof conversationStates.$inferSelect;
export type InsertConversationState = z.infer<typeof insertConversationStateSchema>;
export type FirstMessageFlag = typeof firstMessageFlags.$inferSelect;
export type InsertFirstMessageFlag = z.infer<typeof insertFirstMessageFlagSchema>;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = z.infer<typeof insertWorkflowExecutionSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type BalanceTransaction = typeof balanceTransactions.$inferSelect;
export type InsertBalanceTransaction = z.infer<typeof insertBalanceTransactionSchema>;
export type ChannelDaysLedger = typeof channelDaysLedger.$inferSelect;
export type InsertChannelDaysLedger = z.infer<typeof insertChannelDaysLedgerSchema>;
export type BulkLog = typeof bulkLogs.$inferSelect;
export type InsertBulkLog = z.infer<typeof insertBulkLogSchema>;
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type UserCustomPlan = typeof userCustomPlans.$inferSelect;
export type InsertUserCustomPlan = z.infer<typeof insertUserCustomPlanSchema>;
export type TermsDocument = typeof termsDocuments.$inferSelect;
export type InsertTermsDocument = z.infer<typeof insertTermsDocumentSchema>;
export type Ledger = typeof ledger.$inferSelect;
export type InsertLedger = z.infer<typeof insertLedgerSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
