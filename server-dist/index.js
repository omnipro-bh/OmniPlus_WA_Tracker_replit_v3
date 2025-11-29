var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  auditLogs: () => auditLogs,
  auditLogsRelations: () => auditLogsRelations,
  authStatusEnum: () => authStatusEnum,
  balanceTransactionTypeEnum: () => balanceTransactionTypeEnum,
  balanceTransactions: () => balanceTransactions,
  balanceTransactionsRelations: () => balanceTransactionsRelations,
  billingPeriodEnum: () => billingPeriodEnum,
  bulkLogCategoryEnum: () => bulkLogCategoryEnum,
  bulkLogLevelEnum: () => bulkLogLevelEnum,
  bulkLogs: () => bulkLogs,
  bulkLogsRelations: () => bulkLogsRelations,
  buttonSchema: () => buttonSchema,
  channelDaysLedger: () => channelDaysLedger,
  channelDaysLedgerRelations: () => channelDaysLedgerRelations,
  channelDaysSourceEnum: () => channelDaysSourceEnum,
  channelStatusEnum: () => channelStatusEnum,
  channels: () => channels,
  channelsRelations: () => channelsRelations,
  conversationStates: () => conversationStates,
  conversationStatesRelations: () => conversationStatesRelations,
  couponStatusEnum: () => couponStatusEnum,
  coupons: () => coupons,
  couponsRelations: () => couponsRelations,
  durationTypeEnum: () => durationTypeEnum,
  firstMessageFlags: () => firstMessageFlags,
  homepageFeatures: () => homepageFeatures,
  incomingMessageTypeEnum: () => incomingMessageTypeEnum,
  insertAuditLogSchema: () => insertAuditLogSchema,
  insertBalanceTransactionSchema: () => insertBalanceTransactionSchema,
  insertBulkLogSchema: () => insertBulkLogSchema,
  insertChannelDaysLedgerSchema: () => insertChannelDaysLedgerSchema,
  insertChannelSchema: () => insertChannelSchema,
  insertConversationStateSchema: () => insertConversationStateSchema,
  insertCouponSchema: () => insertCouponSchema,
  insertFirstMessageFlagSchema: () => insertFirstMessageFlagSchema,
  insertHomepageFeatureSchema: () => insertHomepageFeatureSchema,
  insertJobSchema: () => insertJobSchema,
  insertLedgerSchema: () => insertLedgerSchema,
  insertMediaUploadSchema: () => insertMediaUploadSchema,
  insertMessageSchema: () => insertMessageSchema,
  insertOfflinePaymentSchema: () => insertOfflinePaymentSchema,
  insertPhonebookContactSchema: () => insertPhonebookContactSchema,
  insertPhonebookSchema: () => insertPhonebookSchema,
  insertPlanRequestSchema: () => insertPlanRequestSchema,
  insertPlanSchema: () => insertPlanSchema,
  insertSettingSchema: () => insertSettingSchema,
  insertSubscriberSchema: () => insertSubscriberSchema,
  insertSubscriptionSchema: () => insertSubscriptionSchema,
  insertTemplateSchema: () => insertTemplateSchema,
  insertTermsDocumentSchema: () => insertTermsDocumentSchema,
  insertUseCaseSchema: () => insertUseCaseSchema,
  insertUserCustomPlanSchema: () => insertUserCustomPlanSchema,
  insertUserSchema: () => insertUserSchema,
  insertWebhookEventSchema: () => insertWebhookEventSchema,
  insertWorkflowExecutionSchema: () => insertWorkflowExecutionSchema,
  insertWorkflowSchema: () => insertWorkflowSchema,
  jobStatusEnum: () => jobStatusEnum,
  jobTypeEnum: () => jobTypeEnum,
  jobs: () => jobs,
  jobsRelations: () => jobsRelations,
  lastReplyTypeEnum: () => lastReplyTypeEnum,
  ledger: () => ledger,
  ledgerRelations: () => ledgerRelations,
  ledgerTransactionTypeEnum: () => ledgerTransactionTypeEnum,
  mediaUploads: () => mediaUploads,
  mediaUploadsRelations: () => mediaUploadsRelations,
  messageStatusEnum: () => messageStatusEnum,
  messages: () => messages,
  messagesRelations: () => messagesRelations,
  offlinePaymentStatusEnum: () => offlinePaymentStatusEnum,
  offlinePaymentTypeEnum: () => offlinePaymentTypeEnum,
  offlinePayments: () => offlinePayments,
  offlinePaymentsRelations: () => offlinePaymentsRelations,
  outgoingMessageTypeEnum: () => outgoingMessageTypeEnum,
  phonebookContacts: () => phonebookContacts,
  phonebookContactsRelations: () => phonebookContactsRelations,
  phonebooks: () => phonebooks,
  phonebooksRelations: () => phonebooksRelations,
  planRequestStatusEnum: () => planRequestStatusEnum,
  planRequests: () => planRequests,
  planRequestsRelations: () => planRequestsRelations,
  planTypeEnum: () => planTypeEnum,
  plans: () => plans,
  plansRelations: () => plansRelations,
  requestTypeEnum: () => requestTypeEnum,
  sentMessages: () => sentMessages,
  sentMessagesRelations: () => sentMessagesRelations,
  settings: () => settings,
  subscriberStatusEnum: () => subscriberStatusEnum,
  subscribers: () => subscribers,
  subscribersRelations: () => subscribersRelations,
  subscriptionStatusEnum: () => subscriptionStatusEnum,
  subscriptions: () => subscriptions,
  subscriptionsRelations: () => subscriptionsRelations,
  templates: () => templates,
  templatesRelations: () => templatesRelations,
  termsDocuments: () => termsDocuments,
  useCases: () => useCases,
  userCustomPlans: () => userCustomPlans,
  userCustomPlansRelations: () => userCustomPlansRelations,
  userRoleEnum: () => userRoleEnum,
  userStatusEnum: () => userStatusEnum,
  users: () => users,
  usersRelations: () => usersRelations,
  webhookEvents: () => webhookEvents,
  workflowExecutionStatusEnum: () => workflowExecutionStatusEnum,
  workflowExecutions: () => workflowExecutions,
  workflowExecutionsRelations: () => workflowExecutionsRelations,
  workflows: () => workflows,
  workflowsRelations: () => workflowsRelations
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, pgEnum, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var userRoleEnum, userStatusEnum, channelStatusEnum, authStatusEnum, subscriptionStatusEnum, durationTypeEnum, billingPeriodEnum, requestTypeEnum, offlinePaymentStatusEnum, offlinePaymentTypeEnum, jobTypeEnum, jobStatusEnum, messageStatusEnum, balanceTransactionTypeEnum, channelDaysSourceEnum, workflowExecutionStatusEnum, incomingMessageTypeEnum, lastReplyTypeEnum, planRequestStatusEnum, bulkLogLevelEnum, bulkLogCategoryEnum, planTypeEnum, couponStatusEnum, ledgerTransactionTypeEnum, outgoingMessageTypeEnum, subscriberStatusEnum, users, usersRelations, plans, plansRelations, coupons, subscriptions, subscriptionsRelations, offlinePayments, offlinePaymentsRelations, planRequests, planRequestsRelations, userCustomPlans, userCustomPlansRelations, termsDocuments, ledger, ledgerRelations, webhookEvents, couponsRelations, channels, channelsRelations, templates, templatesRelations, jobs, jobsRelations, messages, messagesRelations, workflows, workflowsRelations, sentMessages, sentMessagesRelations, conversationStates, firstMessageFlags, conversationStatesRelations, workflowExecutions, workflowExecutionsRelations, auditLogs, auditLogsRelations, bulkLogs, bulkLogsRelations, settings, balanceTransactions, channelDaysLedger, balanceTransactionsRelations, channelDaysLedgerRelations, useCases, homepageFeatures, phonebooks, phonebooksRelations, phonebookContacts, phonebookContactsRelations, mediaUploads, mediaUploadsRelations, subscribers, subscribersRelations, insertUserSchema, insertPlanSchema, insertSubscriptionSchema, insertOfflinePaymentSchema, insertPlanRequestSchema, insertChannelSchema, buttonSchema, insertTemplateSchema, insertJobSchema, insertMessageSchema, insertWorkflowSchema, insertAuditLogSchema, insertSettingSchema, insertBalanceTransactionSchema, insertChannelDaysLedgerSchema, insertConversationStateSchema, insertFirstMessageFlagSchema, insertWorkflowExecutionSchema, insertBulkLogSchema, insertCouponSchema, insertUserCustomPlanSchema, insertTermsDocumentSchema, insertLedgerSchema, insertWebhookEventSchema, insertUseCaseSchema, insertHomepageFeatureSchema, insertPhonebookSchema, insertPhonebookContactSchema, insertMediaUploadSchema, insertSubscriberSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    userRoleEnum = pgEnum("user_role", ["user", "admin"]);
    userStatusEnum = pgEnum("user_status", ["active", "suspended", "expired", "banned"]);
    channelStatusEnum = pgEnum("channel_status", ["PENDING", "ACTIVE", "PAUSED"]);
    authStatusEnum = pgEnum("auth_status", ["PENDING", "AUTHORIZED"]);
    subscriptionStatusEnum = pgEnum("subscription_status", ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED", "PENDING_OFFLINE", "REJECTED_OFFLINE"]);
    durationTypeEnum = pgEnum("duration_type", ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]);
    billingPeriodEnum = pgEnum("billing_period", ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]);
    requestTypeEnum = pgEnum("request_type", ["PAID", "REQUEST_QUOTE", "BOOK_DEMO"]);
    offlinePaymentStatusEnum = pgEnum("offline_payment_status", ["PENDING", "APPROVED", "REJECTED"]);
    offlinePaymentTypeEnum = pgEnum("offline_payment_type", ["OFFLINE_PAYMENT", "FREE_TRIAL"]);
    jobTypeEnum = pgEnum("job_type", ["SINGLE", "BULK"]);
    jobStatusEnum = pgEnum("job_status", ["QUEUED", "PROCESSING", "PENDING", "SENT", "DELIVERED", "READ", "FAILED", "PARTIAL", "COMPLETED"]);
    messageStatusEnum = pgEnum("message_status", ["QUEUED", "PENDING", "SENT", "DELIVERED", "READ", "FAILED", "REPLIED"]);
    balanceTransactionTypeEnum = pgEnum("balance_transaction_type", ["topup", "allocate", "refund", "sync", "adjustment"]);
    channelDaysSourceEnum = pgEnum("channel_days_source", ["ADMIN_MANUAL", "PAYPAL", "OFFLINE", "MIGRATION"]);
    workflowExecutionStatusEnum = pgEnum("workflow_execution_status", ["SUCCESS", "ERROR"]);
    incomingMessageTypeEnum = pgEnum("incoming_message_type", ["text", "button_reply", "other"]);
    lastReplyTypeEnum = pgEnum("last_reply_type", ["text", "buttons_reply", "list_reply", "other"]);
    planRequestStatusEnum = pgEnum("plan_request_status", ["PENDING", "REVIEWED", "CONTACTED", "CONVERTED", "REJECTED"]);
    bulkLogLevelEnum = pgEnum("bulk_log_level", ["info", "warn", "error"]);
    bulkLogCategoryEnum = pgEnum("bulk_log_category", ["send", "webhook", "status", "reply", "error"]);
    planTypeEnum = pgEnum("plan_type", ["PUBLIC", "CUSTOM"]);
    couponStatusEnum = pgEnum("coupon_status", ["ACTIVE", "EXPIRED", "DISABLED"]);
    ledgerTransactionTypeEnum = pgEnum("ledger_transaction_type", ["PAYMENT_IN", "PAYMENT_IN_OFFLINE", "DAYS_GRANTED", "DAYS_REFUND", "ADJUSTMENT"]);
    outgoingMessageTypeEnum = pgEnum("outgoing_message_type", ["text", "text_buttons", "image_buttons", "video_buttons", "document"]);
    subscriberStatusEnum = pgEnum("subscriber_status", ["subscribed", "unsubscribed"]);
    users = pgTable("users", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      name: text("name").notNull(),
      email: text("email").notNull().unique(),
      passwordHash: text("password_hash").notNull(),
      role: userRoleEnum("role").notNull().default("user"),
      daysBalance: integer("days_balance").notNull().default(0),
      // DEPRECATED: Use channel_days_ledger instead
      status: userStatusEnum("status").notNull().default("active"),
      whapiToken: text("whapi_token"),
      // Per-user WHAPI token if needed
      bulkWebhookToken: text("bulk_webhook_token").notNull().default(sql`gen_random_uuid()::text`),
      phonebookLimit: integer("phonebook_limit"),
      // Per-user override for phonebook contact limit (null = use plan limit)
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    usersRelations = relations(users, ({ many, one }) => ({
      subscriptions: many(subscriptions),
      channels: many(channels),
      templates: many(templates),
      jobs: many(jobs),
      workflows: many(workflows),
      offlinePayments: many(offlinePayments),
      auditLogs: many(auditLogs),
      phonebooks: many(phonebooks),
      mediaUploads: many(mediaUploads),
      subscribers: many(subscribers)
    }));
    plans = pgTable("plans", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      type: planTypeEnum("type").notNull().default("PUBLIC"),
      // PUBLIC or CUSTOM
      name: text("name").notNull(),
      currency: text("currency").notNull().default("USD"),
      // PayPal currency (always USD)
      price: integer("price"),
      // PayPal price in cents (USD), nullable for Quote/Demo/Custom
      displayCurrency: text("display_currency"),
      // Currency to display on pricing page (e.g., "BHD")
      displayPrice: integer("display_price"),
      // Price to display on pricing page in cents (e.g., BHD)
      billingPeriod: billingPeriodEnum("billing_period").notNull().default("MONTHLY"),
      requestType: requestTypeEnum("request_type").notNull().default("PAID"),
      paypalPlanId: text("paypal_plan_id"),
      // Optional PayPal plan ID for subscriptions
      daysGranted: integer("days_granted").notNull().default(30),
      // Days to add on subscription
      paymentMethods: jsonb("payment_methods").notNull().default(["paypal", "offline"]),
      // ["paypal", "offline", "both"]
      published: boolean("published").notNull().default(false),
      // Visible to authenticated users
      publishedOnHomepage: boolean("published_on_homepage").notNull().default(false),
      // Visible on landing page
      sortOrder: integer("sort_order").notNull().default(0),
      // Limits (-1 = unlimited)
      dailyMessagesLimit: integer("daily_messages_limit").notNull().default(-1),
      bulkMessagesLimit: integer("bulk_messages_limit").notNull().default(-1),
      channelsLimit: integer("channels_limit").notNull().default(1),
      chatbotsLimit: integer("chatbots_limit").notNull().default(-1),
      phonebookLimit: integer("phonebook_limit").notNull().default(-1),
      // Max contacts per phonebook (-1 = unlimited)
      // File Upload Limits (in MB)
      maxImageSizeMB: integer("max_image_size_mb").notNull().default(5),
      // Default 5MB (WhatsApp limit: 5MB)
      maxVideoSizeMB: integer("max_video_size_mb").notNull().default(16),
      // Default 16MB (WhatsApp limit: 16MB)
      maxDocumentSizeMB: integer("max_document_size_mb").notNull().default(10),
      // Default 10MB (WhatsApp limit: 100MB)
      // Page Access (checkbox matrix)
      pageAccess: jsonb("page_access").notNull().default({
        dashboard: true,
        channels: false,
        send: false,
        templates: false,
        workflows: false,
        chatbot: false,
        outbox: false,
        logs: false,
        bulkLogs: false,
        pricing: true,
        balances: false,
        whapiSettings: false,
        phonebooks: false,
        subscribers: false
      }),
      features: jsonb("features").notNull().default([]),
      // Array of feature strings
      // Pricing Controls
      quarterlyDiscountPercent: integer("quarterly_discount_percent").notNull().default(0),
      // 0-100
      semiAnnualDiscountPercent: integer("semi_annual_discount_percent").notNull().default(5),
      // 0-100
      annualDiscountPercent: integer("annual_discount_percent").notNull().default(10),
      // 0-100
      enabledBillingPeriods: jsonb("enabled_billing_periods").notNull().default(["MONTHLY", "SEMI_ANNUAL", "ANNUAL"]),
      // Which billing periods to show
      isPopular: boolean("is_popular").notNull().default(false),
      // Show POPULAR badge
      safetyMeterEnabled: boolean("safety_meter_enabled").notNull().default(false),
      // Enable WhatsApp Safety Meter feature
      freeTrialEnabled: boolean("free_trial_enabled").notNull().default(false),
      // Enable free trial option
      freeTrialDays: integer("free_trial_days").notNull().default(7),
      // Number of days for free trial
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    plansRelations = relations(plans, ({ many }) => ({
      subscriptions: many(subscriptions),
      offlinePayments: many(offlinePayments)
    }));
    coupons = pgTable("coupons", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      code: text("code").notNull().unique(),
      discountPercent: integer("discount_percent").notNull(),
      // 0-100
      maxUses: integer("max_uses"),
      // null = unlimited
      usedCount: integer("used_count").notNull().default(0),
      expiresAt: timestamp("expires_at"),
      status: couponStatusEnum("status").notNull().default("ACTIVE"),
      planScope: text("plan_scope"),
      // ALL, SPECIFIC, USER_SPECIFIC
      allowedPlanIds: jsonb("allowed_plan_ids"),
      // Array of plan IDs if SPECIFIC
      allowedUserIds: jsonb("allowed_user_ids"),
      // Array of user IDs if USER_SPECIFIC
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    subscriptions = pgTable("subscriptions", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
      channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
      // Which channel this subscription is for
      couponId: integer("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
      // Applied coupon
      status: subscriptionStatusEnum("status").notNull().default("PENDING"),
      requestType: requestTypeEnum("request_type"),
      // Per-user override
      daysBalance: integer("days_balance").notNull().default(0),
      // Days balance for this subscription
      startDate: timestamp("start_date"),
      endDate: timestamp("end_date"),
      durationType: durationTypeEnum("duration_type").notNull(),
      provider: text("provider").notNull().default("DIRECT"),
      // DIRECT, PAYPAL, OFFLINE
      transactionId: text("transaction_id"),
      termsVersion: text("terms_version"),
      // Which T&C version was accepted
      agreedAt: timestamp("agreed_at"),
      // When user agreed to T&C
      // Per-user overrides (DO NOT mutate the plan) - Individual columns for type safety
      dailyMessagesLimit: integer("daily_messages_limit_override"),
      // null = use plan default
      bulkMessagesLimit: integer("bulk_messages_limit_override"),
      // null = use plan default
      channelsLimit: integer("channels_limit_override"),
      // null = use plan default
      chatbotsLimit: integer("chatbots_limit_override"),
      // null = use plan default
      phonebookLimit: integer("phonebook_limit_override"),
      // null = use plan default
      pageAccess: jsonb("page_access_override"),
      // null = use plan default, object = override specific pages
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    subscriptionsRelations = relations(subscriptions, ({ one }) => ({
      user: one(users, {
        fields: [subscriptions.userId],
        references: [users.id]
      }),
      plan: one(plans, {
        fields: [subscriptions.planId],
        references: [plans.id]
      }),
      channel: one(channels, {
        fields: [subscriptions.channelId],
        references: [channels.id]
      }),
      coupon: one(coupons, {
        fields: [subscriptions.couponId],
        references: [coupons.id]
      })
    }));
    offlinePayments = pgTable("offline_payments", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
      type: offlinePaymentTypeEnum("type").notNull().default("OFFLINE_PAYMENT"),
      // OFFLINE_PAYMENT or FREE_TRIAL
      amount: integer("amount").notNull(),
      // Amount in cents
      currency: text("currency").notNull().default("USD"),
      reference: text("reference"),
      proofUrl: text("proof_url"),
      couponCode: text("coupon_code"),
      // Coupon code if applied (stored for reference)
      status: offlinePaymentStatusEnum("status").notNull().default("PENDING"),
      requestType: requestTypeEnum("request_type"),
      // Request type (PAID, REQUEST_QUOTE, BOOK_DEMO)
      metadata: jsonb("metadata"),
      // Additional data for quote/demo requests (name, email, phone, company, message, etc.)
      termsVersion: text("terms_version"),
      // Which T&C version was accepted
      approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
      approvedAt: timestamp("approved_at"),
      rejectedBy: integer("rejected_by").references(() => users.id, { onDelete: "set null" }),
      rejectedAt: timestamp("rejected_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    offlinePaymentsRelations = relations(offlinePayments, ({ one }) => ({
      user: one(users, {
        fields: [offlinePayments.userId],
        references: [users.id]
      }),
      plan: one(plans, {
        fields: [offlinePayments.planId],
        references: [plans.id]
      })
    }));
    planRequests = pgTable("plan_requests", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
      name: text("name").notNull(),
      phone: text("phone").notNull(),
      businessEmail: text("business_email").notNull(),
      message: text("message").notNull(),
      requestedDate: timestamp("requested_date"),
      // For BOOK_DEMO only
      status: planRequestStatusEnum("status").notNull().default("PENDING"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    planRequestsRelations = relations(planRequests, ({ one }) => ({
      plan: one(plans, {
        fields: [planRequests.planId],
        references: [plans.id]
      })
    }));
    userCustomPlans = pgTable("user_custom_plans", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
      assignedBy: integer("assigned_by").references(() => users.id, { onDelete: "set null" }),
      // Admin who assigned
      assignedAt: timestamp("assigned_at").notNull().defaultNow(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    userCustomPlansRelations = relations(userCustomPlans, ({ one }) => ({
      user: one(users, {
        fields: [userCustomPlans.userId],
        references: [users.id]
      }),
      plan: one(plans, {
        fields: [userCustomPlans.planId],
        references: [plans.id]
      })
    }));
    termsDocuments = pgTable("terms_documents", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      type: text("type").notNull(),
      // MAIN, PRIVACY, BUTTON_FUNCTIONALITY
      version: text("version").notNull(),
      // e.g., "1.0", "1.1"
      title: text("title").notNull(),
      content: text("content").notNull(),
      // Full T&C content
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    ledger = pgTable("ledger", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
      channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
      transactionType: ledgerTransactionTypeEnum("transaction_type").notNull(),
      amount: integer("amount").notNull(),
      // Amount in cents (positive or negative)
      currency: text("currency").notNull().default("USD"),
      days: integer("days"),
      // Days granted/refunded if applicable
      description: text("description"),
      providerTxnId: text("provider_txn_id"),
      // PayPal transaction ID, etc.
      metadata: jsonb("metadata"),
      // Additional transaction data
      createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
      // Admin who created this entry
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    ledgerRelations = relations(ledger, ({ one }) => ({
      user: one(users, {
        fields: [ledger.userId],
        references: [users.id]
      }),
      subscription: one(subscriptions, {
        fields: [ledger.subscriptionId],
        references: [subscriptions.id]
      }),
      channel: one(channels, {
        fields: [ledger.channelId],
        references: [channels.id]
      })
    }));
    webhookEvents = pgTable("webhook_events", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      provider: text("provider").notNull(),
      // paypal, stripe, etc.
      eventId: text("event_id").notNull(),
      // PayPal webhook event ID
      eventType: text("event_type").notNull(),
      // PAYMENT.CAPTURE.COMPLETED, etc.
      payload: jsonb("payload").notNull(),
      // Full webhook payload
      processed: boolean("processed").notNull().default(false),
      processedAt: timestamp("processed_at"),
      error: text("error"),
      // Error message if processing failed
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => ({
      providerEventIdx: uniqueIndex("webhook_events_provider_event_idx").on(table.provider, table.eventId)
    }));
    couponsRelations = relations(coupons, ({ many }) => ({
      subscriptions: many(subscriptions)
    }));
    channels = pgTable("channels", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      label: text("label").notNull(),
      phone: text("phone").notNull(),
      status: channelStatusEnum("status").notNull().default("PENDING"),
      // Channel activation status (pending = not extended yet)
      authStatus: authStatusEnum("auth_status").notNull().default("PENDING"),
      // WhatsApp QR authorization status
      whapiChannelId: text("whapi_channel_id"),
      // WHAPI channel ID (from WHAPI response.id)
      whapiChannelToken: text("whapi_channel_token"),
      // Token for channel-specific operations (QR, messages)
      whapiStatus: text("whapi_status"),
      // WHAPI channel status from API response
      stopped: boolean("stopped").default(false),
      // WHAPI channel stopped status
      creationTS: timestamp("creation_ts"),
      // WHAPI channel creation timestamp
      activeTill: timestamp("active_till"),
      // WHAPI channel active until timestamp
      activeFrom: timestamp("active_from"),
      // When channel was activated/extended
      expiresAt: timestamp("expires_at"),
      // When channel expires (activeFrom + days * 24h)
      daysRemaining: integer("days_remaining").notNull().default(0),
      // Calculated from ledger entries
      lastExtendedAt: timestamp("last_extended_at"),
      // Last time days were added
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    channelsRelations = relations(channels, ({ one, many }) => ({
      user: one(users, {
        fields: [channels.userId],
        references: [users.id]
      }),
      jobs: many(jobs),
      daysLedger: many(channelDaysLedger)
    }));
    templates = pgTable("templates", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      title: text("title").notNull(),
      messageType: outgoingMessageTypeEnum("message_type").notNull().default("text_buttons"),
      header: text("header"),
      body: text("body").notNull(),
      footer: text("footer"),
      buttons: jsonb("buttons").notNull().default([]),
      // Array of button objects: [{ text, type, value, id }]
      mediaUploadId: integer("media_upload_id").references(() => mediaUploads.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    templatesRelations = relations(templates, ({ one }) => ({
      user: one(users, {
        fields: [templates.userId],
        references: [users.id]
      }),
      mediaUpload: one(mediaUploads, {
        fields: [templates.mediaUploadId],
        references: [mediaUploads.id]
      })
    }));
    jobs = pgTable("jobs", {
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
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    jobsRelations = relations(jobs, ({ one, many }) => ({
      user: one(users, {
        fields: [jobs.userId],
        references: [users.id]
      }),
      channel: one(channels, {
        fields: [jobs.channelId],
        references: [channels.id]
      }),
      messages: many(messages)
    }));
    messages = pgTable("messages", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
      to: text("to").notNull(),
      // Phone number in E.164 format
      name: text("name"),
      email: text("email"),
      body: text("body").notNull(),
      header: text("header"),
      footer: text("footer"),
      buttons: jsonb("buttons").notNull().default([]),
      // Array of button objects: [{ type, title, id }]
      messageType: varchar("message_type", { length: 50 }).default("text_buttons"),
      // text_buttons, image, image_buttons, video_buttons, document
      mediaUrl: text("media_url"),
      // WHAPI media ID or URL for image/video/document
      providerMessageId: text("provider_message_id"),
      // WHAPI message ID from response
      status: messageStatusEnum("status").notNull().default("QUEUED"),
      lastReply: text("last_reply"),
      // Text content of last reply received
      lastReplyType: lastReplyTypeEnum("last_reply_type"),
      // Type of reply: text, buttons_reply, list_reply, other
      lastReplyPayload: jsonb("last_reply_payload"),
      // Full webhook payload for audit
      lastReplyAt: timestamp("last_reply_at"),
      sentAt: timestamp("sent_at"),
      // When message was sent to WHAPI
      deliveredAt: timestamp("delivered_at"),
      // When message was delivered to recipient
      readAt: timestamp("read_at"),
      // When message was read by recipient
      repliedAt: timestamp("replied_at"),
      // When recipient replied
      error: text("error"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      providerMessageIdIdx: uniqueIndex("messages_provider_message_id_idx").on(table.providerMessageId)
    }));
    messagesRelations = relations(messages, ({ one }) => ({
      job: one(jobs, {
        fields: [messages.jobId],
        references: [jobs.id]
      })
    }));
    workflows = pgTable("workflows", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      definitionJson: jsonb("definition_json").notNull().default({}),
      webhookToken: text("webhook_token").notNull().default(sql`gen_random_uuid()::text`),
      isActive: boolean("is_active").notNull().default(true),
      entryNodeId: text("entry_node_id"),
      // The "welcome" message node ID
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    workflowsRelations = relations(workflows, ({ one, many }) => ({
      user: one(users, {
        fields: [workflows.userId],
        references: [users.id]
      }),
      executions: many(workflowExecutions),
      sentMessages: many(sentMessages)
    }));
    sentMessages = pgTable("sent_messages", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      workflowId: integer("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
      messageId: text("message_id").notNull(),
      // WHAPI message ID
      phone: text("phone").notNull(),
      // Recipient phone number
      messageType: text("message_type").notNull(),
      // "carousel", "buttons", "list", etc.
      sentAt: timestamp("sent_at").notNull().defaultNow(),
      expiresAt: timestamp("expires_at").notNull().default(sql`NOW() + INTERVAL '24 hours'`)
      // Auto-cleanup after 24h
    }, (table) => ({
      messageIdIdx: uniqueIndex("sent_messages_message_id_idx").on(table.messageId)
    }));
    sentMessagesRelations = relations(sentMessages, ({ one }) => ({
      workflow: one(workflows, {
        fields: [sentMessages.workflowId],
        references: [workflows.id]
      })
    }));
    conversationStates = pgTable("conversation_states", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      workflowId: integer("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
      phone: text("phone").notNull(),
      // Sender's phone number
      lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
      lastMessageDate: timestamp("last_message_date").notNull().defaultNow(),
      // For "first message of day" check
      currentNodeId: text("current_node_id"),
      // Track where in the flow
      context: jsonb("context").notNull().default({}),
      // Stores all workflow variables including HTTP node results
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      workflowPhoneIdx: uniqueIndex("conversation_states_workflow_phone_idx").on(table.workflowId, table.phone)
    }));
    firstMessageFlags = pgTable("first_message_flags", {
      phone: varchar("phone", { length: 32 }).notNull(),
      dateLocal: text("date_local").notNull(),
      // YYYY-MM-DD in Asia/Bahrain timezone
      firstMsgTs: timestamp("first_msg_ts", { withTimezone: true }).notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => ({
      pk: uniqueIndex("first_message_flags_phone_date_idx").on(table.phone, table.dateLocal)
    }));
    conversationStatesRelations = relations(conversationStates, ({ one }) => ({
      workflow: one(workflows, {
        fields: [conversationStates.workflowId],
        references: [workflows.id]
      })
    }));
    workflowExecutions = pgTable("workflow_executions", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      workflowId: integer("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
      phone: text("phone").notNull(),
      // Sender's phone number
      messageType: incomingMessageTypeEnum("message_type").notNull(),
      triggerData: jsonb("trigger_data").notNull().default({}),
      // Incoming webhook payload
      responsesSent: jsonb("responses_sent").notNull().default([]),
      // What we sent back
      status: workflowExecutionStatusEnum("status").notNull().default("SUCCESS"),
      errorMessage: text("error_message"),
      executedAt: timestamp("executed_at").notNull().defaultNow()
    });
    workflowExecutionsRelations = relations(workflowExecutions, ({ one }) => ({
      workflow: one(workflows, {
        fields: [workflowExecutions.workflowId],
        references: [workflows.id]
      })
    }));
    auditLogs = pgTable("audit_logs", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      actorUserId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
      // Admin who performed action (mapped to user_id column)
      targetType: text("target_type"),
      // user, channel, plan, payment, etc.
      targetId: integer("target_id"),
      // ID of the target
      action: text("action").notNull(),
      // ban_user, approve_payment, delete_channel, etc.
      reason: text("reason"),
      // Optional reason for action
      meta: jsonb("meta").notNull().default({}),
      ip: text("ip"),
      // IP address
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    auditLogsRelations = relations(auditLogs, ({ one }) => ({
      actor: one(users, {
        fields: [auditLogs.actorUserId],
        references: [users.id]
      })
    }));
    bulkLogs = pgTable("bulk_logs", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }),
      level: bulkLogLevelEnum("level").notNull(),
      category: bulkLogCategoryEnum("category").notNull(),
      message: text("message").notNull(),
      meta: jsonb("meta"),
      // Additional structured data
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    bulkLogsRelations = relations(bulkLogs, ({ one }) => ({
      user: one(users, {
        fields: [bulkLogs.userId],
        references: [users.id]
      }),
      job: one(jobs, {
        fields: [bulkLogs.jobId],
        references: [jobs.id]
      })
    }));
    settings = pgTable("settings", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      key: text("key").notNull().unique(),
      value: text("value"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    balanceTransactions = pgTable("balance_transactions", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      type: balanceTransactionTypeEnum("type").notNull(),
      days: integer("days").notNull(),
      // Positive integer
      channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
      userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
      note: text("note").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    channelDaysLedger = pgTable("channel_days_ledger", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
      days: integer("days").notNull(),
      // Number of days added
      source: channelDaysSourceEnum("source").notNull(),
      // Where the days came from
      balanceTransactionId: integer("balance_transaction_id").references(() => balanceTransactions.id, { onDelete: "set null" }),
      subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
      offlinePaymentId: integer("offline_payment_id").references(() => offlinePayments.id, { onDelete: "set null" }),
      metadata: jsonb("metadata").default({}),
      // Additional info (admin user, notes, etc.)
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    balanceTransactionsRelations = relations(balanceTransactions, ({ one }) => ({
      channel: one(channels, {
        fields: [balanceTransactions.channelId],
        references: [channels.id]
      }),
      user: one(users, {
        fields: [balanceTransactions.userId],
        references: [users.id]
      })
    }));
    channelDaysLedgerRelations = relations(channelDaysLedger, ({ one }) => ({
      channel: one(channels, {
        fields: [channelDaysLedger.channelId],
        references: [channels.id]
      }),
      balanceTransaction: one(balanceTransactions, {
        fields: [channelDaysLedger.balanceTransactionId],
        references: [balanceTransactions.id]
      }),
      subscription: one(subscriptions, {
        fields: [channelDaysLedger.subscriptionId],
        references: [subscriptions.id]
      }),
      offlinePayment: one(offlinePayments, {
        fields: [channelDaysLedger.offlinePaymentId],
        references: [offlinePayments.id]
      })
    }));
    useCases = pgTable("use_cases", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      title: text("title").notNull(),
      description: text("description").notNull(),
      images: text("images").array().notNull().default(sql`'{}'`),
      // Array of image URLs for carousel
      sortOrder: integer("sort_order").notNull().default(0),
      published: boolean("published").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    homepageFeatures = pgTable("homepage_features", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      title: text("title").notNull(),
      description: text("description").notNull(),
      icon: text("icon"),
      // lucide-react icon name
      sortOrder: integer("sort_order").notNull().default(0),
      published: boolean("published").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    phonebooks = pgTable("phonebooks", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    phonebooksRelations = relations(phonebooks, ({ one, many }) => ({
      user: one(users, {
        fields: [phonebooks.userId],
        references: [users.id]
      }),
      contacts: many(phonebookContacts)
    }));
    phonebookContacts = pgTable("phonebook_contacts", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      phonebookId: integer("phonebook_id").notNull().references(() => phonebooks.id, { onDelete: "cascade" }),
      // Contact Info
      phone: varchar("phone", { length: 50 }).notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      email: varchar("email", { length: 255 }),
      // Message Configuration (supports 5 types)
      messageType: varchar("message_type", { length: 50 }).notNull().default("text_buttons"),
      // text_buttons, image, image_buttons, video_buttons, document
      header: text("header"),
      // Optional header text
      body: text("body").notNull(),
      footer: text("footer"),
      // Optional footer text
      mediaUrl: text("media_url"),
      // WHAPI media ID for image/video/document
      // Buttons (max 3 - maintains button_id pattern)
      button1Text: varchar("button1_text", { length: 255 }),
      button1Type: varchar("button1_type", { length: 20 }),
      // quick_reply, url, call
      button1Value: text("button1_value"),
      // URL or phone number
      button1Id: varchar("button1_id", { length: 50 }),
      // Button reference ID
      button2Text: varchar("button2_text", { length: 255 }),
      button2Type: varchar("button2_type", { length: 20 }),
      button2Value: text("button2_value"),
      button2Id: varchar("button2_id", { length: 50 }),
      button3Text: varchar("button3_text", { length: 255 }),
      button3Type: varchar("button3_type", { length: 20 }),
      button3Value: text("button3_value"),
      button3Id: varchar("button3_id", { length: 50 }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    phonebookContactsRelations = relations(phonebookContacts, ({ one }) => ({
      phonebook: one(phonebooks, {
        fields: [phonebookContacts.phonebookId],
        references: [phonebooks.id]
      })
    }));
    mediaUploads = pgTable("media_uploads", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      whapiMediaId: varchar("whapi_media_id", { length: 255 }).notNull(),
      // From WHAPI response
      fileName: varchar("file_name", { length: 255 }),
      fileType: varchar("file_type", { length: 50 }),
      // image, video, document
      fileSizeMB: integer("file_size_mb"),
      // File size in MB (stored as integer for simplicity)
      expiresAt: timestamp("expires_at"),
      // WHAPI stores for 30 days
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    mediaUploadsRelations = relations(mediaUploads, ({ one }) => ({
      user: one(users, {
        fields: [mediaUploads.userId],
        references: [users.id]
      })
    }));
    subscribers = pgTable("subscribers", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      // Subscriber Info
      phone: varchar("phone", { length: 50 }).notNull(),
      name: varchar("name", { length: 255 }).notNull().default(""),
      // Subscriber name (can be edited)
      // Status
      status: subscriberStatusEnum("status").notNull().default("subscribed"),
      // Timestamps
      subscribedAt: timestamp("subscribed_at"),
      unsubscribedAt: timestamp("unsubscribed_at"),
      lastUpdated: timestamp("last_updated").notNull().defaultNow(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => ({
      // Unique constraint: one subscriber record per user per phone
      uniqueUserPhone: uniqueIndex("unique_user_phone_subscribers").on(table.userId, table.phone)
    }));
    subscribersRelations = relations(subscribers, ({ one }) => ({
      user: one(users, {
        fields: [subscribers.userId],
        references: [users.id]
      })
    }));
    insertUserSchema = createInsertSchema(users, {
      email: z.string().email(),
      name: z.string().min(1),
      passwordHash: z.string().min(6)
    });
    insertPlanSchema = createInsertSchema(plans);
    insertSubscriptionSchema = createInsertSchema(subscriptions);
    insertOfflinePaymentSchema = createInsertSchema(offlinePayments);
    insertPlanRequestSchema = createInsertSchema(planRequests, {
      name: z.string().min(1, "Name is required"),
      phone: z.string().min(1, "Phone is required"),
      businessEmail: z.string().email("Invalid email").min(1, "Business email is required"),
      message: z.string().min(1, "Message is required"),
      requestedDate: z.union([z.string(), z.date()]).optional().transform((val) => {
        if (!val) return void 0;
        if (typeof val === "string") return new Date(val);
        return val;
      })
    });
    insertChannelSchema = createInsertSchema(channels, {
      label: z.string().min(1),
      phone: z.string().min(1)
    });
    buttonSchema = z.object({
      text: z.string().min(1),
      type: z.enum(["quick_reply", "url", "call"]),
      value: z.string().nullable().optional(),
      // URL or phone number for url/call buttons
      id: z.string().optional()
      // ID for quick_reply buttons
    }).refine((data) => {
      if (data.type === "quick_reply" && !data.id) {
        return false;
      }
      if ((data.type === "url" || data.type === "call") && !data.value) {
        return false;
      }
      return true;
    }, {
      message: "Button validation failed: quick_reply requires id, url/call requires value"
    });
    insertTemplateSchema = createInsertSchema(templates, {
      title: z.string().min(1),
      body: z.string().min(1),
      buttons: z.array(buttonSchema).default([]),
      messageType: z.enum(["text", "text_buttons", "image_buttons", "video_buttons", "document"]).optional()
    });
    insertJobSchema = createInsertSchema(jobs);
    insertMessageSchema = createInsertSchema(messages, {
      to: z.string().min(1),
      body: z.string().min(1)
    });
    insertWorkflowSchema = createInsertSchema(workflows, {
      name: z.string().min(1)
    });
    insertAuditLogSchema = createInsertSchema(auditLogs);
    insertSettingSchema = createInsertSchema(settings, {
      key: z.string().min(1)
    });
    insertBalanceTransactionSchema = createInsertSchema(balanceTransactions, {
      days: z.number().int().positive(),
      note: z.string().min(1)
    });
    insertChannelDaysLedgerSchema = createInsertSchema(channelDaysLedger, {
      days: z.number().int().positive()
    });
    insertConversationStateSchema = createInsertSchema(conversationStates, {
      phone: z.string().min(1)
    });
    insertFirstMessageFlagSchema = createInsertSchema(firstMessageFlags, {
      phone: z.string().min(1),
      dateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });
    insertWorkflowExecutionSchema = createInsertSchema(workflowExecutions, {
      phone: z.string().min(1)
    });
    insertBulkLogSchema = createInsertSchema(bulkLogs, {
      message: z.string().min(1)
    });
    insertCouponSchema = z.object({
      code: z.string().min(1).max(50),
      discountPercent: z.number().int().min(0).max(100),
      maxUses: z.number().int().positive().nullable().optional(),
      expiresAt: z.union([z.string(), z.date()]).nullable().optional().transform((val) => {
        if (!val) return null;
        if (typeof val === "string") return new Date(val);
        return val;
      }),
      status: z.enum(["ACTIVE", "EXPIRED", "DISABLED"]).optional(),
      planScope: z.string().nullable().optional(),
      allowedPlanIds: z.any().nullable().optional(),
      allowedUserIds: z.any().nullable().optional()
    });
    insertUserCustomPlanSchema = createInsertSchema(userCustomPlans);
    insertTermsDocumentSchema = createInsertSchema(termsDocuments, {
      type: z.string().min(1),
      version: z.string().min(1),
      title: z.string().min(1),
      content: z.string().min(1)
    });
    insertLedgerSchema = createInsertSchema(ledger, {
      amount: z.number().int()
    });
    insertWebhookEventSchema = createInsertSchema(webhookEvents, {
      provider: z.string().min(1),
      eventId: z.string().min(1),
      eventType: z.string().min(1)
    });
    insertUseCaseSchema = createInsertSchema(useCases, {
      title: z.string().min(1),
      description: z.string().min(1),
      images: z.array(
        z.string().refine((val) => {
          if (val === "") return true;
          if (val.startsWith("/uploads/")) return true;
          return z.string().url().safeParse(val).success;
        }, { message: "Must be a valid URL or file path" })
      ).min(1, "At least one image is required")
    }).refine(
      (data) => data.images.some((url) => url !== ""),
      { message: "At least one image is required", path: ["images"] }
    );
    insertHomepageFeatureSchema = createInsertSchema(homepageFeatures, {
      title: z.string().min(1),
      description: z.string().min(1)
    });
    insertPhonebookSchema = createInsertSchema(phonebooks, {
      name: z.string().min(1, "Phonebook name is required")
    });
    insertPhonebookContactSchema = createInsertSchema(phonebookContacts, {
      phone: z.string().min(1, "Phone number is required"),
      name: z.string().min(1, "Contact name is required"),
      body: z.string().min(1, "Message body is required")
    });
    insertMediaUploadSchema = createInsertSchema(mediaUploads, {
      whapiMediaId: z.string().min(1),
      fileType: z.enum(["image", "video", "document"])
    });
    insertSubscriberSchema = createInsertSchema(subscribers, {
      phone: z.string().min(1, "Phone number is required"),
      name: z.string().default(""),
      status: z.enum(["subscribed", "unsubscribed"]).optional()
    });
  }
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
var pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    neonConfig.webSocketConstructor = ws;
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle({ client: pool, schema: schema_exports });
  }
});

// server/storage.ts
var storage_exports = {};
__export(storage_exports, {
  DatabaseStorage: () => DatabaseStorage,
  storage: () => storage
});
import { eq, and, desc, sql as sql2, like } from "drizzle-orm";
var DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_db();
    init_schema();
    DatabaseStorage = class {
      // Users
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user || void 0;
      }
      async getUserByEmail(email) {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user || void 0;
      }
      async createUser(insertUser) {
        const [user] = await db.insert(users).values(insertUser).returning();
        return user;
      }
      async updateUser(id, data) {
        const [user] = await db.update(users).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
        return user || void 0;
      }
      async deleteUser(id) {
        await db.delete(users).where(eq(users.id, id));
      }
      async getAllUsers() {
        return await db.select().from(users).orderBy(desc(users.createdAt));
      }
      // Plans
      async getPlans() {
        return await db.select().from(plans).orderBy(plans.price);
      }
      async getPlan(id) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, id));
        return plan || void 0;
      }
      async createPlan(insertPlan) {
        const [plan] = await db.insert(plans).values(insertPlan).returning();
        return plan;
      }
      async updatePlan(id, data) {
        const [plan] = await db.update(plans).set(data).where(eq(plans.id, id)).returning();
        return plan;
      }
      async deletePlan(id) {
        await db.delete(plans).where(eq(plans.id, id));
      }
      // Coupons
      async getCoupons() {
        return await db.select().from(coupons).orderBy(desc(coupons.createdAt));
      }
      async getCoupon(id) {
        const [coupon] = await db.select().from(coupons).where(eq(coupons.id, id));
        return coupon || void 0;
      }
      async getCouponByCode(code) {
        const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code));
        return coupon || void 0;
      }
      async createCoupon(insertCoupon) {
        const [coupon] = await db.insert(coupons).values(insertCoupon).returning();
        return coupon;
      }
      async updateCoupon(id, data) {
        const [coupon] = await db.update(coupons).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(coupons.id, id)).returning();
        return coupon || void 0;
      }
      async deleteCoupon(id) {
        await db.delete(coupons).where(eq(coupons.id, id));
      }
      async validateCoupon(code, userId, planId) {
        const coupon = await this.getCouponByCode(code);
        if (!coupon) {
          return { valid: false, message: "Invalid coupon code" };
        }
        if (coupon.status !== "ACTIVE") {
          return { valid: false, message: "Coupon is not active" };
        }
        if (coupon.expiresAt && new Date(coupon.expiresAt) < /* @__PURE__ */ new Date()) {
          return { valid: false, message: "Coupon has expired" };
        }
        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
          return { valid: false, message: "Coupon usage limit reached" };
        }
        if (coupon.planScope === "SPECIFIC" && coupon.allowedPlanIds) {
          const allowedPlans = coupon.allowedPlanIds;
          if (!allowedPlans.includes(planId)) {
            return { valid: false, message: "Coupon not valid for this plan" };
          }
        }
        if (coupon.planScope === "USER_SPECIFIC" && coupon.allowedUserIds) {
          const allowedUsers = coupon.allowedUserIds;
          if (!allowedUsers.includes(userId)) {
            return { valid: false, message: "Coupon not valid for your account" };
          }
        }
        return { valid: true, message: "Coupon is valid", coupon };
      }
      async incrementCouponUsage(id) {
        await db.update(coupons).set({ usedCount: sql2`${coupons.usedCount} + 1`, updatedAt: /* @__PURE__ */ new Date() }).where(eq(coupons.id, id));
      }
      // Subscriptions
      async getActiveSubscriptionForUser(userId) {
        const [subscription] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "ACTIVE"))).orderBy(desc(subscriptions.createdAt)).limit(1);
        return subscription || void 0;
      }
      async createSubscription(insertSubscription) {
        const [subscription] = await db.insert(subscriptions).values(insertSubscription).returning();
        return subscription;
      }
      async updateSubscription(id, data) {
        const [subscription] = await db.update(subscriptions).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(subscriptions.id, id)).returning();
        return subscription || void 0;
      }
      // Channels
      async getChannelsForUser(userId) {
        return await db.select().from(channels).where(eq(channels.userId, userId)).orderBy(desc(channels.createdAt));
      }
      async getChannel(id) {
        const [channel] = await db.select().from(channels).where(eq(channels.id, id));
        return channel || void 0;
      }
      async createChannel(insertChannel) {
        const [channel] = await db.insert(channels).values(insertChannel).returning();
        return channel;
      }
      async updateChannel(id, data) {
        const [channel] = await db.update(channels).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(channels.id, id)).returning();
        return channel || void 0;
      }
      async deleteChannel(id) {
        await db.delete(channels).where(eq(channels.id, id));
      }
      // Templates
      async getTemplatesForUser(userId) {
        return await db.select().from(templates).where(eq(templates.userId, userId)).orderBy(desc(templates.createdAt));
      }
      async getTemplate(id) {
        const [template] = await db.select().from(templates).where(eq(templates.id, id));
        return template || void 0;
      }
      async createTemplate(insertTemplate) {
        const [template] = await db.insert(templates).values(insertTemplate).returning();
        return template;
      }
      async updateTemplate(id, data) {
        const [template] = await db.update(templates).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(templates.id, id)).returning();
        return template || void 0;
      }
      async deleteTemplate(id) {
        await db.delete(templates).where(eq(templates.id, id));
      }
      // Jobs
      async getJobsForUser(userId) {
        return await db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt));
      }
      async getJob(id) {
        const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
        return job || void 0;
      }
      async createJob(insertJob) {
        const [job] = await db.insert(jobs).values(insertJob).returning();
        return job;
      }
      async updateJob(id, data) {
        const [job] = await db.update(jobs).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(jobs.id, id)).returning();
        return job || void 0;
      }
      // Messages
      async getMessagesForJob(jobId) {
        return await db.select().from(messages).where(eq(messages.jobId, jobId)).orderBy(desc(messages.createdAt));
      }
      async createMessage(insertMessage) {
        const [message] = await db.insert(messages).values(insertMessage).returning();
        return message;
      }
      async updateMessage(id, data) {
        const [message] = await db.update(messages).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(messages.id, id)).returning();
        return message || void 0;
      }
      // Workflows
      async getWorkflowsForUser(userId) {
        return await db.select().from(workflows).where(eq(workflows.userId, userId)).orderBy(desc(workflows.createdAt));
      }
      async getWorkflow(id) {
        const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id));
        return workflow || void 0;
      }
      async createWorkflow(insertWorkflow) {
        const [workflow] = await db.insert(workflows).values(insertWorkflow).returning();
        return workflow;
      }
      async updateWorkflow(id, data) {
        const [workflow] = await db.update(workflows).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(workflows.id, id)).returning();
        return workflow || void 0;
      }
      async deleteWorkflow(id) {
        await db.delete(workflows).where(eq(workflows.id, id));
      }
      // Offline Payments
      async getOfflinePayments(status) {
        if (status) {
          return await db.select().from(offlinePayments).where(eq(offlinePayments.status, status)).orderBy(desc(offlinePayments.createdAt));
        }
        return await db.select().from(offlinePayments).orderBy(desc(offlinePayments.createdAt));
      }
      async getOfflinePayment(id) {
        const [payment] = await db.select().from(offlinePayments).where(eq(offlinePayments.id, id));
        return payment || void 0;
      }
      async createOfflinePayment(insertPayment) {
        const [payment] = await db.insert(offlinePayments).values(insertPayment).returning();
        return payment;
      }
      async updateOfflinePayment(id, data) {
        const [payment] = await db.update(offlinePayments).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(offlinePayments.id, id)).returning();
        return payment || void 0;
      }
      async deleteOfflinePayment(id) {
        await db.delete(offlinePayments).where(eq(offlinePayments.id, id));
      }
      // Plan Requests
      async getPlanRequests(status) {
        if (status) {
          return await db.select().from(planRequests).where(eq(planRequests.status, status)).orderBy(desc(planRequests.createdAt));
        }
        return await db.select().from(planRequests).orderBy(desc(planRequests.createdAt));
      }
      async getPlanRequest(id) {
        const [request] = await db.select().from(planRequests).where(eq(planRequests.id, id));
        return request || void 0;
      }
      async createPlanRequest(insertRequest) {
        const [request] = await db.insert(planRequests).values(insertRequest).returning();
        return request;
      }
      async updatePlanRequest(id, data) {
        const [request] = await db.update(planRequests).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(planRequests.id, id)).returning();
        return request || void 0;
      }
      // Audit Logs
      async createAuditLog(insertLog) {
        const [log2] = await db.insert(auditLogs).values(insertLog).returning();
        return log2;
      }
      // Settings
      async getSetting(key) {
        const [setting] = await db.select().from(settings).where(eq(settings.key, key));
        return setting || void 0;
      }
      async setSetting(key, value) {
        const existing = await this.getSetting(key);
        if (existing) {
          const [updated] = await db.update(settings).set({ value, updatedAt: /* @__PURE__ */ new Date() }).where(eq(settings.key, key)).returning();
          return updated;
        } else {
          const [created] = await db.insert(settings).values({ key, value }).returning();
          return created;
        }
      }
      async getSettingsByPrefix(prefix) {
        return await db.select().from(settings).where(like(settings.key, `${prefix}%`));
      }
      // Balance Transactions
      async createBalanceTransaction(insertTransaction) {
        const [transaction] = await db.insert(balanceTransactions).values(insertTransaction).returning();
        return transaction;
      }
      async getBalanceTransactions(limit) {
        const query = db.select().from(balanceTransactions).orderBy(desc(balanceTransactions.createdAt));
        if (limit) {
          return await query.limit(limit);
        }
        return await query;
      }
      async getBalanceTransaction(id) {
        const [transaction] = await db.select().from(balanceTransactions).where(eq(balanceTransactions.id, id));
        return transaction || null;
      }
      async deleteBalanceTransaction(id) {
        await db.delete(balanceTransactions).where(eq(balanceTransactions.id, id));
      }
      async getMainDaysBalance() {
        const setting = await this.getSetting("main_days_balance");
        return setting ? parseInt(setting.value || "0") : 0;
      }
      async updateMainDaysBalance(change) {
        const currentBalance = await this.getMainDaysBalance();
        const newBalance = currentBalance + change;
        if (newBalance < 0) {
          throw new Error(`Insufficient main balance. Current: ${currentBalance}, Requested change: ${change}`);
        }
        await this.setSetting("main_days_balance", newBalance.toString());
        return newBalance;
      }
      // Channel Days Ledger
      async addDaysToChannel(params) {
        const channel = await this.getChannel(params.channelId);
        if (!channel) {
          throw new Error(`Channel ${params.channelId} not found`);
        }
        const [ledgerEntry] = await db.insert(channelDaysLedger).values({
          channelId: params.channelId,
          days: params.days,
          source: params.source,
          balanceTransactionId: params.balanceTransactionId,
          subscriptionId: params.subscriptionId,
          offlinePaymentId: params.offlinePaymentId,
          metadata: params.metadata || {}
        }).returning();
        const now = /* @__PURE__ */ new Date();
        let newExpiresAt;
        let newActiveFrom = channel.activeFrom;
        let newStatus = channel.status;
        if (channel.status === "PENDING" || !channel.expiresAt) {
          newActiveFrom = now;
          newExpiresAt = new Date(now.getTime() + params.days * 24 * 60 * 60 * 1e3);
          newStatus = "ACTIVE";
        } else {
          const currentExpiry = new Date(channel.expiresAt);
          if (currentExpiry > now) {
            newExpiresAt = new Date(currentExpiry.getTime() + params.days * 24 * 60 * 60 * 1e3);
          } else {
            newActiveFrom = now;
            newExpiresAt = new Date(now.getTime() + params.days * 24 * 60 * 60 * 1e3);
            newStatus = "ACTIVE";
          }
        }
        const daysRemaining = Math.max(0, Math.ceil((newExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1e3)));
        const [updatedChannel] = await db.update(channels).set({
          status: newStatus,
          activeFrom: newActiveFrom,
          expiresAt: newExpiresAt,
          daysRemaining,
          lastExtendedAt: now,
          updatedAt: now
        }).where(eq(channels.id, params.channelId)).returning();
        return { ledgerEntry, updatedChannel };
      }
      async getChannelDaysLedger(channelId) {
        return await db.select().from(channelDaysLedger).where(eq(channelDaysLedger.channelId, channelId)).orderBy(desc(channelDaysLedger.createdAt));
      }
      async calculateChannelDaysRemaining(channelId) {
        const channel = await this.getChannel(channelId);
        if (!channel || !channel.expiresAt) {
          return 0;
        }
        const now = /* @__PURE__ */ new Date();
        const expiresAt = new Date(channel.expiresAt);
        if (expiresAt <= now) {
          return 0;
        }
        return Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1e3));
      }
      // Bulk Logs
      async createBulkLog(log2) {
        const [newLog] = await db.insert(bulkLogs).values(log2).returning();
        return newLog;
      }
      async getBulkLogs(filters) {
        let query = db.select().from(bulkLogs);
        const conditions = [];
        if (filters?.userId) {
          conditions.push(eq(bulkLogs.userId, filters.userId));
        }
        if (filters?.jobId) {
          conditions.push(eq(bulkLogs.jobId, filters.jobId));
        }
        if (filters?.level) {
          conditions.push(eq(bulkLogs.level, filters.level));
        }
        if (filters?.category) {
          conditions.push(eq(bulkLogs.category, filters.category));
        }
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        query = query.orderBy(desc(bulkLogs.createdAt));
        if (filters?.limit) {
          query = query.limit(filters.limit);
        }
        return await query;
      }
      // Terms & Conditions
      async getActiveTermsDocuments() {
        return await db.select().from(termsDocuments).where(eq(termsDocuments.isActive, true)).orderBy(termsDocuments.type);
      }
      async getTermsDocument(id) {
        const [doc] = await db.select().from(termsDocuments).where(eq(termsDocuments.id, id));
        return doc || void 0;
      }
      async getTermsDocumentByType(type) {
        const [doc] = await db.select().from(termsDocuments).where(and(
          eq(termsDocuments.type, type),
          eq(termsDocuments.isActive, true)
        )).orderBy(desc(termsDocuments.createdAt)).limit(1);
        return doc || void 0;
      }
      async createTermsDocument(document) {
        const [doc] = await db.insert(termsDocuments).values(document).returning();
        return doc;
      }
      async updateTermsDocument(id, data) {
        const [doc] = await db.update(termsDocuments).set(data).where(eq(termsDocuments.id, id)).returning();
        return doc || void 0;
      }
      async setActiveTermsDocument(id) {
        const doc = await this.getTermsDocument(id);
        if (!doc) {
          return void 0;
        }
        await db.transaction(async (tx) => {
          await tx.update(termsDocuments).set({ isActive: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(termsDocuments.type, doc.type));
          await tx.update(termsDocuments).set({ isActive: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq(termsDocuments.id, id));
        });
        return await this.getTermsDocument(id);
      }
      // Webhook Events
      async getWebhookEvent(provider, eventId) {
        const [event] = await db.select().from(webhookEvents).where(and(
          eq(webhookEvents.provider, provider),
          eq(webhookEvents.eventId, eventId)
        ));
        return event || void 0;
      }
      async createWebhookEvent(event) {
        const [newEvent] = await db.insert(webhookEvents).values(event).returning();
        return newEvent;
      }
      async markWebhookProcessed(id, error) {
        const [event] = await db.update(webhookEvents).set({
          processed: true,
          processedAt: /* @__PURE__ */ new Date(),
          error: error || null
        }).where(eq(webhookEvents.id, id)).returning();
        return event || void 0;
      }
      // Ledger
      async createLedgerEntry(entry) {
        const [ledgerEntry] = await db.insert(ledger).values(entry).returning();
        return ledgerEntry;
      }
      async getLedgerEntries(userId, limit = 100) {
        let query = db.select().from(ledger);
        if (userId) {
          query = query.where(eq(ledger.userId, userId));
        }
        query = query.orderBy(desc(ledger.createdAt)).limit(limit);
        return await query;
      }
      // Phonebooks
      async getPhonebooksForUser(userId) {
        return await db.select().from(phonebooks).where(eq(phonebooks.userId, userId)).orderBy(desc(phonebooks.createdAt));
      }
      async getPhonebook(id) {
        const [phonebook] = await db.select().from(phonebooks).where(eq(phonebooks.id, id));
        return phonebook || void 0;
      }
      async createPhonebook(phonebook) {
        const [newPhonebook] = await db.insert(phonebooks).values(phonebook).returning();
        return newPhonebook;
      }
      async updatePhonebook(id, data) {
        const [phonebook] = await db.update(phonebooks).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(phonebooks.id, id)).returning();
        return phonebook || void 0;
      }
      async deletePhonebook(id) {
        await db.delete(phonebooks).where(eq(phonebooks.id, id));
      }
      // Phonebook Contacts
      async getContactsForPhonebook(phonebookId) {
        return await db.select().from(phonebookContacts).where(eq(phonebookContacts.phonebookId, phonebookId)).orderBy(desc(phonebookContacts.createdAt));
      }
      async getContact(id) {
        const [contact] = await db.select().from(phonebookContacts).where(eq(phonebookContacts.id, id));
        return contact || void 0;
      }
      async createContact(contact) {
        const [newContact] = await db.insert(phonebookContacts).values(contact).returning();
        return newContact;
      }
      async updateContact(id, data) {
        const [contact] = await db.update(phonebookContacts).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(phonebookContacts.id, id)).returning();
        return contact || void 0;
      }
      async deleteContact(id) {
        await db.delete(phonebookContacts).where(eq(phonebookContacts.id, id));
      }
      // Media Uploads
      async createMediaUpload(upload) {
        const [newUpload] = await db.insert(mediaUploads).values(upload).returning();
        return newUpload;
      }
      async getMediaUploadsForUser(userId, limit = 100) {
        return await db.select().from(mediaUploads).where(eq(mediaUploads.userId, userId)).orderBy(desc(mediaUploads.createdAt)).limit(limit);
      }
      async getMediaUpload(id) {
        const [upload] = await db.select().from(mediaUploads).where(eq(mediaUploads.id, id));
        return upload || void 0;
      }
      // Subscribers
      async getSubscribersForUser(userId, filters) {
        const conditions = [eq(subscribers.userId, userId)];
        if (filters?.status) {
          conditions.push(eq(subscribers.status, filters.status));
        }
        const [{ count }] = await db.select({ count: sql2`count(*)::int` }).from(subscribers).where(and(...conditions));
        const total = count || 0;
        const page = filters?.page || 1;
        const pageSize = Math.min(filters?.pageSize || 20, 100);
        const offset = (page - 1) * pageSize;
        const subscribers2 = await db.select().from(subscribers).where(and(...conditions)).orderBy(desc(subscribers.lastUpdated)).limit(pageSize).offset(offset);
        return { subscribers: subscribers2, total };
      }
      async getSubscriber(id) {
        const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.id, id));
        return subscriber || void 0;
      }
      async upsertSubscriber(data) {
        const [existing] = await db.select().from(subscribers).where(
          and(
            eq(subscribers.userId, data.userId),
            eq(subscribers.phone, data.phone)
          )
        );
        const now = /* @__PURE__ */ new Date();
        if (existing) {
          const updateData = {
            status: data.status,
            lastUpdated: now
          };
          if (data.name !== void 0) {
            updateData.name = data.name;
          }
          if (data.status === "subscribed") {
            updateData.subscribedAt = now;
            updateData.unsubscribedAt = null;
          } else if (data.status === "unsubscribed") {
            updateData.unsubscribedAt = now;
          }
          const [updated] = await db.update(subscribers).set(updateData).where(eq(subscribers.id, existing.id)).returning();
          return updated;
        } else {
          const insertData = {
            userId: data.userId,
            phone: data.phone,
            name: data.name || "",
            status: data.status,
            lastUpdated: now
          };
          if (data.status === "subscribed") {
            insertData.subscribedAt = now;
          } else if (data.status === "unsubscribed") {
            insertData.unsubscribedAt = now;
          }
          const [created] = await db.insert(subscribers).values(insertData).returning();
          return created;
        }
      }
      async updateSubscriber(id, data) {
        const [subscriber] = await db.update(subscribers).set({ ...data, lastUpdated: /* @__PURE__ */ new Date() }).where(eq(subscribers.id, id)).returning();
        return subscriber || void 0;
      }
      async deleteSubscriber(id) {
        await db.delete(subscribers).where(eq(subscribers.id, id));
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/whapi.ts
var whapi_exports = {};
__export(whapi_exports, {
  buildAndSendNodeMessage: () => buildAndSendNodeMessage,
  createWhapiChannel: () => createWhapiChannel,
  deleteWhapiChannel: () => deleteWhapiChannel,
  extendWhapiChannel: () => extendWhapiChannel,
  getChannelQRCode: () => getChannelQRCode,
  getChannelStatus: () => getChannelStatus,
  getWhapiChannel: () => getWhapiChannel,
  getWhapiConfig: () => getWhapiConfig,
  logoutChannel: () => logoutChannel,
  sendCarouselMessage: () => sendCarouselMessage,
  sendInteractiveMessage: () => sendInteractiveMessage,
  sendLocationMessage: () => sendLocationMessage,
  sendMediaMessage: () => sendMediaMessage,
  sendTextMessage: () => sendTextMessage,
  sendWhapiMessage: () => sendWhapiMessage,
  testWhapiConnection: () => testWhapiConnection
});
async function getWhapiConfig() {
  const partnerToken = process.env.WHAPI_PARTNER_TOKEN || (await storage.getSetting("whapi_partner_token"))?.value || "";
  const baseUrl = process.env.WHAPI_BASE || (await storage.getSetting("whapi_base_url"))?.value || "https://manager.whapi.cloud";
  const projectId = process.env.WHAPI_PROJECT_ID || (await storage.getSetting("whapi_project_id"))?.value || DEFAULT_WHAPI_PROJECT_ID;
  return { partnerToken, baseUrl, projectId };
}
async function testWhapiConnection() {
  try {
    const { partnerToken, baseUrl } = await getWhapiConfig();
    if (!partnerToken) {
      return { success: false, message: "WHAPI Partner Token not configured" };
    }
    if (!partnerToken.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Invalid token format. Token should start with 'Bearer '"
      };
    }
    return {
      success: true,
      message: "API token configured successfully. Connection will be verified when creating channels."
    };
  } catch (error) {
    return { success: false, message: `Connection test failed: ${error.message}` };
  }
}
async function createWhapiChannel(channelName, phone) {
  const { partnerToken, baseUrl, projectId } = await getWhapiConfig();
  console.log("Creating WHAPI channel with projectId:", projectId);
  const response = await fetch(`${baseUrl}/channels`, {
    method: "PUT",
    headers: {
      "Authorization": partnerToken,
      // Token already includes "Bearer "
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: channelName,
      phone,
      projectId
      // WHAPI expects camelCase "projectId"
    })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create WHAPI channel: ${error}`);
  }
  return await response.json();
}
async function getWhapiChannel(whapiChannelId) {
  const { partnerToken, baseUrl } = await getWhapiConfig();
  const response = await fetch(`${baseUrl}/channels/${whapiChannelId}`, {
    headers: {
      "Authorization": partnerToken,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get WHAPI channel: ${error}`);
  }
  return await response.json();
}
async function getChannelQRCode(channelToken) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch("https://gate.whapi.cloud/users/login?wakeup=true", {
    headers: {
      "Authorization": authToken,
      "Accept": "application/json"
    }
  });
  if (response.status === 409) {
    return {
      httpStatus: 409,
      alreadyAuthenticated: true,
      message: "Channel already authenticated"
    };
  }
  if (response.status === 406 || response.status === 422) {
    const errorData = await response.json().catch(() => ({}));
    return {
      httpStatus: response.status,
      error: true,
      message: errorData.error?.message || "QR code expired or invalid"
    };
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to get QR code (status ${response.status})`);
  }
  const data = await response.json();
  return {
    httpStatus: 200,
    ...data
  };
}
async function getChannelStatus(whapiChannelId, channelToken) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch(`https://gate.whapi.cloud/channels/${whapiChannelId}`, {
    headers: {
      "Authorization": authToken,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to get channel status (status ${response.status})`);
  }
  return await response.json();
}
async function logoutChannel(channelToken) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch("https://gate.whapi.cloud/users/logout", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to logout channel (status ${response.status})`);
  }
  return await response.json();
}
async function extendWhapiChannel(whapiChannelId, days, comment = "Auto top-up") {
  const { partnerToken, baseUrl } = await getWhapiConfig();
  const response = await fetch(`${baseUrl}/channels/${whapiChannelId}/extend`, {
    method: "POST",
    headers: {
      "Authorization": partnerToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ days, comment })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to extend channel: ${error}`);
  }
  return await response.json();
}
async function sendWhapiMessage(channelToken, payload) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch("https://gate.whapi.cloud/messages/text", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send message: ${error}`);
  }
  return await response.json();
}
async function deleteWhapiChannel(whapiChannelId) {
  const { partnerToken, baseUrl } = await getWhapiConfig();
  const response = await fetch(`${baseUrl}/channels/${whapiChannelId}`, {
    method: "DELETE",
    headers: {
      "Authorization": partnerToken,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete channel: ${error}`);
  }
  return { success: true };
}
async function sendInteractiveMessage(channelToken, payload) {
  if (!channelToken) {
    throw new Error("Channel token is required but was not found. Please ensure the channel has a valid token.");
  }
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch("https://gate.whapi.cloud/messages/interactive", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    console.error(`[WHAPI] sendInteractiveMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData,
      errorMessage: errorData?.error || errorData?.message || errorData?.rawError
    });
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI error");
  }
  return await response.json();
}
async function sendCarouselMessage(channelToken, payload) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch("https://gate.whapi.cloud/messages/carousel", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    console.error(`[WHAPI] sendCarouselMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData
    });
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI carousel send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI carousel error");
  }
  return await response.json();
}
async function sendTextMessage(channelToken, payload) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch("https://gate.whapi.cloud/messages/text", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    console.error(`[WHAPI] sendTextMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData
    });
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI text send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI text error");
  }
  return await response.json();
}
async function sendMediaMessage(channelToken, payload) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const mediaTypeMap = {
    "Image": "image",
    "Video": "video",
    "Audio": "audio",
    "Document": "document",
    "Voice": "voice",
    "GIF": "gif",
    "Sticker": "sticker"
  };
  const whapiMediaType = mediaTypeMap[payload.mediaType || "Document"] || "document";
  console.log(`Sending ${whapiMediaType} message with payload:`, JSON.stringify(payload, null, 2));
  const mediaPayload = {
    to: payload.to,
    media: payload.media
  };
  if (payload.caption) {
    mediaPayload.caption = payload.caption;
  }
  const response = await fetch(`https://gate.whapi.cloud/messages/${whapiMediaType}`, {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(mediaPayload)
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    console.error(`[WHAPI] sendMediaMessage failed:`, {
      status: response.status,
      mediaType: whapiMediaType,
      errorText: errorText.substring(0, 500),
      errorData
    });
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI media send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI media error");
  }
  return await response.json();
}
async function sendLocationMessage(channelToken, payload) {
  const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
  const response = await fetch("https://gate.whapi.cloud/messages/location", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let errorData = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { rawError: errorText };
    }
    console.error(`[WHAPI] sendLocationMessage failed:`, {
      status: response.status,
      errorText: errorText.substring(0, 500),
      errorData
    });
    const errorMessage = errorData?.error || errorData?.message || errorData?.rawError || `WHAPI location send failed (status ${response.status})`;
    throw new Error(errorMessage || "Unknown WHAPI location error");
  }
  return await response.json();
}
async function buildAndSendNodeMessage(channel, phone, nodeType, config) {
  const channelToken = channel.whapiChannelToken;
  let payload = {
    to: phone
  };
  if (nodeType === "quickReply") {
    if (config.headerText) payload.header = { text: config.headerText };
    payload.body = { text: config.bodyText || "No message" };
    if (config.footerText) payload.footer = { text: config.footerText };
    const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => ({
      type: "quick_reply",
      title: btn.title,
      id: btn.id
    }));
    payload.action = { buttons };
    payload.type = "button";
  } else if (nodeType === "quickReplyImage") {
    payload.body = { text: config.bodyText || "No message" };
    if (config.footerText) payload.footer = { text: config.footerText };
    const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => ({
      type: "quick_reply",
      title: btn.title,
      id: btn.id
    }));
    payload.action = { buttons };
    payload.type = "button";
    payload.media = config.mediaUrl;
  } else if (nodeType === "quickReplyVideo") {
    payload.body = { text: config.bodyText || "No message" };
    if (config.footerText) payload.footer = { text: config.footerText };
    const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => ({
      type: "quick_reply",
      title: btn.title,
      id: btn.id
    }));
    payload.action = { buttons };
    payload.type = "button";
    payload.media = config.mediaUrl;
    payload.no_encode = true;
  } else if (nodeType === "listMessage") {
    if (config.headerText) payload.header = { text: config.headerText };
    payload.body = { text: config.bodyText || "No message" };
    if (config.footerText) payload.footer = { text: config.footerText };
    const sections = (config.sections || []).map((section) => ({
      title: section.title || "Options",
      rows: (section.rows || []).filter((row) => row.title && row.id).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description || ""
      }))
    }));
    payload.action = {
      list: {
        sections,
        label: config.buttonLabel || "Choose option"
      }
    };
    payload.type = "list";
  } else if (nodeType === "buttons") {
    if (config.headerText) payload.header = { text: config.headerText };
    payload.body = { text: config.bodyText || "No message" };
    if (config.footerText) payload.footer = { text: config.footerText };
    const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => {
      if (btn.kind === "phone_number") {
        return {
          type: "call",
          title: btn.title,
          id: btn.id,
          phone_number: btn.value
        };
      } else if (btn.kind === "url") {
        return {
          type: "url",
          title: btn.title,
          id: btn.id,
          url: btn.value
        };
      }
      return null;
    }).filter(Boolean);
    payload.action = { buttons };
    payload.type = "button";
  } else if (nodeType === "message.text") {
    const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
    return await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken
      },
      body: JSON.stringify({
        to: phone,
        body: config.text || "Thank you!"
      })
    }).then((res) => res.json());
  } else if (nodeType === "message.media") {
    const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
    const mediaType = config.mediaType || "image";
    const mediaPayload = {
      to: phone,
      media: config.mediaUrl
      // Direct URL to media file
    };
    if (config.caption) {
      mediaPayload.caption = config.caption;
    }
    return await fetch(`https://gate.whapi.cloud/messages/${mediaType}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken
      },
      body: JSON.stringify(mediaPayload)
    }).then((res) => res.json());
  } else if (nodeType === "message.location") {
    const authToken = channelToken.startsWith("Bearer ") ? channelToken : `Bearer ${channelToken}`;
    const locationPayload = {
      to: phone,
      latitude: parseFloat(config.latitude || "0"),
      longitude: parseFloat(config.longitude || "0")
    };
    if (config.name) locationPayload.name = config.name;
    if (config.address) locationPayload.address = config.address;
    return await fetch("https://gate.whapi.cloud/messages/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken
      },
      body: JSON.stringify(locationPayload)
    }).then((res) => res.json());
  } else if (nodeType === "carousel") {
    return await sendCarouselMessage(channelToken, {
      to: phone,
      body: { text: config.bodyText || "Check out our offerings!" },
      cards: (config.cards || []).map((card) => ({
        id: card.id,
        media: { media: card.media },
        text: card.text,
        buttons: (card.buttons || []).map((btn) => {
          if (btn.type === "url") {
            return {
              type: "url",
              title: btn.title,
              id: btn.id,
              url: btn.url
            };
          } else {
            return {
              type: "quick_reply",
              title: btn.title,
              id: btn.id
            };
          }
        })
      }))
    });
  } else {
    throw new Error(`Unsupported node type: ${nodeType}`);
  }
  return await sendInteractiveMessage(channelToken, payload);
}
var DEFAULT_WHAPI_PROJECT_ID;
var init_whapi = __esm({
  "server/whapi.ts"() {
    "use strict";
    init_storage();
    DEFAULT_WHAPI_PROJECT_ID = "HPN0HOhFfDL1GFg154Pl";
  }
});

// server/workflows/httpExecutor.ts
var httpExecutor_exports = {};
__export(httpExecutor_exports, {
  performHttpRequest: () => performHttpRequest,
  resolveTemplate: () => resolveTemplate
});
function resolveTemplate(template, context) {
  if (!template) return "";
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path6) => {
    const trimmedPath = path6.trim();
    const value = getNestedValue(context, trimmedPath);
    return value !== void 0 && value !== null ? String(value) : "";
  });
}
function getNestedValue(obj, path6) {
  if (!path6) return obj;
  const parts = path6.split(".");
  let current = obj;
  for (const part of parts) {
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2]);
      current = current?.[key]?.[index];
    } else {
      current = current?.[part];
    }
    if (current === void 0 || current === null) {
      return void 0;
    }
  }
  return current;
}
function validateUrl(urlString, allowedDomains) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") {
      throw new Error("Only HTTPS URLs are allowed for security. Please use https:// instead of http://");
    }
    if (allowedDomains.length === 0) {
      throw new Error("HTTP Request nodes are disabled. Admin must configure allowed domains in Admin \u2192 Settings \u2192 HTTP Request Allowlist before using this feature.");
    }
    const hostname = url.hostname.toLowerCase();
    const isAllowed = allowedDomains.some((domain) => {
      const normalizedDomain = domain.toLowerCase().trim();
      return hostname === normalizedDomain || hostname.endsWith("." + normalizedDomain);
    });
    if (!isAllowed) {
      throw new Error(`Domain "${hostname}" is not in the allowlist. Allowed domains: ${allowedDomains.join(", ")}`);
    }
  } catch (error) {
    if (error.message.includes("Invalid URL")) {
      throw new Error("Invalid URL format. Please check the URL syntax.");
    }
    throw error;
  }
}
function extractMappedVariables(data, responseMapping) {
  const variables = {};
  if (!responseMapping || responseMapping.length === 0) {
    return variables;
  }
  for (const mapping of responseMapping) {
    if (!mapping.jsonPath || !mapping.variableName) continue;
    try {
      const value = getNestedValue(data, mapping.jsonPath);
      if (value !== void 0 && value !== null) {
        variables[mapping.variableName] = value;
      }
    } catch {
    }
  }
  return variables;
}
async function loadAllowedDomains() {
  try {
    const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const setting = await storage2.getSetting("http_allowed_domains");
    return setting?.value ? JSON.parse(setting.value) : [];
  } catch (error) {
    console.error("[HTTP Executor] Failed to load allowed domains:", error);
    return [];
  }
}
async function performHttpRequest(config, context) {
  const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
  const DEFAULT_TIMEOUT = 1e4;
  try {
    const allowedDomains = await loadAllowedDomains();
    const resolvedUrl = resolveTemplate(config.url, context);
    validateUrl(resolvedUrl, allowedDomains);
    const url = new URL(resolvedUrl);
    if (config.queryParams) {
      for (const param of config.queryParams) {
        if (param.name && param.value) {
          const resolvedValue = resolveTemplate(param.value, context);
          url.searchParams.append(param.name, resolvedValue);
        }
      }
    }
    const headers = {
      "User-Agent": "OmniPlus-Workflow/1.0"
    };
    if (config.authType === "bearer" && config.bearerToken) {
      const resolvedToken = resolveTemplate(config.bearerToken, context);
      headers["Authorization"] = `Bearer ${resolvedToken}`;
    } else if (config.authType === "basic" && config.basicUsername && config.basicPassword) {
      const resolvedUsername = resolveTemplate(config.basicUsername, context);
      const resolvedPassword = resolveTemplate(config.basicPassword, context);
      const credentials = Buffer.from(`${resolvedUsername}:${resolvedPassword}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    }
    if (config.headers) {
      for (const header of config.headers) {
        if (header.name && header.value) {
          const resolvedValue = resolveTemplate(header.value, context);
          headers[header.name] = resolvedValue;
        }
      }
    }
    let body;
    if (config.body && ["POST", "PUT", "PATCH"].includes(config.method)) {
      const resolvedBody = resolveTemplate(config.body, context);
      if (config.bodyContentType === "json") {
        headers["Content-Type"] = "application/json";
        try {
          JSON.parse(resolvedBody);
          body = resolvedBody;
        } catch {
          throw new Error("Request body is not valid JSON");
        }
      } else {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = resolvedBody;
      }
    }
    const timeout = typeof config.timeout === "string" ? parseInt(config.timeout) : config.timeout || DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url.toString(), {
        method: config.method,
        headers,
        body,
        redirect: "manual",
        // CRITICAL: Disable redirects for security
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status >= 300 && response.status < 400) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: "HTTP redirects are not supported for security reasons. Please use the final URL directly."
        };
      }
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: `Response size (${contentLength} bytes) exceeds 5MB limit`
        };
      }
      const rawResponse = await response.text();
      if (rawResponse.length > MAX_RESPONSE_SIZE) {
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          error: `Response size (${rawResponse.length} bytes) exceeds 5MB limit`
        };
      }
      let data;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(rawResponse);
        } catch {
          data = rawResponse;
        }
      } else {
        data = rawResponse;
      }
      const mappedVariables = extractMappedVariables(data, config.responseMapping);
      const success = response.status >= 200 && response.status < 300;
      return {
        success,
        status: response.status,
        statusText: response.statusText,
        data,
        mappedVariables,
        rawResponse
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        return {
          success: false,
          error: `Request timeout after ${timeout}ms`
        };
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("[HTTP Executor] Request failed:", error);
    return {
      success: false,
      error: error.message || "HTTP request failed"
    };
  }
}
var init_httpExecutor = __esm({
  "server/workflows/httpExecutor.ts"() {
    "use strict";
  }
});

// server/index.ts
import "dotenv/config";
import express2 from "express";
import cookieParser from "cookie-parser";
import path5 from "path";

// server/routes.ts
init_storage();
init_db();
init_schema();
init_schema();
import { eq as eq2, and as and2, inArray, desc as desc2, gte, sql as sql3 } from "drizzle-orm";

// server/auth.ts
init_storage();
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
var JWT_SECRET = process.env.SESSION_SECRET || "change_me_in_production";
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}
function generateToken(userId, impersonatedUserId) {
  const payload = { userId };
  if (impersonatedUserId) {
    payload.impersonatedUserId = impersonatedUserId;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  const authenticatedUser = await storage.getUser(payload.userId);
  if (!authenticatedUser) {
    return res.status(401).json({ error: "User not found" });
  }
  if (authenticatedUser.status === "banned") {
    res.clearCookie("token");
    return res.status(403).json({
      error: "Account suspended",
      message: "Your account has been suspended. Please contact support for assistance."
    });
  }
  if (payload.impersonatedUserId) {
    const impersonatedUser = await storage.getUser(payload.impersonatedUserId);
    if (!impersonatedUser) {
      res.clearCookie("token");
      return res.status(401).json({
        error: "Impersonated user not found. Please log in again."
      });
    }
    if (impersonatedUser.status === "banned") {
      res.clearCookie("token");
      return res.status(403).json({
        error: "Impersonated user account has been suspended. Please log in again."
      });
    }
    req.user = authenticatedUser;
    req.userId = authenticatedUser.id;
    req.impersonatedUser = impersonatedUser;
    req.isImpersonating = true;
  } else {
    req.user = authenticatedUser;
    req.userId = authenticatedUser.id;
  }
  next();
}
async function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// server/routes.ts
init_schema();
import { z as z2 } from "zod";

// server/paypal.ts
import {
  Client,
  Environment,
  LogLevel,
  OAuthAuthorizationController,
  OrdersController
} from "@paypal/paypal-server-sdk";
var { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT } = process.env;
if (!PAYPAL_CLIENT_ID) {
  throw new Error("Missing PAYPAL_CLIENT_ID");
}
if (!PAYPAL_CLIENT_SECRET) {
  throw new Error("Missing PAYPAL_CLIENT_SECRET");
}
var client = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: PAYPAL_CLIENT_ID,
    oAuthClientSecret: PAYPAL_CLIENT_SECRET
  },
  timeout: 0,
  environment: PAYPAL_ENVIRONMENT === "production" ? Environment.Production : Environment.Sandbox,
  logging: {
    logLevel: LogLevel.Info,
    logRequest: {
      logBody: true
    },
    logResponse: {
      logHeaders: true
    }
  }
});
var ordersController = new OrdersController(client);
var oAuthAuthorizationController = new OAuthAuthorizationController(client);
async function getClientToken() {
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const { result } = await oAuthAuthorizationController.requestToken(
    {
      authorization: `Basic ${auth}`
    },
    { intent: "sdk_init", response_type: "client_token" }
  );
  return result.accessToken;
}
async function createPaypalOrder(req, res) {
  try {
    const { amount, currency, intent } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: "Invalid amount. Amount must be a positive number."
      });
    }
    if (!currency) {
      return res.status(400).json({ error: "Invalid currency. Currency is required." });
    }
    if (!intent) {
      return res.status(400).json({ error: "Invalid intent. Intent is required." });
    }
    const collect = {
      body: {
        intent,
        purchaseUnits: [
          {
            amount: {
              currencyCode: currency,
              value: amount
            }
          }
        ]
      },
      prefer: "return=minimal"
    };
    const { body, ...httpResponse } = await ordersController.createOrder(collect);
    const jsonResponse = JSON.parse(String(body));
    const httpStatusCode = httpResponse.statusCode;
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
}
async function capturePaypalOrder(req, res) {
  try {
    const { orderID } = req.params;
    const collect = {
      id: orderID,
      prefer: "return=minimal"
    };
    const { body, ...httpResponse } = await ordersController.captureOrder(collect);
    const jsonResponse = JSON.parse(String(body));
    const httpStatusCode = httpResponse.statusCode;
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
}
async function loadPaypalDefault(req, res) {
  const clientToken = await getClientToken();
  res.json({
    clientToken
  });
}
async function verifyPayPalOrder(orderId) {
  try {
    const { body, ...httpResponse } = await ordersController.getOrder({
      id: orderId
    });
    const orderDetails = JSON.parse(String(body));
    return {
      success: httpResponse.statusCode === 200,
      status: orderDetails.status,
      amount: orderDetails.purchase_units?.[0]?.amount?.value,
      currency: orderDetails.purchase_units?.[0]?.amount?.currency_code,
      payerEmail: orderDetails.payer?.email_address,
      orderDetails
    };
  } catch (error) {
    console.error("Failed to verify PayPal order:", error);
    return {
      success: false,
      status: null,
      amount: null,
      currency: null,
      payerEmail: null,
      orderDetails: null
    };
  }
}

// server/paypal-webhooks.ts
var { PAYPAL_CLIENT_ID: PAYPAL_CLIENT_ID2, PAYPAL_CLIENT_SECRET: PAYPAL_CLIENT_SECRET2 } = process.env;
var baseURL = process.env.NODE_ENV === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
var cachedAccessToken = null;
var tokenExpiry = 0;
async function generateAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID2}:${PAYPAL_CLIENT_SECRET2}`
  ).toString("base64");
  const response = await fetch(`${baseURL}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to generate PayPal access token: ${response.statusText}`);
  }
  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1e3;
  return cachedAccessToken;
}
async function verifyWebhookSignature(req, webhookId) {
  try {
    const headers = {
      "paypal-auth-algo": req.headers["paypal-auth-algo"],
      "paypal-cert-url": req.headers["paypal-cert-url"],
      "paypal-transmission-id": req.headers["paypal-transmission-id"],
      "paypal-transmission-sig": req.headers["paypal-transmission-sig"],
      "paypal-transmission-time": req.headers["paypal-transmission-time"]
    };
    if (!headers["paypal-transmission-id"] || !headers["paypal-transmission-sig"]) {
      console.error("[PayPal Webhook] Missing required PayPal headers");
      return false;
    }
    const accessToken = await generateAccessToken();
    const verifyUrl = `${baseURL}/v1/notifications/verify-webhook-signature`;
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: req.body
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error("[PayPal Webhook] Verification API error:", errorData);
      return false;
    }
    const data = await response.json();
    return data.verification_status === "SUCCESS";
  } catch (error) {
    console.error("[PayPal Webhook] Verification error:", error);
    return false;
  }
}

// server/routes.ts
init_whapi();
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// server/workflows/httpNodeExecutor.ts
init_httpExecutor();
function buildExecutionContext(conversationState, incomingMessage, userMetadata) {
  const context = {
    // User information
    phone: userMetadata.phone || incomingMessage.from || "",
    name: userMetadata.name || "",
    email: userMetadata.email || "",
    // Incoming message data
    message: {
      text: incomingMessage.text?.body || "",
      from: incomingMessage.from || "",
      timestamp: incomingMessage.timestamp || Date.now()
    },
    // Conversation state context (includes variables from previous nodes)
    ...conversationState.context || {}
  };
  return context;
}
async function executeHttpNode(node, conversationState, incomingMessage = {}, userMetadata = {}) {
  try {
    const config = {
      method: node.data?.config?.method || "GET",
      url: node.data?.config?.url || "",
      authType: node.data?.config?.authType || "none",
      bearerToken: node.data?.config?.bearerToken,
      basicUsername: node.data?.config?.basicUsername,
      basicPassword: node.data?.config?.basicPassword,
      headers: node.data?.config?.headers || [],
      queryParams: node.data?.config?.queryParams || [],
      bodyContentType: node.data?.config?.bodyContentType || "json",
      body: node.data?.config?.body,
      responseMapping: node.data?.config?.responseMapping || [],
      timeout: node.data?.config?.timeout
    };
    const executionContext = buildExecutionContext(conversationState, incomingMessage, userMetadata);
    const result = await performHttpRequest(config, executionContext);
    const stateUpdate = {
      status: result.status,
      statusText: result.statusText,
      data: result.data,
      mappedVariables: result.mappedVariables || {},
      error: result.error,
      executedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const nextHandle = result.success ? "success" : "error";
    const contextUpdate = {
      ...conversationState.context
    };
    contextUpdate.http = contextUpdate.http || {};
    contextUpdate.http[node.id] = stateUpdate;
    if (result.mappedVariables) {
      Object.assign(contextUpdate, result.mappedVariables);
    }
    return {
      success: result.success,
      nextHandle,
      result,
      stateUpdate: contextUpdate
    };
  } catch (error) {
    console.error("[HTTP Node Executor] Execution failed:", error);
    const errorStateUpdate = {
      error: error.message || "HTTP request execution failed",
      executedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const contextUpdate = {
      ...conversationState.context
    };
    contextUpdate.http = contextUpdate.http || {};
    contextUpdate.http[node.id] = errorStateUpdate;
    return {
      success: false,
      nextHandle: "error",
      result: {
        success: false,
        error: error.message || "Execution failed"
      },
      stateUpdate: contextUpdate
    };
  }
}
function getNextNodeByHandle(currentNodeId, handleType, edges) {
  const edge = edges.find(
    (e) => e.source === currentNodeId && (e.sourceHandle === handleType || e.sourceHandle === `${currentNodeId}-${handleType}`)
  );
  return edge?.target || null;
}

// server/routes.ts
dayjs.extend(utc);
dayjs.extend(timezone);
function getEffectiveUserId(req) {
  return req.impersonatedUser?.id || req.userId;
}
function getDaysFromBillingPeriod(billingPeriod) {
  switch (billingPeriod) {
    case "MONTHLY":
      return 30;
    case "QUARTERLY":
      return 90;
    case "SEMI_ANNUAL":
      return 180;
    case "ANNUAL":
      return 365;
  }
}
async function getPhonebookLimit(userId) {
  const user = await storage.getUser(userId);
  if (!user) {
    console.log(`[PhonebookLimit] User ${userId} not found`);
    return null;
  }
  if (user.phonebookLimit !== null && user.phonebookLimit !== void 0) {
    console.log(`[PhonebookLimit] User ${userId} has override: ${user.phonebookLimit}`);
    const normalizedLimit = user.phonebookLimit < 0 ? null : user.phonebookLimit;
    console.log(`[PhonebookLimit] Normalized override: ${normalizedLimit}`);
    return normalizedLimit;
  }
  const activeSubscriptions = await db.query.subscriptions.findMany({
    where: (subscriptions2, { eq: eq3, and: and3 }) => and3(
      eq3(subscriptions2.userId, userId),
      eq3(subscriptions2.status, "ACTIVE")
    )
  });
  if (activeSubscriptions.length === 0) {
    console.log(`[PhonebookLimit] User ${userId} has no active subscription - unlimited`);
    return null;
  }
  console.log(`[PhonebookLimit] User ${userId} has ${activeSubscriptions.length} active subscriptions`);
  let mostPermissiveLimit = null;
  for (const subscription of activeSubscriptions) {
    const plan = await storage.getPlan(subscription.planId);
    if (!plan) continue;
    const planLimit = plan.phonebookLimit ?? null;
    const normalizedPlanLimit = planLimit !== null && planLimit < 0 ? null : planLimit;
    console.log(`[PhonebookLimit] Plan ${plan.name} (ID ${plan.id}) limit: ${normalizedPlanLimit}`);
    if (normalizedPlanLimit === null) {
      console.log(`[PhonebookLimit] Found unlimited plan - returning unlimited`);
      return null;
    }
    if (mostPermissiveLimit === null || normalizedPlanLimit > mostPermissiveLimit) {
      mostPermissiveLimit = normalizedPlanLimit;
    }
  }
  console.log(`[PhonebookLimit] Final most permissive limit: ${mostPermissiveLimit}`);
  return mostPermissiveLimit;
}
function registerRoutes(app2) {
  app2.get("/api/paypal/config", async (req, res) => {
    try {
      const environment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
      res.json({ environment });
    } catch (e) {
      console.error("Failed to get PayPal config", e);
      res.status(500).json({ error: "Failed to get PayPal config" });
    }
  });
  app2.get("/paypal/setup", async (req, res) => {
    try {
      await loadPaypalDefault(req, res);
    } catch (error) {
      console.error("PayPal setup error:", error);
      res.status(500).json({
        error: "PayPal service unavailable. Please check your PayPal credentials."
      });
    }
  });
  app2.post("/paypal/order", async (req, res) => {
    await createPaypalOrder(req, res);
  });
  app2.post("/paypal/order/:orderID/capture", async (req, res) => {
    await capturePaypalOrder(req, res);
  });
  app2.post("/webhooks/paypal", async (req, res) => {
    try {
      const webhookPayload = req.body;
      const eventType = webhookPayload.event_type;
      const eventId = webhookPayload.id;
      console.log(`[PayPal Webhook] Received event: ${eventType} (ID: ${eventId})`);
      if (!eventId || !eventType) {
        console.error("[PayPal Webhook] Missing event ID or type");
        return res.status(400).json({ error: "Invalid webhook payload" });
      }
      const webhookId = process.env.PAYPAL_WEBHOOK_ID;
      if (!webhookId) {
        console.error("[PayPal Webhook] PAYPAL_WEBHOOK_ID not configured");
        return res.status(500).json({ error: "Webhook not configured" });
      }
      const isValid = await verifyWebhookSignature(req, webhookId);
      if (!isValid) {
        console.error("[PayPal Webhook] Signature verification failed");
        return res.status(401).json({ error: "Unauthorized" });
      }
      let webhookEvent = await storage.getWebhookEvent("paypal", eventId);
      if (webhookEvent && webhookEvent.processed) {
        console.log(`[PayPal Webhook] Event already processed successfully: ${eventId}`);
        return res.status(200).json({ message: "Event already processed" });
      }
      if (!webhookEvent) {
        webhookEvent = await storage.createWebhookEvent({
          provider: "paypal",
          eventId,
          eventType,
          payload: webhookPayload
        });
      } else {
        console.log(`[PayPal Webhook] Retrying failed event: ${eventId}`);
      }
      if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
        try {
          const resource = webhookPayload.resource;
          const captureId = resource.id;
          const amount = parseFloat(resource.amount.value);
          const currency = resource.amount.currency_code;
          const customId = resource.custom_id;
          console.log(`[PayPal Webhook] Processing payment capture:`, {
            captureId,
            amount,
            currency,
            customId
          });
          if (!customId) {
            throw new Error("Missing custom_id in payment capture");
          }
          const metadata = JSON.parse(customId);
          const { userId, channelId, planId, subscriptionId } = metadata;
          if (!userId || !channelId || !planId) {
            throw new Error("Invalid custom_id metadata");
          }
          const plan = await storage.getPlan(planId);
          if (!plan) {
            throw new Error(`Plan not found: ${planId}`);
          }
          const user = await storage.getUser(userId);
          if (!user) {
            throw new Error(`User not found: ${userId}`);
          }
          const channel = await storage.getChannel(channelId);
          if (!channel) {
            throw new Error(`Channel not found: ${channelId}`);
          }
          const daysToAdd = plan.daysGranted || 30;
          await db.transaction(async (tx) => {
            const [ledgerEntry] = await tx.insert(ledger).values({
              userId,
              subscriptionId: subscriptionId || null,
              channelId,
              transactionType: "PAYMENT_IN",
              amount: Math.round(amount * 100),
              currency,
              days: daysToAdd,
              description: `PayPal payment for plan: ${plan.name}`,
              providerTxnId: captureId,
              metadata: {
                planId,
                planName: plan.name,
                eventId
              }
            }).returning();
            const now = /* @__PURE__ */ new Date();
            const [ledgerRecord] = await tx.insert(channelDaysLedger).values({
              channelId,
              days: daysToAdd,
              source: "PAYPAL",
              subscriptionId: subscriptionId || null,
              metadata: {
                planId,
                planName: plan.name,
                captureId,
                ledgerId: ledgerEntry.id
              }
            }).returning();
            const currentExpiresAt = channel.expiresAt ? new Date(channel.expiresAt) : null;
            const startDate = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;
            const newExpiresAt = new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1e3);
            const newStatus = "ACTIVE";
            await tx.update(channels).set({
              status: newStatus,
              activeFrom: channel.activeFrom || now,
              expiresAt: newExpiresAt,
              daysRemaining: daysToAdd,
              lastExtendedAt: now,
              updatedAt: now
            }).where(eq2(channels.id, channelId));
            if (subscriptionId) {
              await tx.update(subscriptions).set({ status: "ACTIVE" }).where(eq2(subscriptions.id, subscriptionId));
            }
            await tx.insert(auditLogs).values({
              actorUserId: null,
              action: "PAYPAL_PAYMENT_COMPLETED",
              meta: {
                entity: "subscription",
                userId,
                channelId,
                planId,
                subscriptionId,
                amount,
                currency,
                daysAdded: daysToAdd,
                captureId
              }
            });
          });
          await storage.markWebhookProcessed(webhookEvent.id);
          console.log(`[PayPal Webhook] Payment processed successfully for channel ${channelId}`);
        } catch (error) {
          console.error("[PayPal Webhook] Processing error:", error);
          return res.status(500).json({ error: "Failed to process payment" });
        }
      } else {
        console.log(`[PayPal Webhook] Ignoring event type: ${eventType}`);
        await storage.markWebhookProcessed(webhookEvent.id);
      }
      res.status(200).json({ message: "Webhook processed" });
    } catch (error) {
      console.error("[PayPal Webhook] Unexpected error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        name,
        email,
        passwordHash,
        role: "user",
        daysBalance: 0,
        status: "active"
      });
      const token = generateToken(user.id);
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Missing credentials" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      if (user.status === "banned") {
        return res.status(403).json({
          error: "Account suspended",
          message: "Your account has been suspended. Please contact support for assistance."
        });
      }
      const token = generateToken(user.id);
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
  });
  app2.get("/api/me", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = req.impersonatedUser?.id || req.userId;
      const effectiveUser = req.impersonatedUser || req.user;
      const user = await storage.getUser(effectiveUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const subscription = await storage.getActiveSubscriptionForUser(user.id);
      let currentPlan = null;
      let effectivePageAccess = null;
      if (subscription) {
        currentPlan = await storage.getPlan(subscription.planId);
        if (currentPlan) {
          effectivePageAccess = {
            ...typeof currentPlan.pageAccess === "object" && currentPlan.pageAccess !== null ? currentPlan.pageAccess : {},
            ...typeof subscription.pageAccess === "object" && subscription.pageAccess !== null ? subscription.pageAccess : {}
          };
        }
      } else {
        const pageAccessSetting = await storage.getSetting("default_page_access");
        effectivePageAccess = pageAccessSetting?.value ? JSON.parse(pageAccessSetting.value) : {
          dashboard: true,
          channels: false,
          safetyMeter: false,
          send: false,
          templates: false,
          workflows: false,
          outbox: false,
          logs: false,
          bulkLogs: false,
          pricing: true,
          phonebooks: false,
          settings: false,
          balances: false,
          whapiSettings: false
        };
      }
      const channels2 = await storage.getChannelsForUser(user.id);
      const channelsUsed = channels2.length;
      const channelsLimit = currentPlan?.channelsLimit || 0;
      const totalDaysRemaining = channels2.reduce((sum, channel) => {
        return sum + (channel.daysRemaining || 0);
      }, 0);
      const startOfToday = /* @__PURE__ */ new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
      const todayJobs = await db.select({
        totalMessages: sql3`COALESCE(SUM(${jobs.total}), 0)`
      }).from(jobs).where(
        and2(
          eq2(jobs.userId, user.id),
          gte(jobs.createdAt, startOfToday),
          sql3`${jobs.createdAt} < ${startOfTomorrow}`
        )
      );
      const messagesSentToday = Number(todayJobs[0]?.totalMessages || 0);
      const { passwordHash: _, ...userWithoutPassword } = user;
      const response = {
        ...userWithoutPassword,
        daysBalance: totalDaysRemaining,
        currentSubscription: subscription,
        currentPlan,
        effectivePageAccess,
        channelsUsed,
        channelsLimit,
        messagesSentToday
      };
      if (req.isImpersonating && req.user) {
        response.impersonation = {
          isImpersonating: true,
          admin: {
            id: req.userId,
            name: req.user.name,
            email: req.user.email
          }
        };
      }
      res.json(response);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user data" });
    }
  });
  app2.get("/api/plans", async (req, res) => {
    try {
      const plans2 = await storage.getPlans();
      console.log("[GET /api/plans] Returning plans with limits:", plans2.map((p) => ({
        id: p.id,
        name: p.name,
        channelsLimit: p.channelsLimit,
        chatbotsLimit: p.chatbotsLimit,
        phonebookLimit: p.phonebookLimit,
        dailyMessagesLimit: p.dailyMessagesLimit,
        bulkMessagesLimit: p.bulkMessagesLimit
      })));
      res.json(plans2);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });
  app2.post("/api/subscribe", requireAuth, async (req, res) => {
    try {
      const { planId, durationType } = req.body;
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      let days = getDaysFromBillingPeriod(plan.billingPeriod);
      if (durationType === "QUARTERLY") {
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 3;
      } else if (durationType === "SEMI_ANNUAL") {
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 6;
      } else if (durationType === "ANNUAL") {
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 12;
      }
      const subscription = await storage.createSubscription({
        userId: req.userId,
        planId: plan.id,
        status: "ACTIVE",
        durationType: durationType || "MONTHLY",
        provider: "DIRECT"
      });
      const user = await storage.getUser(req.userId);
      if (user) {
        await storage.updateUser(req.userId, {
          daysBalance: (user.daysBalance || 0) + days,
          status: "active"
        });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "SUBSCRIBE",
        meta: {
          entity: "subscription",
          entityId: subscription.id,
          planId,
          durationType,
          days
        }
      });
      res.json({ subscription, daysAdded: days });
    } catch (error) {
      console.error("Subscribe error:", error);
      res.status(500).json({ error: "Subscription failed" });
    }
  });
  app2.post("/api/subscribe/paypal/confirm", requireAuth, async (req, res) => {
    try {
      const validationResult = z2.object({
        planId: z2.number(),
        durationType: z2.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
        orderId: z2.string().min(1),
        termsVersion: z2.string().min(1, "Terms acceptance is required")
      }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const { planId, durationType, orderId, termsVersion } = validationResult.data;
      const existingSubscription = await storage.getActiveSubscriptionForUser(req.userId);
      if (existingSubscription && existingSubscription.transactionId === orderId) {
        return res.status(409).json({ error: "This payment has already been processed" });
      }
      const verification = await verifyPayPalOrder(orderId);
      if (!verification.success || verification.status !== "COMPLETED") {
        return res.status(400).json({ error: "Payment verification failed or not completed" });
      }
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      let durationMultiplier = 1;
      let discountMultiplier = 1;
      let days = getDaysFromBillingPeriod(plan.billingPeriod);
      if (durationType === "QUARTERLY") {
        durationMultiplier = 3;
        discountMultiplier = 1 - (plan.quarterlyDiscountPercent || 0) / 100;
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 3;
      } else if (durationType === "SEMI_ANNUAL") {
        durationMultiplier = 6;
        discountMultiplier = 1 - (plan.semiAnnualDiscountPercent || 5) / 100;
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 6;
      } else if (durationType === "ANNUAL") {
        durationMultiplier = 12;
        discountMultiplier = 1 - (plan.annualDiscountPercent || 10) / 100;
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 12;
      }
      const expectedAmount = plan.price ? (plan.price * durationMultiplier * discountMultiplier / 100).toFixed(2) : "0";
      if (verification.amount !== expectedAmount || verification.currency !== plan.currency) {
        return res.status(400).json({
          error: "Payment amount mismatch",
          details: `Expected ${expectedAmount} ${plan.currency} for ${durationType}, got ${verification.amount} ${verification.currency}`
        });
      }
      const mainBalance = await storage.getMainDaysBalance();
      if (mainBalance < days) {
        return res.status(400).json({
          error: "Insufficient admin balance",
          details: `Admin pool has ${mainBalance} days, but ${days} days are needed for this subscription. Please contact support.`
        });
      }
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const userChannels = await storage.getChannelsForUser(req.userId);
      if (userChannels.length === 0) {
        return res.status(400).json({
          error: "No channels found",
          details: "Please create a channel before subscribing."
        });
      }
      const targetChannel = userChannels.find((c) => c.status === "ACTIVE" || c.status === "PENDING") || userChannels[0];
      const newMainBalance = await storage.updateMainDaysBalance(-days);
      const balanceTransaction = await storage.createBalanceTransaction({
        type: "allocate",
        days,
        channelId: targetChannel.id,
        userId: req.userId,
        note: `PayPal subscription - ${plan.name} (${durationType}, ${days} days)`
      });
      const subscription = await storage.createSubscription({
        userId: req.userId,
        planId: plan.id,
        status: "ACTIVE",
        durationType: durationType || "MONTHLY",
        provider: "PAYPAL",
        transactionId: orderId,
        termsVersion,
        agreedAt: /* @__PURE__ */ new Date()
      });
      let whapiResponse = null;
      try {
        if (!targetChannel.whapiChannelId && targetChannel.status === "PENDING") {
          console.log("Creating new WHAPI channel for PayPal subscription:", targetChannel.label);
          whapiResponse = await createWhapiChannel(targetChannel.label, targetChannel.phone);
          await storage.updateChannel(targetChannel.id, {
            whapiChannelId: whapiResponse.id,
            whapiChannelToken: whapiResponse.token,
            phone: whapiResponse.phone || targetChannel.phone,
            whapiStatus: whapiResponse.status,
            stopped: whapiResponse.stopped || false,
            creationTS: whapiResponse.creationTS ? new Date(whapiResponse.creationTS) : null,
            activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null
          });
        } else if (targetChannel.whapiChannelId) {
          console.log("Extending WHAPI channel via PayPal:", targetChannel.whapiChannelId);
          whapiResponse = await extendWhapiChannel(
            targetChannel.whapiChannelId,
            days,
            `PayPal subscription for ${user.email}`
          );
        }
      } catch (whapiError) {
        console.error("WHAPI API failed during PayPal subscription:", whapiError.message);
        await storage.updateMainDaysBalance(days);
        await storage.deleteBalanceTransaction(balanceTransaction.id);
        await storage.updateSubscription(subscription.id, { status: "CANCELLED" });
        return res.status(500).json({
          error: "Failed to activate channel",
          details: whapiError.message
        });
      }
      await storage.addDaysToChannel({
        channelId: targetChannel.id,
        days,
        source: "PAYPAL",
        balanceTransactionId: balanceTransaction.id,
        subscriptionId: subscription.id,
        metadata: {
          orderId,
          planId,
          durationType
        }
      });
      if (whapiResponse) {
        await storage.updateChannel(targetChannel.id, {
          whapiStatus: whapiResponse.status,
          activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null
        });
      }
      await storage.updateUser(req.userId, {
        daysBalance: (user.daysBalance || 0) + days,
        status: "active"
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "SUBSCRIBE",
        meta: {
          entity: "subscription",
          entityId: subscription.id,
          planId,
          durationType,
          days,
          provider: "PAYPAL",
          orderId,
          verified: true,
          amount: verification.amount,
          currency: verification.currency,
          payerEmail: verification.payerEmail,
          mainBalanceBefore: mainBalance,
          mainBalanceAfter: newMainBalance,
          channelId: targetChannel.id,
          whapiExtended: !!whapiResponse
        }
      });
      res.json({ subscription, daysAdded: days, channelExtended: true });
    } catch (error) {
      console.error("PayPal subscription error:", error);
      res.status(500).json({ error: "PayPal subscription failed" });
    }
  });
  app2.post("/api/subscribe/offline", requireAuth, async (req, res) => {
    try {
      console.log("[OfflinePayment] Received request body:", JSON.stringify(req.body, null, 2));
      const validationResult = insertOfflinePaymentSchema.extend({
        userId: z2.number(),
        type: z2.enum(["OFFLINE_PAYMENT", "FREE_TRIAL"]).optional(),
        termsVersion: z2.preprocess(
          (val) => val == null ? void 0 : String(val),
          z2.string().optional()
        )
      }).safeParse({
        ...req.body,
        userId: req.userId,
        status: "PENDING"
      });
      if (!validationResult.success) {
        console.log("[OfflinePayment] Validation failed:", JSON.stringify(validationResult.error.flatten(), null, 2));
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      console.log("[OfflinePayment] Validation successful, data:", JSON.stringify(validationResult.data, null, 2));
      const { planId, amount, currency, reference, proofUrl, requestType, metadata, termsVersion, couponCode } = validationResult.data;
      const submittedDurationType = validationResult.data.durationType;
      const paymentType = validationResult.data.type || "OFFLINE_PAYMENT";
      if (paymentType !== "FREE_TRIAL" && !termsVersion) {
        return res.status(400).json({ error: "Terms acceptance is required" });
      }
      if (proofUrl) {
        if (!proofUrl.startsWith("data:")) {
          return res.status(400).json({ error: "Invalid proof file format. Only base64 data URIs are allowed." });
        }
        if (proofUrl.length > 7e6) {
          return res.status(400).json({ error: "Proof file is too large. Maximum size is 5MB." });
        }
      }
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const durationType = submittedDurationType || "MONTHLY";
      const planData = plan;
      const hasDisplayPricing = planData.displayPrice && planData.displayCurrency;
      const basePlanPrice = currency === planData.displayCurrency && hasDisplayPricing ? planData.displayPrice : plan.price || 0;
      let expectedBasePrice = basePlanPrice;
      if (durationType === "SEMI_ANNUAL") {
        expectedBasePrice = basePlanPrice * 6 * 0.95;
      } else if (durationType === "ANNUAL") {
        expectedBasePrice = basePlanPrice * 12 * 0.9;
      }
      if (paymentType !== "FREE_TRIAL") {
        if (couponCode) {
          const couponValidation = await storage.validateCoupon(couponCode, req.userId, planId);
          if (!couponValidation.valid) {
            return res.status(400).json({ error: couponValidation.message });
          }
          const discountPercent = couponValidation.coupon?.discountPercent || 0;
          const expectedAmount = Math.round(expectedBasePrice * (100 - discountPercent) / 100);
          if (Math.abs(amount - expectedAmount) > 1) {
            return res.status(400).json({
              error: "Amount mismatch",
              details: `Expected ${expectedAmount} cents (${durationType} with ${discountPercent}% coupon), received ${amount} cents`
            });
          }
        } else {
          const expectedAmount = Math.round(expectedBasePrice);
          if (Math.abs(amount - expectedAmount) > 1) {
            return res.status(400).json({
              error: "Amount mismatch",
              details: `Expected ${expectedAmount} cents (${durationType}), received ${amount} cents`
            });
          }
        }
      }
      const payment = await storage.createOfflinePayment({
        userId: req.userId,
        planId,
        type: paymentType,
        amount,
        currency: currency || "USD",
        reference,
        proofUrl,
        couponCode: couponCode || void 0,
        requestType: requestType || "PAID",
        metadata,
        termsVersion,
        status: "PENDING"
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "OFFLINE_PAYMENT_SUBMIT",
        meta: {
          entity: "offline_payment",
          entityId: payment.id,
          planId,
          amount,
          currency,
          requestType: requestType || "PAID",
          metadata
        }
      });
      res.json(payment);
    } catch (error) {
      console.error("Offline payment error:", error);
      res.status(500).json({ error: "Failed to submit payment" });
    }
  });
  app2.get("/api/channels", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const channels2 = await storage.getChannelsForUser(effectiveUserId);
      const now = /* @__PURE__ */ new Date();
      const updatedChannels = [];
      for (const channel of channels2) {
        let updatedChannel = channel;
        if (channel.status === "ACTIVE" && channel.expiresAt && new Date(channel.expiresAt) <= now) {
          if (channel.whapiChannelToken) {
            try {
              await logoutChannel(channel.whapiChannelToken);
              console.log(`Auto-logged out expired channel: ${channel.label}`);
            } catch (error) {
              console.error(`Failed to logout expired channel ${channel.label}:`, error);
            }
          }
          const pausedChannel = await storage.updateChannel(channel.id, {
            status: "PAUSED",
            daysRemaining: 0,
            authStatus: "PENDING",
            whapiStatus: "stopped"
          });
          if (pausedChannel) {
            updatedChannel = pausedChannel;
          }
          await storage.createAuditLog({
            actorUserId: req.userId,
            action: "CHANNEL_EXPIRED",
            meta: {
              channelId: channel.id,
              channelLabel: channel.label,
              expiresAt: channel.expiresAt
            }
          });
        }
        updatedChannels.push(updatedChannel);
      }
      res.json(updatedChannels);
    } catch (error) {
      console.error("Get channels error:", error);
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });
  app2.post("/api/channels", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const validationResult = insertChannelSchema.extend({ userId: z2.number() }).safeParse({
        ...req.body,
        userId: effectiveUserId
      });
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const { label, phone } = validationResult.data;
      const user = await storage.getUser(effectiveUserId);
      const subscription = await storage.getActiveSubscriptionForUser(effectiveUserId);
      if (!subscription) {
        return res.status(403).json({ error: "Active subscription required" });
      }
      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const existingChannels = await storage.getChannelsForUser(effectiveUserId);
      if (existingChannels.length >= plan.channelsLimit) {
        return res.status(403).json({ error: "Channel limit reached for your plan" });
      }
      let whapiResponse;
      try {
        whapiResponse = await createWhapiChannel(label, phone);
        console.log("WHAPI channel created successfully with ID:", whapiResponse.id);
      } catch (whapiError) {
        console.error("WHAPI channel creation failed:", whapiError.message);
        return res.status(500).json({
          error: "Failed to create channel",
          details: whapiError.message
        });
      }
      const channel = await storage.createChannel({
        userId: effectiveUserId,
        label,
        phone: whapiResponse.phone || phone,
        // Use WHAPI-confirmed phone
        status: "PENDING",
        // Always create as PENDING - activation requires days via /extend endpoint
        authStatus: "PENDING",
        // User must scan QR code to authorize
        whapiChannelId: whapiResponse.id,
        whapiChannelToken: whapiResponse.token,
        // Token already includes "Bearer " prefix
        whapiStatus: whapiResponse.status,
        // WHAPI channel status from API
        stopped: whapiResponse.stopped || false,
        creationTS: whapiResponse.creationTS ? new Date(whapiResponse.creationTS) : /* @__PURE__ */ new Date(),
        activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CREATE",
        meta: {
          entity: "channel",
          entityId: channel.id,
          label,
          phone,
          whapiChannelId: whapiResponse.id,
          whapiStatus: whapiResponse.status
        }
      });
      res.json(channel);
    } catch (error) {
      console.error("Create channel error:", error);
      res.status(500).json({ error: "Failed to create channel" });
    }
  });
  app2.get("/api/channels/:id/qr", requireAuth, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      if (channel.expiresAt && new Date(channel.expiresAt) <= /* @__PURE__ */ new Date()) {
        return res.status(400).json({
          error: "Channel has expired. Please extend the channel before scanning QR code."
        });
      }
      if (channel.status !== "ACTIVE") {
        return res.status(400).json({
          error: "Channel must be ACTIVE. Please extend the channel first."
        });
      }
      if (!channel.whapiChannelToken) {
        return res.status(400).json({ error: "Channel token not available. Please contact support." });
      }
      try {
        const qrData = await getChannelQRCode(channel.whapiChannelToken);
        res.json(qrData);
      } catch (whapiError) {
        console.error("Failed to fetch QR code from WHAPI:", whapiError.message);
        res.status(500).json({ error: whapiError.message || "Failed to fetch QR code" });
      }
    } catch (error) {
      console.error("Get QR code error:", error);
      res.status(500).json({ error: "Failed to get QR code" });
    }
  });
  app2.patch("/api/channels/:id/authorize", requireAuth, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      if (channel.expiresAt && new Date(channel.expiresAt) <= /* @__PURE__ */ new Date()) {
        return res.status(400).json({
          error: "Channel has expired. Please add days to your account before authorizing."
        });
      }
      if (channel.status !== "ACTIVE") {
        return res.status(400).json({
          error: "Channel must be ACTIVE to authorize. Please extend the channel first."
        });
      }
      let whapiStatusData = null;
      if (channel.whapiChannelId && channel.whapiChannelToken) {
        try {
          whapiStatusData = await getChannelStatus(channel.whapiChannelId, channel.whapiChannelToken);
          console.log("WHAPI channel status:", whapiStatusData);
        } catch (statusError) {
          console.error("Failed to fetch WHAPI status:", statusError.message);
        }
      }
      const updatedChannel = await storage.updateChannel(channelId, {
        authStatus: "AUTHORIZED",
        stopped: false,
        whapiStatus: whapiStatusData?.status || channel.whapiStatus || "unknown"
      });
      const user = await storage.getUser(req.userId);
      const userChannels = await storage.getChannelsForUser(req.userId);
      const hasActiveChannels = userChannels.some((c) => c.status === "ACTIVE");
      if (hasActiveChannels && user && user.status === "expired") {
        await storage.updateUser(req.userId, { status: "active" });
        console.log(`Updated user ${user.email} status from expired to active after channel authorization`);
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE",
        meta: {
          entity: "channel",
          entityId: channelId,
          field: "authStatus",
          newValue: "AUTHORIZED",
          whapiStatus: whapiStatusData?.status || "unknown",
          userStatusUpdated: hasActiveChannels && user && user.status === "expired"
        }
      });
      res.json(updatedChannel);
    } catch (error) {
      console.error("Authorize channel error:", error);
      res.status(500).json({ error: "Failed to authorize channel" });
    }
  });
  app2.post("/api/channels/:id/logout", requireAuth, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      if (!channel.whapiChannelToken) {
        return res.status(400).json({ error: "Channel token not found" });
      }
      try {
        await logoutChannel(channel.whapiChannelToken);
      } catch (whapiError) {
        console.error("WHAPI logout error:", whapiError.message);
      }
      const updatedChannel = await storage.updateChannel(channelId, {
        authStatus: "PENDING"
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE",
        meta: {
          entity: "channel",
          entityId: channelId,
          field: "authStatus",
          oldValue: "AUTHORIZED",
          newValue: "PENDING"
        }
      });
      res.json(updatedChannel);
    } catch (error) {
      console.error("Logout channel error:", error);
      res.status(500).json({ error: "Failed to logout channel" });
    }
  });
  app2.post("/api/channels/:id/extend", requireAuth, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      if (!channel.whapiChannelId) {
        return res.status(400).json({ error: "Channel not connected to WHAPI" });
      }
      const { days, comment } = req.body;
      if (!days || days <= 0) {
        return res.status(400).json({ error: "Invalid days value" });
      }
      const user = await storage.getUser(req.userId);
      if (!user || user.daysBalance < days) {
        return res.status(403).json({ error: "Insufficient days balance" });
      }
      try {
        await extendWhapiChannel(
          channel.whapiChannelId,
          days,
          comment || `Extension for ${user.email}`
        );
      } catch (whapiError) {
        console.error("Failed to extend WHAPI channel:", whapiError.message);
        return res.status(500).json({
          error: "Failed to extend channel",
          details: whapiError.message
        });
      }
      await storage.updateUser(req.userId, {
        daysBalance: user.daysBalance - days
      });
      const updated = await storage.updateChannel(channelId, { status: "ACTIVE" });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "EXTEND",
        meta: {
          entity: "channel",
          entityId: channelId,
          days,
          daysRemaining: user.daysBalance - days
        }
      });
      res.json({
        success: true,
        channel: updated,
        daysRemaining: user.daysBalance - days
      });
    } catch (error) {
      console.error("Extend channel error:", error);
      res.status(500).json({ error: "Failed to extend channel" });
    }
  });
  app2.delete("/api/channels/:id", requireAuth, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      let remainingDays = 0;
      if (channel.expiresAt) {
        const now = /* @__PURE__ */ new Date();
        const expiresAt = new Date(channel.expiresAt);
        const msRemaining = expiresAt.getTime() - now.getTime();
        const daysRemaining = msRemaining / (24 * 60 * 60 * 1e3);
        remainingDays = Math.max(0, Math.floor(daysRemaining));
      }
      if (channel.whapiChannelId) {
        try {
          await deleteWhapiChannel(channel.whapiChannelId);
          console.log(`WHAPI channel deleted successfully. ${remainingDays} unused days to be refunded.`);
        } catch (whapiError) {
          console.error("Failed to delete WHAPI channel:", whapiError.message);
        }
      }
      if (remainingDays > 0) {
        await storage.updateMainDaysBalance(remainingDays);
        await storage.createBalanceTransaction({
          type: "refund",
          days: remainingDays,
          channelId,
          userId: channel.userId,
          note: `WHAPI delete successful - ${remainingDays} unused days returned`
        });
      }
      await storage.deleteChannel(channelId);
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE",
        meta: {
          entity: "channel",
          entityId: channelId,
          label: channel.label,
          refundedDays: remainingDays
        }
      });
      res.json({
        success: true,
        message: remainingDays > 0 ? `Channel deleted successfully. ${remainingDays} unused days refunded to main balance.` : "Channel deleted successfully.",
        refundedDays: remainingDays
      });
    } catch (error) {
      console.error("Delete channel error:", error);
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });
  app2.get("/api/channels/:id/safety-meter", requireAuth, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      const subscription = await storage.getActiveSubscriptionForUser(req.userId);
      let hasSafetyMeterAccess = false;
      if (subscription) {
        const plan = await storage.getPlan(subscription.planId);
        if (plan) {
          hasSafetyMeterAccess = plan.safetyMeterEnabled === true;
        }
      }
      if (!hasSafetyMeterAccess) {
        return res.status(403).json({
          error: "Safety Meter feature not available",
          message: "This feature is not included in your current plan. Please upgrade to access Safety Meter."
        });
      }
      if (!channel.whapiChannelToken) {
        return res.status(400).json({
          error: "Channel token not found",
          message: "Channel must be authorized before checking Safety Meter."
        });
      }
      const whapiResponse = await fetch("https://tools.whapi.cloud/services/riskOfBlocking", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${channel.whapiChannelToken}`,
          "Content-Type": "application/json"
        }
      });
      if (!whapiResponse.ok) {
        const errorText = await whapiResponse.text();
        console.error("[Safety Meter] WHAPI API error:", errorText);
        return res.status(whapiResponse.status).json({
          error: "Failed to fetch safety metrics",
          message: "Could not retrieve safety metrics from the server. Please try again later."
        });
      }
      const safetyData = await whapiResponse.json();
      console.log("[Safety Meter] WHAPI raw response:", JSON.stringify(safetyData, null, 2));
      res.json(safetyData);
    } catch (error) {
      console.error("Get safety meter error:", error);
      res.status(500).json({ error: "Failed to fetch safety metrics" });
    }
  });
  app2.post("/api/channels/:id/safety-meter/refresh", requireAuth, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      const subscription = await storage.getActiveSubscriptionForUser(req.userId);
      let hasSafetyMeterAccess = false;
      if (subscription) {
        const plan = await storage.getPlan(subscription.planId);
        if (plan) {
          hasSafetyMeterAccess = plan.safetyMeterEnabled === true;
        }
      }
      if (!hasSafetyMeterAccess) {
        return res.status(403).json({
          error: "Safety Meter feature not available",
          message: "This feature is not included in your current plan. Please upgrade to access Safety Meter."
        });
      }
      if (!channel.whapiChannelToken) {
        return res.status(400).json({
          error: "Channel token not found",
          message: "Channel must be authorized before checking Safety Meter."
        });
      }
      const whapiResponse = await fetch("https://tools.whapi.cloud/services/riskOfBlocking", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${channel.whapiChannelToken}`,
          "Content-Type": "application/json"
        }
      });
      if (!whapiResponse.ok) {
        const errorText = await whapiResponse.text();
        console.error("[Safety Meter] WHAPI API refresh error:", errorText);
        if (whapiResponse.status === 429 || errorText.includes("once a day")) {
          return res.status(429).json({
            error: "Rate limit exceeded",
            message: "Safety metrics can only be refreshed once per day. Please try again tomorrow."
          });
        }
        return res.status(whapiResponse.status).json({
          error: "Failed to refresh safety metrics",
          message: "Could not refresh safety metrics. Please try again later."
        });
      }
      const safetyData = await whapiResponse.json();
      console.log("[Safety Meter Refresh] WHAPI raw response:", JSON.stringify(safetyData, null, 2));
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "SAFETY_METER_REFRESH",
        meta: {
          channelId,
          channelLabel: channel.label,
          metrics: safetyData
        }
      });
      res.json(safetyData);
    } catch (error) {
      console.error("Refresh safety meter error:", error);
      res.status(500).json({ error: "Failed to refresh safety metrics" });
    }
  });
  app2.post("/api/messages/send", requireAuth, async (req, res) => {
    try {
      const { channelId, to, header, body, footer, buttons, messageType, mediaUrl } = req.body;
      if (!channelId || !to || !body) {
        return res.status(400).json({ error: "Missing required fields: channelId, to, body" });
      }
      const mediaRequiredTypes = ["image", "image_buttons", "video_buttons", "document"];
      if (mediaRequiredTypes.includes(messageType) && !mediaUrl) {
        return res.status(400).json({
          error: `Media file is required for ${messageType} messages. Please upload a file before sending.`
        });
      }
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      if (channel.status !== "ACTIVE" || channel.authStatus !== "AUTHORIZED") {
        return res.status(400).json({ error: "Channel must be active and authorized" });
      }
      if (channel.expiresAt && new Date(channel.expiresAt) <= /* @__PURE__ */ new Date()) {
        return res.status(400).json({
          error: "Channel has expired. Please extend the channel before sending messages."
        });
      }
      if (!channel.whapiChannelToken) {
        return res.status(400).json({
          error: "Channel is not properly configured. Please contact support or re-authorize this channel."
        });
      }
      const subscription = await storage.getActiveSubscriptionForUser(req.userId);
      if (!subscription) {
        return res.status(400).json({ error: "No active subscription. Please subscribe to a plan." });
      }
      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(500).json({ error: "Plan not found" });
      }
      if (plan.dailyMessagesLimit !== -1) {
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const todaysJobs = await storage.getJobsForUser(req.userId);
        const todaysSingleMessages = todaysJobs.filter((job2) => new Date(job2.createdAt) >= today && job2.type === "SINGLE").reduce((sum, job2) => sum + job2.total, 0);
        if (todaysSingleMessages >= plan.dailyMessagesLimit) {
          return res.status(400).json({
            error: `Daily single message limit reached (${plan.dailyMessagesLimit}). Upgrade plan to send more.`,
            limitReached: true
          });
        }
      }
      const job = await storage.createJob({
        userId: req.userId,
        channelId,
        type: "SINGLE",
        status: "PENDING",
        total: 1,
        queued: 0,
        pending: 1,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replied: 0
      });
      const message = await storage.createMessage({
        jobId: job.id,
        to,
        header,
        body,
        footer,
        buttons: buttons || [],
        status: "PENDING",
        messageType: messageType || "text_buttons",
        mediaUrl: mediaUrl || null
      });
      try {
        let whapiResponse;
        const currentMessageType = messageType || "text_buttons";
        const resolvedMediaUrl = await resolveMediaForWhapi(mediaUrl);
        if (currentMessageType === "text_buttons") {
          const whapiPayload = {
            to,
            type: "button",
            ...header && { header: { text: header } },
            body: { text: body },
            ...footer && { footer: { text: footer } },
            action: {
              buttons: (buttons || []).map((btn) => ({
                type: btn.type || "quick_reply",
                title: btn.text || btn.title || btn,
                id: btn.id || `btn${Math.random().toString(36).substr(2, 9)}`,
                ...btn.type === "url" && btn.value && { url: btn.value },
                ...btn.type === "call" && btn.value && { phone_number: btn.value }
              }))
            }
          };
          whapiResponse = await sendInteractiveMessage(channel.whapiChannelToken, whapiPayload);
        } else if (currentMessageType === "image") {
          whapiResponse = await sendMediaMessage(channel.whapiChannelToken, {
            to,
            media: resolvedMediaUrl || "",
            caption: body,
            mediaType: "Image"
          });
        } else if (currentMessageType === "image_buttons") {
          const imageButtonPayload = {
            to,
            type: "button",
            ...resolvedMediaUrl && { media: resolvedMediaUrl },
            // Media at root level!
            body: { text: body },
            ...footer && { footer: { text: footer } },
            action: {
              buttons: (buttons || []).map((btn) => ({
                type: btn.type || "quick_reply",
                title: btn.text || btn.title || btn,
                id: btn.id || `btn${Math.random().toString(36).substr(2, 9)}`,
                ...btn.type === "url" && btn.value && { url: btn.value },
                ...btn.type === "call" && btn.value && { phone_number: btn.value }
              }))
            }
          };
          console.log(`[Single Send] image_buttons with media at root level`);
          whapiResponse = await sendInteractiveMessage(channel.whapiChannelToken, imageButtonPayload);
        } else if (currentMessageType === "video_buttons") {
          const videoButtonPayload = {
            to,
            type: "button",
            ...resolvedMediaUrl && { media: resolvedMediaUrl },
            // Media at root level!
            body: { text: body },
            ...footer && { footer: { text: footer } },
            action: {
              buttons: (buttons || []).map((btn) => ({
                type: btn.type || "quick_reply",
                title: btn.text || btn.title || btn,
                id: btn.id || `btn${Math.random().toString(36).substr(2, 9)}`,
                ...btn.type === "url" && btn.value && { url: btn.value },
                ...btn.type === "call" && btn.value && { phone_number: btn.value }
              }))
            }
          };
          console.log(`[Single Send] video_buttons with media at root level`);
          whapiResponse = await sendInteractiveMessage(channel.whapiChannelToken, videoButtonPayload);
        } else if (currentMessageType === "document") {
          whapiResponse = await sendMediaMessage(channel.whapiChannelToken, {
            to,
            media: resolvedMediaUrl || "",
            caption: body,
            mediaType: "Document"
          });
        }
        const providerMessageId = whapiResponse.messages?.[0]?.id || whapiResponse.message?.id || whapiResponse.id || whapiResponse.message_id;
        console.log(`[Single Send] Message to ${to}:`);
        console.log(`[Single Send] Full WHAPI response:`, JSON.stringify(whapiResponse, null, 2));
        console.log(`[Single Send] Provider ID extracted: ${providerMessageId || "MISSING"}`);
        if (!providerMessageId) {
          console.error(`[Single Send] ERROR: No provider message ID found in response!`);
          console.error(`[Single Send] Response keys:`, Object.keys(whapiResponse));
        }
        await storage.updateMessage(message.id, {
          providerMessageId,
          status: "SENT"
        });
        console.log(`[Send] Updated message ${message.id} with providerMessageId: ${providerMessageId}`);
        await storage.updateJob(job.id, {
          status: "COMPLETED",
          pending: 0,
          sent: 1
        });
        await storage.createAuditLog({
          actorUserId: req.userId,
          action: "SEND_MESSAGE",
          meta: {
            entity: "job",
            entityId: job.id,
            messageId: message.id,
            to,
            providerMessageId: whapiResponse.id || whapiResponse.message_id
          }
        });
        res.json({ job, message, success: true });
      } catch (whapiError) {
        console.error("Message send error:", whapiError);
        let errorMessage = "Failed to send message";
        if (whapiError.message) {
          errorMessage = typeof whapiError.message === "string" ? whapiError.message : JSON.stringify(whapiError.message);
        } else if (whapiError.error) {
          errorMessage = typeof whapiError.error === "string" ? whapiError.error : JSON.stringify(whapiError.error);
        } else if (typeof whapiError === "string") {
          errorMessage = whapiError;
        }
        await storage.updateMessage(message.id, {
          status: "FAILED",
          error: errorMessage
        });
        await storage.updateJob(job.id, {
          status: "FAILED",
          pending: 0,
          failed: 1
        });
        return res.status(500).json({
          error: "Failed to send message. Please try again later.",
          details: errorMessage
        });
      }
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
  app2.post("/api/messages/bulk", requireAuth, async (req, res) => {
    try {
      const { channelId, rows } = req.body;
      if (!channelId || !rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "channelId and rows are required" });
      }
      const user = await storage.getUser(req.userId);
      if (!user || user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId || channel.status !== "ACTIVE") {
        return res.status(403).json({ error: "Channel not available" });
      }
      if (!channel.whapiChannelToken) {
        return res.status(400).json({
          error: "Channel is not properly configured. Please contact support or re-authorize this channel."
        });
      }
      const subscription = await storage.getActiveSubscriptionForUser(req.userId);
      if (!subscription) {
        return res.status(403).json({ error: "Active subscription required" });
      }
      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.bulkMessagesLimit !== -1 && rows.length > plan.bulkMessagesLimit) {
        return res.status(403).json({
          error: `Bulk message limit is ${plan.bulkMessagesLimit} messages per batch`
        });
      }
      if (plan.bulkMessagesLimit !== -1) {
        const jobs2 = await storage.getJobsForUser(req.userId);
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const bulkMessagesToday = jobs2.filter((j) => new Date(j.createdAt) >= today && j.type === "BULK").reduce((sum, j) => sum + j.total, 0);
        if (bulkMessagesToday + rows.length > plan.bulkMessagesLimit) {
          return res.status(403).json({
            error: `Daily bulk message limit would be exceeded. Today: ${bulkMessagesToday}/${plan.bulkMessagesLimit}`
          });
        }
      }
      const job = await storage.createJob({
        userId: req.userId,
        channelId,
        type: "BULK",
        status: "PENDING",
        total: rows.length,
        queued: rows.length,
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replied: 0
      });
      for (const row of rows) {
        const buttons = [];
        if (row.button1) {
          const buttonId = row.button1_id || `btn1_${Date.now()}`;
          buttons.push({ type: "quick_reply", title: row.button1, id: buttonId });
        }
        if (row.button2) {
          const buttonId = row.button2_id || `btn2_${Date.now()}`;
          buttons.push({ type: "quick_reply", title: row.button2, id: buttonId });
        }
        if (row.button3) {
          const buttonId = row.button3_id || `btn3_${Date.now()}`;
          buttons.push({ type: "quick_reply", title: row.button3, id: buttonId });
        }
        await storage.createMessage({
          jobId: job.id,
          to: row.phone,
          name: row.name || "",
          email: row.email || null,
          body: row.bodyText || row.message || "",
          header: row.headerMsg || null,
          footer: row.footerText || null,
          buttons,
          status: "QUEUED"
        });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "SEND_BULK",
        meta: {
          entity: "job",
          entityId: job.id,
          type: "BULK",
          count: rows.length
        }
      });
      processBulkJob(job.id, channel).catch((err) => {
        console.error(`Bulk job ${job.id} processing error:`, err);
      });
      res.json(job);
    } catch (error) {
      console.error("Bulk send error:", error);
      res.status(500).json({ error: "Failed to send bulk messages" });
    }
  });
  async function processBulkJob(jobId, channel) {
    try {
      const minDelaySetting = await storage.getSetting("bulk_send_min_delay");
      const maxDelaySetting = await storage.getSetting("bulk_send_max_delay");
      const minDelay = parseInt(minDelaySetting?.value || "10") * 1e3;
      const maxDelay = parseInt(maxDelaySetting?.value || "20") * 1e3;
      const messages2 = await storage.getMessagesForJob(jobId);
      const queuedMessages = messages2.filter((m) => m.status === "QUEUED");
      if (queuedMessages.length === 0) {
        await storage.updateJob(jobId, { status: "COMPLETED" });
        return;
      }
      await storage.updateJob(jobId, { status: "PROCESSING" });
      let queuedCount = queuedMessages.length;
      let pendingCount = 0;
      let sentCount = messages2.filter((m) => m.status === "SENT").length;
      let failedCount = messages2.filter((m) => m.status === "FAILED").length;
      for (const message of queuedMessages) {
        try {
          console.log(`[Bulk Send] Processing message ${message.id} to ${message.to}`);
          console.log(`[Bulk Send] Raw message data:`, JSON.stringify({
            id: message.id,
            messageType: message.messageType,
            buttons: message.buttons,
            body: message.body?.substring(0, 50),
            mediaUrl: message.mediaUrl
          }, null, 2));
          await storage.updateMessage(message.id, { status: "PENDING" });
          queuedCount--;
          pendingCount++;
          await storage.updateJob(jobId, { queued: queuedCount, pending: pendingCount });
          const messageType = message.messageType || "text_buttons";
          let buttons = [];
          if (message.buttons) {
            if (typeof message.buttons === "string") {
              try {
                buttons = JSON.parse(message.buttons);
              } catch (parseErr) {
                console.warn(`[Bulk Send] Failed to parse buttons as JSON, treating as empty:`, message.buttons);
                buttons = [];
              }
            } else if (Array.isArray(message.buttons)) {
              buttons = message.buttons;
            }
          }
          console.log(`[Bulk Send] Parsed buttons:`, JSON.stringify(buttons, null, 2));
          console.log(`[Bulk Send] Message type: ${messageType}, buttons count: ${buttons.length}`);
          const resolvedMediaUrl = await resolveMediaForWhapi(message.mediaUrl);
          let result;
          switch (messageType) {
            case "image":
              result = await sendMediaMessage(channel.whapiChannelToken, {
                to: message.to,
                media: resolvedMediaUrl || "",
                caption: message.body || "",
                mediaType: "Image"
              });
              break;
            case "image_buttons": {
              const imgPayload = {
                to: message.to,
                type: "button",
                ...resolvedMediaUrl && { media: resolvedMediaUrl },
                // Media at root level!
                body: { text: message.body || "No message" },
                footer: message.footer ? { text: message.footer } : void 0,
                action: { buttons }
              };
              console.log(`[Bulk Send] image_buttons with media at root for ${message.to}`);
              result = await sendInteractiveMessage(channel.whapiChannelToken, imgPayload);
              break;
            }
            case "video_buttons": {
              const vidPayload = {
                to: message.to,
                type: "button",
                ...resolvedMediaUrl && { media: resolvedMediaUrl },
                // Media at root level!
                body: { text: message.body || "No message" },
                footer: message.footer ? { text: message.footer } : void 0,
                action: { buttons }
              };
              console.log(`[Bulk Send] video_buttons with media at root for ${message.to}`);
              result = await sendInteractiveMessage(channel.whapiChannelToken, vidPayload);
              break;
            }
            case "document":
              result = await sendMediaMessage(channel.whapiChannelToken, {
                to: message.to,
                media: resolvedMediaUrl || "",
                caption: message.body || "",
                mediaType: "Document"
              });
              break;
            case "text_buttons":
            default:
              if (buttons.length > 0) {
                result = await sendInteractiveMessage(channel.whapiChannelToken, {
                  to: message.to,
                  type: "button",
                  header: message.header ? { text: message.header } : void 0,
                  body: { text: message.body || "No message" },
                  footer: message.footer ? { text: message.footer } : void 0,
                  action: { buttons }
                });
              } else {
                result = await sendTextMessage(channel.whapiChannelToken, {
                  to: message.to,
                  body: message.body || "No message"
                });
              }
              break;
          }
          console.log(`[Bulk Send] WHAPI result status:`, {
            resultExists: !!result,
            resultSent: result?.sent,
            resultError: result?.error,
            resultMessage: result?.message
          });
          if (result && result.sent) {
            const providerMessageId = result.messages?.[0]?.id || result.message?.id || result.id || result.message_id;
            console.log(`[Bulk Send] SUCCESS - Message ${message.id} to ${message.to}:`);
            console.log(`[Bulk Send] Full WHAPI response:`, JSON.stringify(result, null, 2));
            console.log(`[Bulk Send] Provider ID extracted: ${providerMessageId || "MISSING"}`);
            if (!providerMessageId) {
              console.error(`[Bulk Send] ERROR: No provider message ID found in response!`);
              console.error(`[Bulk Send] Response keys:`, Object.keys(result));
            }
            await storage.updateMessage(message.id, {
              status: "SENT",
              providerMessageId,
              sentAt: /* @__PURE__ */ new Date()
            });
            pendingCount--;
            sentCount++;
            await storage.updateJob(jobId, { pending: pendingCount, sent: sentCount });
          } else {
            console.error(`[Bulk Send] FAILED - Message ${message.id} to ${message.to}`);
            console.error(`[Bulk Send] Full WHAPI result:`, JSON.stringify(result, null, 2));
            let errorMessage = "Failed to send";
            if (result?.message) {
              errorMessage = typeof result.message === "string" ? result.message : JSON.stringify(result.message);
            } else if (result?.error) {
              errorMessage = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
            } else if (result === void 0) {
              errorMessage = "WHAPI returned undefined";
            } else if (result === null) {
              errorMessage = "WHAPI returned null";
            } else {
              errorMessage = `WHAPI returned unexpected result: ${JSON.stringify(result)}`;
            }
            throw new Error(errorMessage);
          }
          if (message.id !== queuedMessages[queuedMessages.length - 1].id) {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (msgError) {
          console.error(`[Bulk Send] EXCEPTION - Failed to send message ${message.id}:`, msgError);
          console.error(`[Bulk Send] Error type:`, typeof msgError);
          console.error(`[Bulk Send] Error keys:`, Object.keys(msgError || {}));
          console.error(`[Bulk Send] Full error object:`, JSON.stringify(msgError, null, 2).substring(0, 500));
          let errorMessage = "Unknown error";
          if (typeof msgError === "string") {
            errorMessage = msgError;
          } else if (msgError?.message) {
            if (typeof msgError.message === "string") {
              errorMessage = msgError.message;
            } else {
              try {
                errorMessage = JSON.stringify(msgError.message);
              } catch {
                errorMessage = String(msgError.message);
              }
            }
          } else if (msgError?.error) {
            if (typeof msgError.error === "string") {
              errorMessage = msgError.error;
            } else {
              try {
                errorMessage = JSON.stringify(msgError.error);
              } catch {
                errorMessage = String(msgError.error);
              }
            }
          } else if (msgError instanceof Error) {
            errorMessage = msgError.toString();
          } else {
            try {
              errorMessage = JSON.stringify(msgError);
            } catch {
              errorMessage = String(msgError);
            }
          }
          if (errorMessage === "[object Object]") {
            errorMessage = `Error (${typeof msgError}): ${Object.keys(msgError || {}).join(", ")}`;
          }
          console.error(`[Bulk Send] Extracted error message: ${errorMessage}`);
          await storage.updateMessage(message.id, {
            status: "FAILED",
            error: errorMessage
          });
          pendingCount--;
          failedCount++;
          await storage.updateJob(jobId, { pending: pendingCount, failed: failedCount });
        }
      }
      await storage.updateJob(jobId, { status: "COMPLETED" });
    } catch (error) {
      console.error(`Bulk job ${jobId} processing error:`, error);
      await storage.updateJob(jobId, { status: "FAILED" });
    }
  }
  app2.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobs2 = await storage.getJobsForUser(effectiveUserId);
      res.json(jobs2);
    } catch (error) {
      console.error("Get jobs error:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });
  const getMediaUrl = (mediaUpload) => {
    if (!mediaUpload) return null;
    if (mediaUpload.whapiMediaId?.startsWith("local-") && mediaUpload.fileName) {
      return `/uploads/${mediaUpload.fileName}`;
    }
    return mediaUpload.whapiMediaId || null;
  };
  const resolveMediaForWhapi = async (mediaUrl) => {
    if (!mediaUrl) return null;
    if (mediaUrl.startsWith("data:")) {
      return mediaUrl;
    }
    if (mediaUrl.startsWith("/uploads/")) {
      try {
        const fileName = mediaUrl.replace("/uploads/", "");
        const filePath = path.join(process.cwd(), "uploads", fileName);
        if (!fs.existsSync(filePath)) {
          console.error(`[Media Resolver] File not found: ${filePath}`);
          return null;
        }
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString("base64");
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".mp4": "video/mp4",
          ".mpeg": "video/mpeg",
          ".mov": "video/quicktime",
          ".avi": "video/x-msvideo",
          ".pdf": "application/pdf",
          ".doc": "application/msword",
          ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ".xls": "application/vnd.ms-excel",
          ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
        const mimeType = mimeTypes[ext] || "application/octet-stream";
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        console.log(`[Media Resolver] Converted local file ${fileName} to base64 (${(base64Data.length / 1024).toFixed(2)}KB)`);
        return dataUrl;
      } catch (error) {
        console.error(`[Media Resolver] Error reading file:`, error);
        return null;
      }
    }
    return mediaUrl;
  };
  app2.get("/api/templates", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const templates2 = await storage.getTemplatesForUser(effectiveUserId);
      const templatesWithMedia = await Promise.all(
        templates2.map(async (template) => {
          if (template.mediaUploadId) {
            const mediaUpload = await storage.getMediaUpload(template.mediaUploadId);
            return {
              ...template,
              mediaUrl: getMediaUrl(mediaUpload),
              mediaUploadId: template.mediaUploadId
              // Keep the ID for editing
            };
          }
          return { ...template, mediaUrl: null };
        })
      );
      res.json(templatesWithMedia);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });
  app2.post("/api/templates", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const validationResult = insertTemplateSchema.extend({ userId: z2.number() }).safeParse({
        ...req.body,
        userId: effectiveUserId
      });
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const { title, header, body, footer, buttons, messageType, mediaUploadId } = validationResult.data;
      if (mediaUploadId) {
        const mediaUpload = await storage.getMediaUpload(mediaUploadId);
        if (!mediaUpload || mediaUpload.userId !== effectiveUserId) {
          return res.status(404).json({ error: "Media upload not found or access denied" });
        }
      }
      const template = await storage.createTemplate({
        userId: effectiveUserId,
        title,
        header,
        body,
        footer,
        buttons: buttons || [],
        messageType: messageType || "text_buttons",
        mediaUploadId: mediaUploadId || null
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CREATE",
        meta: {
          entity: "template",
          entityId: template.id,
          title
        }
      });
      let responseTemplate = { ...template, mediaUrl: null };
      if (template.mediaUploadId) {
        const mediaUpload = await storage.getMediaUpload(template.mediaUploadId);
        responseTemplate.mediaUrl = getMediaUrl(mediaUpload);
      }
      res.json(responseTemplate);
    } catch (error) {
      console.error("Create template error:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });
  app2.put("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getTemplate(templateId);
      if (!template || template.userId !== req.userId) {
        return res.status(404).json({ error: "Template not found" });
      }
      const { title, header, body, footer, buttons, messageType, mediaUploadId } = req.body;
      if (mediaUploadId !== void 0 && mediaUploadId !== null) {
        const mediaUpload = await storage.getMediaUpload(mediaUploadId);
        if (!mediaUpload || mediaUpload.userId !== req.userId) {
          return res.status(404).json({ error: "Media upload not found or access denied" });
        }
      }
      const updated = await storage.updateTemplate(templateId, {
        title,
        header,
        body,
        footer,
        buttons,
        messageType,
        mediaUploadId
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE",
        meta: {
          entity: "template",
          entityId: templateId,
          title
        }
      });
      let responseTemplate = { ...updated, mediaUrl: null };
      if (updated?.mediaUploadId) {
        const mediaUpload = await storage.getMediaUpload(updated.mediaUploadId);
        responseTemplate.mediaUrl = getMediaUrl(mediaUpload);
      }
      res.json(responseTemplate);
    } catch (error) {
      console.error("Update template error:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });
  app2.delete("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getTemplate(templateId);
      if (!template || template.userId !== req.userId) {
        return res.status(404).json({ error: "Template not found" });
      }
      await storage.deleteTemplate(templateId);
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE",
        meta: {
          entity: "template",
          entityId: templateId,
          title: template.title
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete template error:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });
  app2.get("/api/phonebooks", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebooks2 = await storage.getPhonebooksForUser(effectiveUserId);
      const phonebooksWithCount = await Promise.all(
        phonebooks2.map(async (phonebook) => {
          const contacts = await storage.getContactsForPhonebook(phonebook.id);
          return {
            ...phonebook,
            contactCount: contacts.length
          };
        })
      );
      res.json(phonebooksWithCount);
    } catch (error) {
      console.error("Get phonebooks error:", error);
      res.status(500).json({ error: "Failed to fetch phonebooks" });
    }
  });
  app2.get("/api/phonebooks/sample-csv", requireAuth, async (req, res) => {
    const sampleCSV = `phone_number,name,email,header,body,footer,button1_text,button2_text,button3_text,button1_id,button2_id,button3_id
+97312345678,John Doe,john@example.com,Hello!,This is a test message,Thank you,Option 1,Option 2,Option 3,btn1_custom,btn2_custom,btn3_custom
+97398765432,Jane Smith,jane@example.com,,Simple message without header/footer,,,,,,,`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="phonebook-contacts-sample.csv"');
    res.send(sampleCSV);
  });
  app2.get("/api/phonebooks/:id", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      res.json({
        ...phonebook,
        contacts
      });
    } catch (error) {
      console.error("Get phonebook error:", error);
      res.status(500).json({ error: "Failed to fetch phonebook" });
    }
  });
  app2.post("/api/phonebooks", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { name, description } = req.body;
      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Phonebook name is required" });
      }
      const phonebook = await storage.createPhonebook({
        userId: effectiveUserId,
        name: name.trim(),
        description: description || null
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CREATE",
        meta: {
          entity: "phonebook",
          entityId: phonebook.id,
          name
        }
      });
      res.json(phonebook);
    } catch (error) {
      console.error("Create phonebook error:", error);
      res.status(500).json({ error: "Failed to create phonebook" });
    }
  });
  app2.put("/api/phonebooks/:id", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      const { name, description } = req.body;
      const updated = await storage.updatePhonebook(phonebookId, {
        name,
        description
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE",
        meta: {
          entity: "phonebook",
          entityId: phonebookId,
          name
        }
      });
      res.json(updated);
    } catch (error) {
      console.error("Update phonebook error:", error);
      res.status(500).json({ error: "Failed to update phonebook" });
    }
  });
  app2.delete("/api/phonebooks/:id", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      await storage.deletePhonebook(phonebookId);
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE",
        meta: {
          entity: "phonebook",
          entityId: phonebookId,
          name: phonebook.name
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete phonebook error:", error);
      res.status(500).json({ error: "Failed to delete phonebook" });
    }
  });
  app2.get("/api/phonebooks/:id/contacts", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      res.json(contacts);
    } catch (error) {
      console.error("Get contacts error:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });
  app2.post("/api/phonebooks/:id/contacts", requireAuth, async (req, res) => {
    try {
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== req.userId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      const limit = await getPhonebookLimit(req.userId);
      console.log(`[Add Contact] User ${req.userId} phonebook ${phonebookId} limit:`, limit);
      if (limit !== null) {
        const currentContacts = await storage.getContactsForPhonebook(phonebookId);
        console.log(`[Add Contact] Current contacts: ${currentContacts.length}, Limit: ${limit}`);
        if (currentContacts.length >= limit) {
          return res.status(400).json({
            error: `Phonebook limit reached. Your plan allows a maximum of ${limit} contacts per phonebook.`
          });
        }
      }
      const {
        phone,
        name,
        email,
        messageType,
        body,
        mediaUrl,
        button1Text,
        button1Type,
        button1Value,
        button1Id,
        button2Text,
        button2Type,
        button2Value,
        button2Id,
        button3Text,
        button3Type,
        button3Value,
        button3Id
      } = req.body;
      if (!phone || !name || !body) {
        return res.status(400).json({ error: "Phone, name, and message body are required" });
      }
      const contact = await storage.createContact({
        phonebookId,
        phone,
        name,
        email: email || null,
        messageType: messageType || "text_buttons",
        body,
        mediaUrl: mediaUrl || null,
        button1Text: button1Text || null,
        button1Type: button1Type || null,
        button1Value: button1Value || null,
        button1Id: button1Id || null,
        button2Text: button2Text || null,
        button2Type: button2Type || null,
        button2Value: button2Value || null,
        button2Id: button2Id || null,
        button3Text: button3Text || null,
        button3Type: button3Type || null,
        button3Value: button3Value || null,
        button3Id: button3Id || null
      });
      res.json(contact);
    } catch (error) {
      console.error("Create contact error:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });
  app2.put("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      const phonebook = await storage.getPhonebook(contact.phonebookId);
      if (!phonebook || phonebook.userId !== req.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updated = await storage.updateContact(contactId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update contact error:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });
  app2.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      const phonebook = await storage.getPhonebook(contact.phonebookId);
      if (!phonebook || phonebook.userId !== req.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.deleteContact(contactId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete contact error:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });
  app2.post("/api/media/upload", requireAuth, async (req, res) => {
    try {
      const { file, fileType, fileName } = req.body;
      if (!file || !fileType) {
        return res.status(400).json({ error: "File data and fileType are required" });
      }
      const subscription = await storage.getActiveSubscriptionForUser(req.userId);
      if (!subscription) {
        return res.status(403).json({ error: "No active subscription" });
      }
      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(403).json({ error: "Plan not found" });
      }
      const base64Data = file.split(",")[1] || file;
      const buffer = Buffer.from(base64Data, "base64");
      const fileSizeMB = buffer.length / (1024 * 1024);
      let maxAllowed = 5;
      if (fileType === "image") {
        maxAllowed = plan.maxImageSizeMB || 5;
      } else if (fileType === "video") {
        maxAllowed = plan.maxVideoSizeMB || 16;
      } else if (fileType === "document") {
        maxAllowed = plan.maxDocumentSizeMB || 10;
      }
      if (fileSizeMB > maxAllowed) {
        return res.status(400).json({
          error: `File size (${fileSizeMB.toFixed(2)}MB) exceeds plan limit (${maxAllowed}MB)`
        });
      }
      const mimeMatch = file.match(/^data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";
      const extensionMap = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "video/mpeg": "mpeg",
        "video/quicktime": "mov",
        "video/x-msvideo": "avi",
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
      };
      const extension = extensionMap[mimeType] || "bin";
      const uniqueId = crypto.randomBytes(8).toString("hex");
      const timestamp2 = Date.now();
      const generatedFileName = `${timestamp2}-${uniqueId}.${extension}`;
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const filePath = path.join(uploadsDir, generatedFileName);
      fs.writeFileSync(filePath, buffer);
      const mediaId = `local-${uniqueId}`;
      const mediaUpload = await storage.createMediaUpload({
        userId: req.userId,
        whapiMediaId: mediaId,
        fileName: fileName || generatedFileName,
        fileType,
        fileSizeMB: Math.round(fileSizeMB),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3)
      });
      console.log(`[Media Upload] Saved ${generatedFileName} (${fileSizeMB.toFixed(2)}MB) for user ${req.userId}`);
      res.json({
        id: mediaUpload.id,
        // Database record ID for mediaUploadId
        mediaId,
        url: file,
        // Return original base64 data URL for inline sending
        fileName: generatedFileName,
        fileSizeMB: fileSizeMB.toFixed(2),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3)
      });
    } catch (error) {
      console.error("Media upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload media" });
    }
  });
  app2.post("/api/phonebooks/:id/send", requireAuth, async (req, res) => {
    try {
      const phonebookId = parseInt(req.params.id);
      const { channelId } = req.body;
      if (!channelId) {
        return res.status(400).json({ error: "Channel ID is required" });
      }
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== req.userId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(403).json({ error: "Channel not found or access denied" });
      }
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      if (contacts.length === 0) {
        return res.status(400).json({ error: "Phonebook has no contacts" });
      }
      const job = await storage.createJob({
        userId: req.userId,
        channelId,
        type: "BULK",
        status: "PENDING",
        total: contacts.length,
        queued: contacts.length,
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replied: 0
      });
      for (const contact of contacts) {
        const buttons = [];
        if (contact.button1Text) {
          const button = {
            type: contact.button1Type || "quick_reply",
            title: contact.button1Text,
            id: contact.button1Id || `btn1_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          };
          if (contact.button1Type === "url" && contact.button1Value) {
            button.url = contact.button1Value;
          } else if (contact.button1Type === "call" && contact.button1Value) {
            button.phone = contact.button1Value;
          }
          buttons.push(button);
        }
        if (contact.button2Text) {
          const button = {
            type: contact.button2Type || "quick_reply",
            title: contact.button2Text,
            id: contact.button2Id || `btn2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          };
          if (contact.button2Type === "url" && contact.button2Value) {
            button.url = contact.button2Value;
          } else if (contact.button2Type === "call" && contact.button2Value) {
            button.phone = contact.button2Value;
          }
          buttons.push(button);
        }
        if (contact.button3Text) {
          const button = {
            type: contact.button3Type || "quick_reply",
            title: contact.button3Text,
            id: contact.button3Id || `btn3_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          };
          if (contact.button3Type === "url" && contact.button3Value) {
            button.url = contact.button3Value;
          } else if (contact.button3Type === "call" && contact.button3Value) {
            button.phone = contact.button3Value;
          }
          buttons.push(button);
        }
        await storage.createMessage({
          jobId: job.id,
          to: contact.phone,
          name: contact.name,
          email: contact.email || null,
          body: contact.body,
          header: contact.header || null,
          footer: contact.footer || null,
          buttons,
          status: "QUEUED",
          messageType: contact.messageType,
          mediaUrl: contact.mediaUrl || null
        });
      }
      processBulkJob(job.id, channel);
      res.json(job);
    } catch (error) {
      console.error("Send to phonebook error:", error);
      res.status(500).json({ error: "Failed to send messages" });
    }
  });
  app2.post("/api/phonebooks/:id/send-uniform", requireAuth, async (req, res) => {
    try {
      const phonebookId = parseInt(req.params.id);
      const { channelId, header, body, footer, buttons, messageType, mediaUrl } = req.body;
      if (!channelId || !body) {
        return res.status(400).json({ error: "Channel ID and message body are required" });
      }
      const mediaRequiredTypes = ["image", "image_buttons", "video_buttons", "document"];
      if (mediaRequiredTypes.includes(messageType) && !mediaUrl) {
        return res.status(400).json({
          error: `Media file is required for ${messageType} messages. Please upload a file before sending.`
        });
      }
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== req.userId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId) {
        return res.status(403).json({ error: "Channel not found or access denied" });
      }
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      if (contacts.length === 0) {
        return res.status(400).json({ error: "Phonebook has no contacts" });
      }
      const job = await storage.createJob({
        userId: req.userId,
        channelId,
        type: "BULK",
        status: "PENDING",
        total: contacts.length,
        queued: contacts.length,
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replied: 0
      });
      for (const contact of contacts) {
        await storage.createMessage({
          jobId: job.id,
          to: contact.phone,
          name: contact.name,
          email: contact.email || null,
          body,
          header: header || null,
          footer: footer || null,
          buttons: buttons || [],
          status: "QUEUED",
          messageType: messageType || "text_buttons",
          mediaUrl: mediaUrl || null
        });
      }
      processBulkJob(job.id, channel);
      res.json(job);
    } catch (error) {
      console.error("Send uniform message error:", error);
      res.status(500).json({ error: "Failed to send messages" });
    }
  });
  app2.post("/api/phonebooks/:id/import-csv", requireAuth, async (req, res) => {
    try {
      const phonebookId = parseInt(req.params.id);
      const { csvData } = req.body;
      if (!csvData || typeof csvData !== "string") {
        return res.status(400).json({ error: "CSV data is required" });
      }
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== req.userId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }
      const limit = await getPhonebookLimit(req.userId);
      const currentContacts = await storage.getContactsForPhonebook(phonebookId);
      const Papa = await import("papaparse");
      const parsed = Papa.default.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, "_")
      });
      const validContacts = [];
      const invalidRows = [];
      parsed.data.forEach((row, index) => {
        const rowNumber = index + 2;
        const errors = [];
        if (!row.phone_number || typeof row.phone_number !== "string" || row.phone_number.trim() === "") {
          errors.push("Phone number is required");
        } else {
          const phone = row.phone_number.trim();
          if (phone.length < 8) {
            errors.push("Phone number is too short");
          }
          row.phone_number = phone;
        }
        const name = row.name?.trim() || row.phone_number?.trim() || "Unknown";
        const body = row.body?.trim() || "";
        if (errors.length > 0) {
          invalidRows.push({ row: rowNumber, errors });
        } else {
          const button1Id = row.button1_id?.trim() || (row.button1_text ? `btn1_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null);
          const button2Id = row.button2_id?.trim() || (row.button2_text ? `btn2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null);
          const button3Id = row.button3_id?.trim() || (row.button3_text ? `btn3_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null);
          validContacts.push({
            phonebookId,
            phone: row.phone_number.trim(),
            name,
            email: row.email?.trim() || null,
            header: row.header?.trim() || null,
            body,
            footer: row.footer?.trim() || null,
            messageType: "text_buttons",
            // Default for CSV import
            mediaUrl: null,
            button1Text: row.button1_text?.trim() || null,
            button1Type: "quick_reply",
            // Default type
            button1Value: null,
            button1Id,
            button2Text: row.button2_text?.trim() || null,
            button2Type: "quick_reply",
            button2Value: null,
            button2Id,
            button3Text: row.button3_text?.trim() || null,
            button3Type: "quick_reply",
            button3Value: null,
            button3Id
          });
        }
      });
      let contactsToImport = validContacts;
      let limitWarning = void 0;
      let contactsSkipped = 0;
      if (limit !== null) {
        const availableSlots = limit - currentContacts.length;
        if (availableSlots <= 0) {
          return res.status(400).json({
            error: `Your phonebook is full. Your plan allows a maximum of ${limit} contacts per phonebook and you currently have ${currentContacts.length} contacts.`
          });
        }
        if (validContacts.length > availableSlots) {
          contactsToImport = validContacts.slice(0, availableSlots);
          contactsSkipped = validContacts.length - availableSlots;
          limitWarning = `Your plan allows a maximum of ${limit} contacts per phonebook. You currently have ${currentContacts.length} contacts. Only the first ${availableSlots} contact(s) from your CSV will be imported. ${contactsSkipped} contact(s) will be skipped.`;
          console.log(`[PhonebookLimit] Trimming CSV import: ${validContacts.length} valid rows, only importing ${availableSlots}, skipping ${contactsSkipped}`);
        }
      }
      let insertedCount = 0;
      for (const contact of contactsToImport) {
        try {
          await storage.createContact(contact);
          insertedCount++;
        } catch (error) {
          console.error("Error inserting contact:", error);
        }
      }
      res.json({
        success: true,
        summary: {
          total: parsed.data.length,
          valid: validContacts.length,
          invalid: invalidRows.length,
          inserted: insertedCount,
          skipped: contactsSkipped
        },
        limitWarning,
        invalidRows: invalidRows.length > 0 ? invalidRows : void 0
      });
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: error.message || "Failed to import CSV" });
    }
  });
  app2.get("/api/subscribers", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const status = req.query.status;
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;
      if (status && status !== "subscribed" && status !== "unsubscribed") {
        return res.status(400).json({ error: "Invalid status filter" });
      }
      if (page < 1 || pageSize < 1 || pageSize > 100) {
        return res.status(400).json({ error: "Invalid pagination parameters" });
      }
      const result = await storage.getSubscribersForUser(effectiveUserId, { status, page, pageSize });
      res.json({
        subscribers: result.subscribers,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize)
      });
    } catch (error) {
      console.error("Get subscribers error:", error);
      res.status(500).json({ error: "Failed to fetch subscribers" });
    }
  });
  app2.put("/api/subscribers/:id", requireAuth, async (req, res) => {
    try {
      const subscriberId = parseInt(req.params.id);
      if (isNaN(subscriberId)) {
        return res.status(400).json({ error: "Invalid subscriber ID" });
      }
      const subscriber = await storage.getSubscriber(subscriberId);
      if (!subscriber || subscriber.userId !== req.userId) {
        return res.status(404).json({ error: "Subscriber not found" });
      }
      const updateSchema = z2.object({
        status: z2.enum(["subscribed", "unsubscribed"])
      });
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const { status } = validationResult.data;
      const updated = await storage.updateSubscriber(subscriberId, { status });
      res.json(updated);
    } catch (error) {
      console.error("Update subscriber error:", error);
      res.status(500).json({ error: "Failed to update subscriber" });
    }
  });
  app2.delete("/api/subscribers/:id", requireAuth, async (req, res) => {
    try {
      const subscriberId = parseInt(req.params.id);
      if (isNaN(subscriberId)) {
        return res.status(400).json({ error: "Invalid subscriber ID" });
      }
      const subscriber = await storage.getSubscriber(subscriberId);
      if (!subscriber || subscriber.userId !== req.userId) {
        return res.status(404).json({ error: "Subscriber not found" });
      }
      await storage.deleteSubscriber(subscriberId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete subscriber error:", error);
      res.status(500).json({ error: "Failed to delete subscriber" });
    }
  });
  app2.get("/api/subscribers/export", requireAuth, async (req, res) => {
    try {
      const result = await storage.getSubscribersForUser(req.userId, { pageSize: 1e5 });
      const csvLines = [
        "Name,Phone,Status,Last Updated"
        // Header
      ];
      for (const sub of result.subscribers) {
        const lastUpdated = sub.lastUpdated ? new Date(sub.lastUpdated).toLocaleString() : "";
        csvLines.push(`"${sub.name}","${sub.phone}","${sub.status}","${lastUpdated}"`);
      }
      const csv = csvLines.join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="subscribers-${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Export subscribers error:", error);
      res.status(500).json({ error: "Failed to export subscribers" });
    }
  });
  app2.get("/api/workflows", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflows2 = await storage.getWorkflowsForUser(effectiveUserId);
      res.json(workflows2);
    } catch (error) {
      console.error("Get workflows error:", error);
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });
  app2.post("/api/workflows", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const validationResult = insertWorkflowSchema.extend({ userId: z2.number() }).safeParse({
        ...req.body,
        userId: effectiveUserId
      });
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const { name, definitionJson } = validationResult.data;
      const workflow = await storage.createWorkflow({
        userId: effectiveUserId,
        name,
        definitionJson: definitionJson || {}
      });
      res.json(workflow);
    } catch (error) {
      console.error("Create workflow error:", error);
      res.status(500).json({ error: "Failed to create workflow" });
    }
  });
  app2.put("/api/workflows/:id", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow || workflow.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      const updateSchema = z2.object({
        name: z2.string().min(1).optional(),
        definitionJson: z2.record(z2.any()).optional(),
        entryNodeId: z2.string().optional().nullable()
      });
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const { name, definitionJson, entryNodeId } = validationResult.data;
      const updated = await storage.updateWorkflow(workflowId, {
        name,
        definitionJson,
        entryNodeId
      });
      res.json(updated);
    } catch (error) {
      console.error("Update workflow error:", error);
      res.status(500).json({ error: "Failed to update workflow" });
    }
  });
  app2.delete("/api/workflows/:id", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow || workflow.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      await storage.deleteWorkflow(workflowId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete workflow error:", error);
      res.status(500).json({ error: "Failed to delete workflow" });
    }
  });
  app2.patch("/api/workflows/:id/toggle-active", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow || workflow.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }
      const updated = await storage.updateWorkflow(workflowId, { isActive });
      res.json(updated);
    } catch (error) {
      console.error("Toggle workflow active error:", error);
      res.status(500).json({ error: "Failed to toggle workflow status" });
    }
  });
  app2.post("/api/workflows/test-message", requireAuth, async (req, res) => {
    try {
      const { nodeType, config, phone, channelId } = req.body;
      if (!phone || !nodeType || !config || !channelId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const effectiveUserId = getEffectiveUserId(req);
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      if (channel.status !== "ACTIVE" || channel.authStatus !== "AUTHORIZED") {
        return res.status(400).json({ error: "Channel must be active and authorized to send messages" });
      }
      const result = await buildAndSendNodeMessage(channel, phone, nodeType, config);
      res.json({ success: true, messageId: result.messageId });
    } catch (error) {
      console.error("Test message error:", error);
      res.status(500).json({ error: error.message || "Failed to send test message" });
    }
  });
  app2.get("/api/workflow-logs", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const userWorkflows = await storage.getWorkflowsForUser(effectiveUserId);
      const workflowIds = userWorkflows.map((w) => w.id);
      if (workflowIds.length === 0) {
        return res.json([]);
      }
      const logs = await db.select({
        id: workflowExecutions.id,
        workflowId: workflowExecutions.workflowId,
        workflowName: workflows.name,
        phone: workflowExecutions.phone,
        messageType: workflowExecutions.messageType,
        triggerData: workflowExecutions.triggerData,
        responsesSent: workflowExecutions.responsesSent,
        status: workflowExecutions.status,
        errorMessage: workflowExecutions.errorMessage,
        executedAt: workflowExecutions.executedAt
      }).from(workflowExecutions).leftJoin(workflows, eq2(workflowExecutions.workflowId, workflows.id)).where(inArray(workflowExecutions.workflowId, workflowIds)).orderBy(desc2(workflowExecutions.executedAt)).limit(100);
      res.json(logs);
    } catch (error) {
      console.error("Get workflow logs error:", error);
      res.status(500).json({ error: "Failed to fetch workflow logs" });
    }
  });
  app2.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobs2 = await storage.getJobsForUser(effectiveUserId);
      res.json(jobs2);
    } catch (error) {
      console.error("Get jobs error:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });
  app2.get("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job || job.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Job not found" });
      }
      const messages2 = await storage.getMessagesForJob(jobId);
      let queued = 0, pending = 0, sent = 0, delivered = 0, read = 0, failed = 0, replied = 0;
      for (const message of messages2) {
        switch (message.status) {
          case "QUEUED":
            queued++;
            break;
          case "PENDING":
            pending++;
            break;
          case "SENT":
            sent++;
            break;
          case "DELIVERED":
            delivered++;
            break;
          case "READ":
            read++;
            break;
          case "FAILED":
            failed++;
            break;
          case "REPLIED":
            replied++;
            break;
        }
      }
      let jobStatus = "QUEUED";
      const total = messages2.length;
      if (failed === total) {
        jobStatus = "FAILED";
      } else if (failed > 0 && delivered + read + replied + failed === total) {
        jobStatus = "PARTIAL";
      } else if (read === total || replied > 0) {
        jobStatus = "READ";
      } else if (delivered === total) {
        jobStatus = "DELIVERED";
      } else if (sent > 0 || delivered > 0 || read > 0) {
        jobStatus = "SENT";
      } else if (pending > 0) {
        jobStatus = "PENDING";
      }
      if (job.queued !== queued || job.pending !== pending || job.sent !== sent || job.delivered !== delivered || job.read !== read || job.failed !== failed || job.replied !== replied || job.status !== jobStatus) {
        await storage.updateJob(jobId, {
          queued,
          pending,
          sent,
          delivered,
          read,
          failed,
          replied,
          status: jobStatus
        });
      }
      console.log(`[Job ${jobId}] Recalculated statistics:`, {
        queued,
        pending,
        sent,
        delivered,
        read,
        failed,
        replied,
        status: jobStatus
      });
      const response = {
        ...job,
        queued,
        pending,
        sent,
        delivered,
        read,
        failed,
        replied,
        status: jobStatus,
        messages: messages2
      };
      res.json(response);
    } catch (error) {
      console.error("Get job error:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });
  app2.get("/api/admin/balance", requireAuth, requireAdmin, async (req, res) => {
    try {
      const balance = await storage.getMainDaysBalance();
      res.json({ balance });
    } catch (error) {
      console.error("Get main balance error:", error);
      res.status(500).json({ error: "Failed to fetch main balance" });
    }
  });
  app2.post("/api/admin/balance/topup", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { days, note } = req.body;
      if (!days || days < 1) {
        return res.status(400).json({ error: "Days must be at least 1" });
      }
      const newBalance = await storage.updateMainDaysBalance(days);
      await storage.createBalanceTransaction({
        type: "topup",
        days,
        channelId: null,
        userId: req.userId,
        note: note || `Admin top-up by ${req.userId}`
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "TOPUP_BALANCE",
        meta: {
          days,
          newBalance,
          adminId: req.userId
        }
      });
      res.json({ success: true, balance: newBalance });
    } catch (error) {
      console.error("Top up balance error:", error);
      res.status(500).json({ error: "Failed to top up balance" });
    }
  });
  app2.get("/api/admin/balance/transactions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const transactions = await storage.getBalanceTransactions(limit);
      const enrichedTransactions = await Promise.all(
        transactions.map(async (tx) => {
          let user = null;
          let channel = null;
          if (tx.userId) {
            const u = await storage.getUser(tx.userId);
            user = u ? { id: u.id, name: u.name, email: u.email } : null;
          }
          if (tx.channelId) {
            const c = await storage.getChannel(tx.channelId);
            channel = c ? { id: c.id, label: c.label } : null;
          }
          return {
            ...tx,
            user,
            channel
          };
        })
      );
      res.json(enrichedTransactions);
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });
  app2.delete("/api/admin/balance/transactions/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      if (isNaN(transactionId)) {
        return res.status(400).json({ error: "Invalid transaction ID" });
      }
      const transaction = await storage.getBalanceTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      let balanceAdjustment = 0;
      if (transaction.type === "topup" || transaction.type === "refund") {
        balanceAdjustment = -transaction.days;
      } else if (transaction.type === "allocate" || transaction.type === "adjustment") {
        balanceAdjustment = transaction.days;
      }
      const currentBalance = await storage.getMainDaysBalance();
      if (currentBalance + balanceAdjustment < 0) {
        return res.status(400).json({
          error: `Cannot delete transaction: would result in negative balance (${currentBalance + balanceAdjustment})`
        });
      }
      await storage.deleteBalanceTransaction(transactionId);
      if (balanceAdjustment !== 0) {
        await storage.updateMainDaysBalance(balanceAdjustment);
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE_TRANSACTION",
        meta: {
          transactionId,
          transactionType: transaction.type,
          days: transaction.days,
          balanceAdjustment,
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete transaction error:", error);
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  });
  app2.post("/api/admin/balance/adjust", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { days, note } = req.body;
      if (!days || days === 0) {
        return res.status(400).json({ error: "Days must be non-zero" });
      }
      const currentBalance = await storage.getMainDaysBalance();
      const newBalance = currentBalance + days;
      if (newBalance < 0) {
        return res.status(400).json({ error: "Insufficient balance to remove days" });
      }
      const updatedBalance = await storage.updateMainDaysBalance(days);
      const transactionType = days > 0 ? "topup" : "adjustment";
      await storage.createBalanceTransaction({
        type: transactionType,
        days: Math.abs(days),
        channelId: null,
        userId: req.userId,
        note: note || `Admin ${days > 0 ? "added" : "removed"} ${Math.abs(days)} days`
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: days > 0 ? "ADD_BALANCE" : "REMOVE_BALANCE",
        meta: {
          days,
          newBalance: updatedBalance,
          adminId: req.userId
        }
      });
      res.json({ success: true, balance: updatedBalance });
    } catch (error) {
      console.error("Adjust balance error:", error);
      res.status(500).json({ error: "Failed to adjust balance" });
    }
  });
  app2.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users2 = await storage.getAllUsers();
      const enrichedUsers = await Promise.all(
        users2.map(async (user) => {
          const subscription = await storage.getActiveSubscriptionForUser(user.id);
          let currentPlan = null;
          if (subscription) {
            currentPlan = await storage.getPlan(subscription.planId);
          }
          const channels2 = await storage.getChannelsForUser(user.id);
          let totalChannelDays = 0;
          for (const channel of channels2) {
            const daysRemaining = await storage.calculateChannelDaysRemaining(channel.id);
            totalChannelDays += daysRemaining;
          }
          let calculatedStatus = user.status;
          if (user.status === "active" || user.status === "expired") {
            const hasActiveChannels = channels2.some((c) => c.status === "ACTIVE");
            calculatedStatus = hasActiveChannels ? "active" : "expired";
          }
          const { passwordHash: _, ...userWithoutPassword } = user;
          return {
            ...userWithoutPassword,
            daysBalance: totalChannelDays,
            // Override deprecated field with calculated channel days
            status: calculatedStatus,
            // Override active/expired based on channels, preserve manual overrides
            currentPlan,
            channelsUsed: channels2.length,
            channelsLimit: currentPlan?.channelsLimit || 0
          };
        })
      );
      res.json(enrichedUsers);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  app2.post("/api/admin/users/:id/add-days", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { days } = req.body;
      if (!days || days <= 0) {
        return res.status(400).json({ error: "Invalid days value" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const updated = await storage.updateUser(userId, {
        daysBalance: (user.daysBalance || 0) + days,
        status: "active"
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "ADD_DAYS",
        meta: {
          entity: "user",
          entityId: userId,
          days,
          adminId: req.userId
        }
      });
      res.json(updated);
    } catch (error) {
      console.error("Add days error:", error);
      res.status(500).json({ error: "Failed to add days" });
    }
  });
  app2.post("/api/admin/users/:id/remove-days", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { days } = req.body;
      if (!days || days <= 0) {
        return res.status(400).json({ error: "Invalid days value" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const newBalance = Math.max(0, (user.daysBalance || 0) - days);
      const updated = await storage.updateUser(userId, {
        daysBalance: newBalance,
        status: newBalance <= 0 ? "expired" : user.status
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "REMOVE_DAYS",
        meta: {
          entity: "user",
          entityId: userId,
          days,
          adminId: req.userId
        }
      });
      res.json(updated);
    } catch (error) {
      console.error("Remove days error:", error);
      res.status(500).json({ error: "Failed to remove days" });
    }
  });
  app2.get("/api/admin/users/:userId/channels", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const channels2 = await storage.getChannelsForUser(userId);
      res.json(channels2);
    } catch (error) {
      console.error("Get user channels error:", error);
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });
  app2.post("/api/admin/users/:userId/channels/:channelId/activate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const channelId = parseInt(req.params.channelId);
      const { days } = req.body;
      if (!days || days < 1) {
        return res.status(400).json({ error: "Days must be at least 1" });
      }
      const mainBalance = await storage.getMainDaysBalance();
      if (mainBalance < days) {
        return res.status(400).json({
          error: "Insufficient main balance",
          details: `Main balance has ${mainBalance} days available. Top up in Admin \u2192 Balances.`
        });
      }
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) {
        return res.status(404).json({ error: "Channel not found" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const newMainBalance = await storage.updateMainDaysBalance(-days);
      const balanceTransaction = await storage.createBalanceTransaction({
        type: "allocate",
        days,
        channelId,
        userId,
        note: `Admin allocated ${days} days to ${user.email}'s channel`
      });
      let whapiResponse = null;
      try {
        if (!channel.whapiChannelId && channel.status === "PENDING") {
          console.log("Creating new WHAPI channel for", channel.label);
          whapiResponse = await createWhapiChannel(channel.label, channel.phone);
          await storage.updateChannel(channelId, {
            whapiChannelId: whapiResponse.id,
            whapiChannelToken: whapiResponse.token,
            phone: whapiResponse.phone || channel.phone,
            whapiStatus: whapiResponse.status,
            stopped: whapiResponse.stopped || false,
            creationTS: whapiResponse.creationTS ? new Date(whapiResponse.creationTS) : null,
            activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null
          });
        } else if (channel.whapiChannelId) {
          console.log("Extending WHAPI channel", channel.whapiChannelId);
          whapiResponse = await extendWhapiChannel(channel.whapiChannelId, days, `Admin add days for ${user.email}`);
        }
      } catch (whapiError) {
        console.error("WHAPI API failed:", whapiError.message);
        await storage.updateMainDaysBalance(days);
        await storage.deleteBalanceTransaction(balanceTransaction.id);
        if (whapiError.message && whapiError.message.includes("402")) {
          return res.status(503).json({
            error: "Insufficient channel days available",
            details: "The system needs to be topped up with days to activate channels. Please contact the administrator."
          });
        }
        return res.status(500).json({
          error: "Failed to create/extend channel",
          details: whapiError.message
        });
      }
      const { updatedChannel } = await storage.addDaysToChannel({
        channelId,
        days,
        source: "ADMIN_MANUAL",
        balanceTransactionId: balanceTransaction.id,
        metadata: {
          adminId: req.userId,
          targetUserEmail: user.email
        }
      });
      if (whapiResponse) {
        await storage.updateChannel(channelId, {
          whapiStatus: whapiResponse.status,
          activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null
        });
      }
      const userChannels = await storage.getChannelsForUser(userId);
      const hasActiveChannels = userChannels.some((c) => c.status === "ACTIVE");
      if (hasActiveChannels && user.status === "expired") {
        await storage.updateUser(userId, { status: "active" });
        console.log(`Updated user ${user.email} status from expired to active`);
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "ADD_DAYS_TO_CHANNEL",
        meta: {
          entity: "channel",
          entityId: channelId,
          targetUserId: userId,
          days,
          adminId: req.userId,
          mainBalanceBefore: mainBalance,
          mainBalanceAfter: newMainBalance,
          channelStatus: updatedChannel.status,
          userStatusUpdated: hasActiveChannels && user.status === "expired"
        }
      });
      res.json({
        success: true,
        channel: await storage.getChannel(channelId),
        mainBalance: newMainBalance
      });
    } catch (error) {
      console.error("Add days to channel error:", error);
      res.status(500).json({ error: "Failed to add days to channel" });
    }
  });
  app2.post("/api/admin/users/:id/ban", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { reason } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (user.role === "admin") {
        return res.status(403).json({ error: "Cannot ban admin users" });
      }
      const updated = await storage.updateUser(userId, { status: "banned" });
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "user",
        targetId: userId,
        action: "BAN_USER",
        reason: reason || null,
        meta: { email: user.email, adminId: req.userId }
      });
      res.json(updated);
    } catch (error) {
      console.error("Ban user error:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  });
  app2.post("/api/admin/users/:id/unban", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      const newStatus = subscription ? "active" : "expired";
      const updated = await storage.updateUser(userId, { status: newStatus });
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "user",
        targetId: userId,
        action: "UNBAN_USER",
        meta: { email: user.email, newStatus, hasActiveSubscription: !!subscription, adminId: req.userId }
      });
      res.json(updated);
    } catch (error) {
      console.error("Unban user error:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  });
  app2.post("/api/admin/impersonate/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const targetUserId = parseInt(req.params.userId);
      if (targetUserId === req.userId) {
        return res.status(400).json({ error: "You cannot impersonate yourself" });
      }
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (targetUser.role === "admin") {
        return res.status(403).json({ error: "Cannot impersonate other administrators" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "user",
        targetId: targetUserId,
        action: "IMPERSONATE_USER",
        meta: {
          targetUserEmail: targetUser.email,
          targetUserName: targetUser.name,
          adminId: req.userId
        }
      });
      const token = generateToken(req.userId, targetUserId);
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      res.json({
        success: true,
        impersonatedUser: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email
        }
      });
    } catch (error) {
      console.error("Impersonate user error:", error);
      res.status(500).json({ error: "Failed to impersonate user" });
    }
  });
  app2.post("/api/admin/exit-impersonation", requireAuth, async (req, res) => {
    try {
      if (!req.isImpersonating || !req.impersonatedUser) {
        return res.status(400).json({ error: "Not currently impersonating" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        // req.userId is the admin ID during impersonation
        targetType: "user",
        targetId: req.impersonatedUser.id,
        // The user that was being impersonated
        action: "EXIT_IMPERSONATION",
        meta: { adminId: req.userId }
      });
      const token = generateToken(req.userId);
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Exit impersonation error:", error);
      res.status(500).json({ error: "Failed to exit impersonation" });
    }
  });
  app2.patch("/api/admin/users/:id/overrides", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { dailyMessagesLimit, bulkMessagesLimit, channelsLimit, chatbotsLimit, phonebookLimit, pageAccess } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }
      const overrides = {};
      if (dailyMessagesLimit !== void 0) overrides.dailyMessagesLimit = dailyMessagesLimit;
      if (bulkMessagesLimit !== void 0) overrides.bulkMessagesLimit = bulkMessagesLimit;
      if (channelsLimit !== void 0) overrides.channelsLimit = channelsLimit;
      if (chatbotsLimit !== void 0) overrides.chatbotsLimit = chatbotsLimit;
      if (phonebookLimit !== void 0) overrides.phonebookLimit = phonebookLimit;
      if (pageAccess !== void 0) overrides.pageAccess = pageAccess;
      await storage.updateSubscription(subscription.id, overrides);
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "subscription",
        targetId: subscription.id,
        action: "UPDATE_OVERRIDES",
        meta: { userId, email: user.email, overrides, adminId: req.userId }
      });
      res.json({ success: true, subscription: await storage.getActiveSubscriptionForUser(userId) });
    } catch (error) {
      console.error("Update overrides error:", error);
      res.status(500).json({ error: "Failed to update overrides" });
    }
  });
  app2.delete("/api/admin/channels/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }
      const user = await storage.getUser(channel.userId);
      let whapiDeleteSuccess = false;
      let whapiError = null;
      if (channel.whapiChannelId) {
        try {
          await deleteWhapiChannel(channel.whapiChannelId);
          whapiDeleteSuccess = true;
        } catch (error) {
          whapiError = error.message;
          if (error.message?.includes("404") || error.message?.includes("not found")) {
            whapiDeleteSuccess = true;
          } else {
            return res.status(500).json({
              error: "Failed to delete channel from provider",
              details: whapiError
            });
          }
        }
      } else {
        whapiDeleteSuccess = true;
      }
      const daysToReturn = channel.daysRemaining || 0;
      if (daysToReturn > 0) {
        await storage.updateMainDaysBalance(daysToReturn);
        await storage.createBalanceTransaction({
          type: "refund",
          days: daysToReturn,
          channelId: channel.id,
          userId: channel.userId,
          note: `Channel deleted by admin - ${daysToReturn} days returned to main balance`
        });
      }
      await storage.deleteChannel(channelId);
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "channel",
        targetId: channelId,
        action: "DELETE_CHANNEL",
        meta: {
          channelLabel: channel.label,
          userId: channel.userId,
          userEmail: user?.email,
          daysReturned: daysToReturn,
          whapiChannelId: channel.whapiChannelId,
          whapiDeleteSuccess,
          whapiError,
          adminId: req.userId
        }
      });
      res.json({
        success: true,
        daysReturned: daysToReturn,
        mainBalance: await storage.getMainDaysBalance()
      });
    } catch (error) {
      console.error("Delete channel error:", error);
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });
  app2.get("/api/admin/users/:id/effective-limits", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      if (!subscription) {
        return res.json({
          dailyMessagesLimit: 0,
          bulkMessagesLimit: 0,
          channelsLimit: 0,
          chatbotsLimit: 0,
          pageAccess: {}
        });
      }
      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const effectiveLimits = {
        dailyMessagesLimit: subscription.dailyMessagesLimit ?? plan.dailyMessagesLimit,
        bulkMessagesLimit: subscription.bulkMessagesLimit ?? plan.bulkMessagesLimit,
        channelsLimit: subscription.channelsLimit ?? plan.channelsLimit,
        chatbotsLimit: subscription.chatbotsLimit ?? plan.chatbotsLimit,
        pageAccess: {
          ...typeof plan.pageAccess === "object" && plan.pageAccess !== null ? plan.pageAccess : {},
          ...typeof subscription.pageAccess === "object" && subscription.pageAccess !== null ? subscription.pageAccess : {}
        }
      };
      res.json(effectiveLimits);
    } catch (error) {
      console.error("Get effective limits error:", error);
      res.status(500).json({ error: "Failed to get effective limits" });
    }
  });
  app2.get("/api/admin/users/:id/workflows", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const workflows2 = await storage.getWorkflowsForUser(userId);
      const workflowData = workflows2.map((w) => ({
        id: w.id,
        name: w.name,
        webhookToken: w.webhookToken,
        isActive: w.isActive
      }));
      res.json(workflowData);
    } catch (error) {
      console.error("Get user workflows error:", error);
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });
  app2.get("/api/admin/offline-payments", requireAuth, requireAdmin, async (req, res) => {
    try {
      const payments = await storage.getOfflinePayments();
      const enrichedPayments = await Promise.all(
        payments.map(async (payment) => {
          const user = await storage.getUser(payment.userId);
          const plan = await storage.getPlan(payment.planId);
          return {
            ...payment,
            user: user ? { id: user.id, name: user.name, email: user.email } : null,
            plan: plan ? { id: plan.id, name: plan.name } : null
          };
        })
      );
      res.json(enrichedPayments);
    } catch (error) {
      console.error("Get offline payments error:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });
  app2.post("/api/admin/offline-payments/:id/approve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const payment = await storage.getOfflinePayment(paymentId);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }
      await storage.updateOfflinePayment(paymentId, { status: "APPROVED" });
      const plan = await storage.getPlan(payment.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      await storage.updateUser(payment.userId, { status: "active" });
      let couponId;
      if (payment.couponCode) {
        const coupon = await storage.getCouponByCode(payment.couponCode);
        if (coupon) {
          couponId = coupon.id;
          await storage.updateCoupon(coupon.id, {
            usedCount: coupon.usedCount + 1
          });
        }
      }
      await storage.createSubscription({
        userId: payment.userId,
        planId: payment.planId,
        couponId,
        // Link coupon to subscription (one-time discount)
        status: "ACTIVE",
        durationType: "MONTHLY",
        provider: "OFFLINE",
        transactionId: payment.reference,
        termsVersion: payment.termsVersion,
        agreedAt: payment.createdAt
        // Use payment creation time as terms agreement time
      });
      const paymentType = payment.type || "OFFLINE_PAYMENT";
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "APPROVE_PAYMENT",
        meta: {
          entity: "offline_payment",
          entityId: paymentId,
          paymentType,
          adminId: req.userId
        }
      });
      res.json({ success: true, message: "Payment approved. Channel is now active. Admin can add days manually." });
    } catch (error) {
      console.error("Approve payment error:", error);
      res.status(500).json({ error: "Failed to approve payment" });
    }
  });
  app2.post("/api/admin/offline-payments/:id/reject", requireAuth, requireAdmin, async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const payment = await storage.getOfflinePayment(paymentId);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }
      await storage.updateOfflinePayment(paymentId, { status: "REJECTED" });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "REJECT_PAYMENT",
        meta: {
          entity: "offline_payment",
          entityId: paymentId,
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Reject payment error:", error);
      res.status(500).json({ error: "Failed to reject payment" });
    }
  });
  app2.delete("/api/admin/offline-payments/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const payment = await storage.getOfflinePayment(paymentId);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }
      await storage.deleteOfflinePayment(paymentId);
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE_PAYMENT",
        meta: {
          entity: "offline_payment",
          entityId: paymentId,
          adminId: req.userId,
          deletedPayment: {
            userId: payment.userId,
            planId: payment.planId,
            amount: payment.amount,
            reference: payment.reference,
            status: payment.status
          }
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete payment error:", error);
      res.status(500).json({ error: "Failed to delete payment" });
    }
  });
  app2.post("/api/plan-requests", async (req, res) => {
    try {
      const data = insertPlanRequestSchema.parse(req.body);
      const freeEmailProviders = [
        "gmail.com",
        "yahoo.com",
        "hotmail.com",
        "outlook.com",
        "aol.com",
        "icloud.com",
        "mail.com",
        "protonmail.com",
        "yandex.com",
        "zoho.com",
        "gmx.com"
      ];
      const emailDomain = data.businessEmail.split("@")[1]?.toLowerCase();
      if (freeEmailProviders.includes(emailDomain)) {
        return res.status(400).json({
          error: "Please use a business email address (not a free email provider)"
        });
      }
      const request = await storage.createPlanRequest(data);
      res.json(request);
    } catch (error) {
      console.error("Create plan request error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to submit request" });
    }
  });
  app2.get("/api/admin/plan-requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = req.query.status;
      const requests = await storage.getPlanRequests(status);
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const plan = await storage.getPlan(request.planId);
          return {
            ...request,
            plan: plan ? { id: plan.id, name: plan.name, requestType: plan.requestType } : null
          };
        })
      );
      res.json(enrichedRequests);
    } catch (error) {
      console.error("Get plan requests error:", error);
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });
  app2.patch("/api/admin/plan-requests/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const { status } = req.body;
      if (!status || !["PENDING", "REVIEWED", "CONTACTED", "CONVERTED", "REJECTED"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const updated = await storage.updatePlanRequest(requestId, { status });
      if (!updated) {
        return res.status(404).json({ error: "Request not found" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_PLAN_REQUEST",
        meta: {
          entity: "plan_request",
          entityId: requestId,
          newStatus: status
        }
      });
      res.json(updated);
    } catch (error) {
      console.error("Update plan request error:", error);
      res.status(500).json({ error: "Failed to update request" });
    }
  });
  app2.get("/api/whapi/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const partnerToken = process.env.WHAPI_PARTNER_TOKEN || (await storage.getSetting("whapi_partner_token"))?.value || "";
      const baseUrl = process.env.WHAPI_BASE || (await storage.getSetting("whapi_base_url"))?.value || "https://manager.whapi.cloud";
      const projectId = process.env.WHAPI_PROJECT_ID || (await storage.getSetting("whapi_project_id"))?.value || "";
      res.json({
        partnerToken: partnerToken ? "***" + partnerToken.slice(-4) : "",
        // Mask token
        baseUrl,
        projectId
      });
    } catch (error) {
      console.error("Get WHAPI settings error:", error);
      res.status(500).json({ error: "Failed to get WHAPI settings" });
    }
  });
  app2.put("/api/whapi/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settingsSchema = z2.object({
        partnerToken: z2.string().min(1).optional(),
        baseUrl: z2.string().url().optional(),
        projectId: z2.string().min(1).optional()
      });
      const validationResult = settingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const { partnerToken, baseUrl, projectId } = validationResult.data;
      if (partnerToken) {
        await storage.setSetting("whapi_partner_token", partnerToken);
      }
      if (baseUrl) {
        await storage.setSetting("whapi_base_url", baseUrl);
      }
      if (projectId) {
        await storage.setSetting("whapi_project_id", projectId);
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_WHAPI_SETTINGS",
        meta: {
          entity: "settings",
          entityId: null,
          hasToken: !!partnerToken,
          baseUrl,
          hasProjectId: !!projectId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Update WHAPI settings error:", error);
      res.status(500).json({ error: "Failed to update WHAPI settings" });
    }
  });
  app2.post("/api/whapi/test", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { testWhapiConnection: testWhapiConnection2 } = await Promise.resolve().then(() => (init_whapi(), whapi_exports));
      const result = await testWhapiConnection2();
      res.json(result);
    } catch (error) {
      console.error("Test WHAPI connection error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  app2.get("/api/admin/plans", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allPlans = await storage.getPlans();
      res.json(allPlans);
    } catch (error) {
      console.error("Get admin plans error:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });
  app2.post("/api/admin/plans", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validationResult = insertPlanSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const plan = await storage.createPlan(validationResult.data);
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "plan",
        targetId: plan.id,
        action: "CREATE_PLAN",
        meta: { planName: plan.name }
      });
      res.json(plan);
    } catch (error) {
      console.error("Create plan error:", error);
      res.status(500).json({ error: "Failed to create plan" });
    }
  });
  app2.put("/api/admin/plans/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      console.log("[PlanUpdate] Received request body keys:", Object.keys(req.body));
      console.log("[PlanUpdate] isPopular in request:", req.body.isPopular);
      console.log("[PlanUpdate] enabledBillingPeriods in request:", req.body.enabledBillingPeriods);
      console.log("[PlanUpdate] Discount percentages:", {
        quarterly: req.body.quarterlyDiscountPercent,
        semiAnnual: req.body.semiAnnualDiscountPercent,
        annual: req.body.annualDiscountPercent
      });
      const plan = await storage.updatePlan(planId, req.body);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      console.log("[PlanUpdate] After update, plan.isPopular:", plan.isPopular);
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "plan",
        targetId: plan.id,
        action: "UPDATE_PLAN",
        meta: { planName: plan.name, changes: req.body }
      });
      res.json(plan);
    } catch (error) {
      console.error("Update plan error:", error);
      res.status(500).json({ error: "Failed to update plan" });
    }
  });
  app2.post("/api/admin/plans/:id/duplicate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const original = await storage.getPlan(planId);
      if (!original) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const originalPaymentMethods = Array.isArray(original.paymentMethods) ? original.paymentMethods : [];
      const duplicatePaymentMethods = originalPaymentMethods.filter((method) => method !== "paypal");
      const duplicated = await storage.createPlan({
        name: `${original.name} (Copy)`,
        currency: original.currency,
        price: original.price,
        displayCurrency: original.displayCurrency,
        displayPrice: original.displayPrice,
        billingPeriod: original.billingPeriod,
        requestType: original.requestType,
        paymentMethods: duplicatePaymentMethods,
        // Remove PayPal - admin must add with new Plan ID
        paypalPlanId: null,
        // Reset PayPal Plan ID for duplicates (must be unique per plan)
        published: false,
        publishedOnHomepage: original.publishedOnHomepage,
        sortOrder: original.sortOrder + 1,
        dailyMessagesLimit: original.dailyMessagesLimit,
        bulkMessagesLimit: original.bulkMessagesLimit,
        channelsLimit: original.channelsLimit,
        chatbotsLimit: original.chatbotsLimit,
        phonebookLimit: original.phonebookLimit,
        maxImageSizeMB: original.maxImageSizeMB,
        maxVideoSizeMB: original.maxVideoSizeMB,
        maxDocumentSizeMB: original.maxDocumentSizeMB,
        pageAccess: original.pageAccess,
        features: original.features,
        quarterlyDiscountPercent: original.quarterlyDiscountPercent,
        semiAnnualDiscountPercent: original.semiAnnualDiscountPercent,
        annualDiscountPercent: original.annualDiscountPercent,
        enabledBillingPeriods: original.enabledBillingPeriods,
        isPopular: false
        // Reset popular flag for duplicates
      });
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "plan",
        targetId: duplicated.id,
        action: "DUPLICATE_PLAN",
        meta: { originalPlanId: planId, newPlanName: duplicated.name }
      });
      res.json(duplicated);
    } catch (error) {
      console.error("Duplicate plan error:", error);
      res.status(500).json({ error: "Failed to duplicate plan" });
    }
  });
  app2.patch("/api/admin/plans/:id/publish", requireAuth, requireAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const { published } = req.body;
      const plan = await storage.updatePlan(planId, { published });
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "plan",
        targetId: plan.id,
        action: published ? "PUBLISH_PLAN" : "UNPUBLISH_PLAN",
        meta: { planName: plan.name }
      });
      res.json(plan);
    } catch (error) {
      console.error("Toggle plan publish error:", error);
      res.status(500).json({ error: "Failed to toggle plan publish status" });
    }
  });
  app2.delete("/api/admin/plans/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      console.log(`[DELETE Plan] Attempting to delete plan ID ${planId}: ${plan.name}`);
      try {
        await storage.deletePlan(planId);
        console.log(`[DELETE Plan] Successfully deleted plan ID ${planId}`);
        await storage.createAuditLog({
          actorUserId: req.userId,
          targetType: "plan",
          targetId: planId,
          action: "DELETE_PLAN",
          meta: { planName: plan.name }
        });
        res.json({ success: true });
      } catch (deleteError) {
        if (deleteError.code === "23503") {
          console.log(`[DELETE Plan] Cannot delete plan ${planId} - has related records`);
          return res.status(400).json({
            error: "Cannot delete this plan because it has active subscriptions, offline payments, or plan requests. Please remove or reassign those first."
          });
        }
        throw deleteError;
      }
    } catch (error) {
      console.error("Delete plan error:", error);
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });
  app2.get("/api/admin/coupons", requireAuth, requireAdmin, async (req, res) => {
    try {
      const coupons2 = await storage.getCoupons();
      res.json(coupons2);
    } catch (error) {
      console.error("Get coupons error:", error);
      res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });
  app2.post("/api/admin/coupons", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("Creating coupon with data:", JSON.stringify(req.body, null, 2));
      const validationResult = insertCouponSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error("Coupon validation failed:", JSON.stringify(validationResult.error.flatten(), null, 2));
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten()
        });
      }
      const coupon = await storage.createCoupon(validationResult.data);
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "coupon",
        targetId: coupon.id,
        action: "CREATE_COUPON",
        meta: { code: coupon.code, discountPercent: coupon.discountPercent }
      });
      res.json(coupon);
    } catch (error) {
      console.error("Create coupon error:", error);
      if (error.code === "23505") {
        return res.status(400).json({ error: "Coupon code already exists" });
      }
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });
  app2.patch("/api/admin/coupons/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const couponId = parseInt(req.params.id);
      const updateData = { ...req.body };
      if (updateData.expiresAt) {
        updateData.expiresAt = new Date(updateData.expiresAt);
      }
      const coupon = await storage.updateCoupon(couponId, updateData);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "coupon",
        targetId: coupon.id,
        action: "UPDATE_COUPON",
        meta: { code: coupon.code, changes: req.body }
      });
      res.json(coupon);
    } catch (error) {
      console.error("Update coupon error:", error);
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });
  app2.delete("/api/admin/coupons/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const couponId = parseInt(req.params.id);
      const coupon = await storage.getCoupon(couponId);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }
      await storage.deleteCoupon(couponId);
      await storage.createAuditLog({
        actorUserId: req.userId,
        targetType: "coupon",
        targetId: couponId,
        action: "DELETE_COUPON",
        meta: { code: coupon.code }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete coupon error:", error);
      res.status(500).json({ error: "Failed to delete coupon" });
    }
  });
  app2.post("/api/validate-coupon", requireAuth, async (req, res) => {
    try {
      const { code, planId } = req.body;
      if (!code || !planId) {
        return res.status(400).json({ error: "Code and planId are required" });
      }
      const result = await storage.validateCoupon(code, req.userId, planId);
      res.json(result);
    } catch (error) {
      console.error("Validate coupon error:", error);
      res.status(500).json({ error: "Failed to validate coupon" });
    }
  });
  app2.post("/api/coupons/validate", requireAuth, async (req, res) => {
    try {
      const { code, planId } = req.body;
      if (!code || !planId) {
        return res.status(400).json({ error: "Code and planId are required" });
      }
      const result = await storage.validateCoupon(code, req.userId, planId);
      console.log("Coupon validation result:", JSON.stringify(result, null, 2));
      res.json(result);
    } catch (error) {
      console.error("Validate coupon error:", error);
      res.status(500).json({ error: "Failed to validate coupon" });
    }
  });
  app2.post("/webhooks/whapi/:userId/:webhookToken", async (req, res) => {
    try {
      const { userId, webhookToken } = req.params;
      const webhookPayload = req.body;
      console.log(`
${"=".repeat(80)}`);
      console.log(`[WORKFLOW WEBHOOK] Received for user ${userId} at ${(/* @__PURE__ */ new Date()).toISOString()}`);
      console.log(`[WORKFLOW WEBHOOK] Token: ${webhookToken.substring(0, 8)}...`);
      console.log(`[WORKFLOW WEBHOOK] Full token: ${webhookToken}`);
      console.log(`[WORKFLOW WEBHOOK] Event type: ${webhookPayload.event?.type || "unknown"}`);
      const msg = webhookPayload.messages?.[0];
      if (msg) {
        console.log(`[WORKFLOW WEBHOOK] Message type: ${msg.type}`);
        console.log(`[WORKFLOW WEBHOOK] Reply type: ${msg.reply?.type || "none"}`);
        console.log(`[WORKFLOW WEBHOOK] From: ${msg.from}`);
        console.log(`[WORKFLOW WEBHOOK] Has context.quoted_id: ${!!msg.context?.quoted_id}`);
        if (msg.reply?.type === "buttons_reply") {
          console.log(`[WORKFLOW WEBHOOK] CAROUSEL/BUTTON CLICK DETECTED!`);
          console.log(`[WORKFLOW WEBHOOK] Button ID: ${msg.reply.buttons_reply?.id}`);
          console.log(`[WORKFLOW WEBHOOK] Button title: ${msg.reply.buttons_reply?.title}`);
        }
        if (msg.reply?.type === "list_reply") {
          console.log(`[WORKFLOW WEBHOOK] LIST CLICK DETECTED!`);
          console.log(`[WORKFLOW WEBHOOK] List ID: ${msg.reply.list_reply?.id}`);
          console.log(`[WORKFLOW WEBHOOK] List title: ${msg.reply.list_reply?.title}`);
        }
      }
      console.log(`[WORKFLOW WEBHOOK] Full payload:`, JSON.stringify(webhookPayload, null, 2));
      console.log(`${"=".repeat(80)}
`);
      const workflow = await db.select().from(workflows).where(
        and2(
          eq2(workflows.userId, parseInt(userId)),
          eq2(workflows.webhookToken, webhookToken)
        )
      ).limit(1);
      if (!workflow || workflow.length === 0) {
        console.error(`[WORKFLOW WEBHOOK] INVALID TOKEN!`);
        console.error(`[WORKFLOW WEBHOOK] User ID: ${userId}, Token: ${webhookToken}`);
        const userWorkflows = await db.select({ id: workflows.id, name: workflows.name, token: workflows.webhookToken }).from(workflows).where(eq2(workflows.userId, parseInt(userId)));
        console.error(`[WORKFLOW WEBHOOK] User ${userId} has ${userWorkflows.length} workflows with tokens:`);
        userWorkflows.forEach((wf, idx) => {
          console.error(`  [${idx + 1}] Workflow "${wf.name}" (ID: ${wf.id}): ${wf.token?.substring(0, 8)}...${wf.token?.slice(-4)}`);
        });
        return res.status(401).json({ error: "Invalid webhook token" });
      }
      const workflowRecord = workflow[0];
      if (!workflowRecord.isActive) {
        console.log(`Workflow ${workflowRecord.id} is inactive. Logging message but not sending responses.`);
        await db.insert(workflowExecutions).values({
          workflowId: workflowRecord.id,
          phone: webhookPayload.messages?.[0]?.from || "unknown",
          messageType: "other",
          triggerData: webhookPayload,
          responsesSent: [],
          status: "SUCCESS",
          errorMessage: "Workflow inactive - message logged only"
        });
        return res.json({ success: true, message: "Workflow is inactive. Message logged only." });
      }
      const activeWorkflow = workflowRecord;
      const incomingMessage = webhookPayload.messages?.[0];
      if (!incomingMessage) {
        return res.json({ success: true, message: "No message to process" });
      }
      if (incomingMessage.from_me === true) {
        console.log("Ignoring outbound message (from_me === true)");
        return res.json({ success: true, message: "Outbound message ignored" });
      }
      const hasTextContent = incomingMessage.text?.body && incomingMessage.text.body.trim().length > 0;
      const hasButtonReply = incomingMessage.reply?.type === "buttons_reply" || incomingMessage.reply?.type === "list_reply" || incomingMessage.button?.id;
      if (!hasTextContent && !hasButtonReply) {
        console.log("Ignoring system event/status update (no text content or button reply):", {
          type: incomingMessage.type,
          hasText: !!incomingMessage.text,
          hasReply: !!incomingMessage.reply,
          hasButton: !!incomingMessage.button
        });
        return res.json({ success: true, message: "System event ignored" });
      }
      const chatId = incomingMessage.chat_id || "";
      const phone = chatId.split("@")[0];
      const isGroupChat = chatId.endsWith("@g.us");
      if (isGroupChat) {
        console.log(`Ignoring group message from chat_id: ${chatId}`);
        return res.json({ success: true, message: "Group messages are not supported by workflows" });
      }
      let messageType = "other";
      let rawButtonId = "";
      if (incomingMessage.reply?.type === "buttons_reply") {
        messageType = "button_reply";
        rawButtonId = incomingMessage.reply.buttons_reply?.id || "";
      } else if (incomingMessage.button?.id) {
        messageType = "button_reply";
        rawButtonId = incomingMessage.button.id;
      } else if (incomingMessage.reply?.type === "list_reply") {
        messageType = "button_reply";
        rawButtonId = incomingMessage.reply.list_reply?.id || "";
      } else if (incomingMessage.text) {
        messageType = "text";
      }
      const buttonId = rawButtonId.includes(":") ? rawButtonId.split(":").pop() || "" : rawButtonId;
      const textBody = incomingMessage.text?.body || "";
      console.log(`Message type: ${messageType}, Raw ID: ${rawButtonId}, Extracted ID: ${buttonId}`);
      if (messageType === "button_reply" && phone) {
        try {
          let buttonTitle = "";
          if (incomingMessage.reply?.type === "buttons_reply") {
            buttonTitle = incomingMessage.reply.buttons_reply?.title || "";
          } else if (incomingMessage.reply?.type === "list_reply") {
            buttonTitle = incomingMessage.reply.list_reply?.title || "";
          } else if (incomingMessage.button?.text) {
            buttonTitle = incomingMessage.button.text;
          }
          if (buttonTitle && buttonTitle.trim().length > 0) {
            const buttonTitleNormalized = buttonTitle.trim();
            const keywordsSetting = await storage.getSetting("subscriber_keywords");
            const keywords = keywordsSetting?.value ? JSON.parse(keywordsSetting.value) : { subscribe: ["Subscribe"], unsubscribe: ["Unsubscribe"] };
            const matchesSubscribe = keywords.subscribe.some(
              (kw) => kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
            );
            const matchesUnsubscribe = keywords.unsubscribe.some(
              (kw) => kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
            );
            if (matchesSubscribe || matchesUnsubscribe) {
              const status = matchesSubscribe ? "subscribed" : "unsubscribed";
              await storage.upsertSubscriber({
                userId: activeWorkflow.userId,
                phone,
                name: "",
                // Default empty name, can be edited later
                status
              });
              console.log(`[Subscriber] ${phone} ${status} via button: "${buttonTitle}"`);
            }
          }
        } catch (subscriberError) {
          console.error(`[Subscriber] Error processing subscriber: ${subscriberError.message}`);
        }
      }
      const executionLog = {
        workflowId: activeWorkflow.id,
        phone,
        messageType,
        triggerData: webhookPayload,
        responsesSent: [],
        status: "SUCCESS",
        errorMessage: null
      };
      try {
        if (messageType === "text") {
          const msgTimestamp = dayjs.unix(incomingMessage.timestamp || Date.now() / 1e3);
          const msgTimeInBahrain = msgTimestamp.tz("Asia/Bahrain");
          const dateLocal = msgTimeInBahrain.format("YYYY-MM-DD");
          let isFirstMessageToday = false;
          try {
            await db.insert(firstMessageFlags).values({
              phone,
              dateLocal,
              firstMsgTs: /* @__PURE__ */ new Date()
            });
            isFirstMessageToday = true;
            console.log(`First message of day for ${phone} on ${dateLocal}`);
          } catch (error) {
            if (error.code === "23505" || error.constraint?.includes("first_message_flags_phone_date_idx")) {
              isFirstMessageToday = false;
              console.log(`Not first message of day for ${phone} on ${dateLocal}`);
            } else {
              throw error;
            }
          }
          if (isFirstMessageToday) {
            const allActiveWorkflows = await db.select().from(workflows).where(
              and2(
                eq2(workflows.userId, activeWorkflow.userId),
                eq2(workflows.isActive, true)
              )
            );
            const workflowsWithEntryNodes = allActiveWorkflows.filter((wf) => wf.entryNodeId !== null);
            console.log(`[First Message of Day] Found ${workflowsWithEntryNodes.length} active workflows with entry nodes for user ${activeWorkflow.userId}`);
            for (const workflow2 of workflowsWithEntryNodes) {
              try {
                const definition = workflow2.definitionJson;
                const entryNodeId = workflow2.entryNodeId;
                console.log(`[Workflow ${workflow2.id}: ${workflow2.name}] Entry node ID: ${entryNodeId}, Total nodes: ${definition.nodes?.length || 0}`);
                if (!entryNodeId) {
                  console.log(`[Workflow ${workflow2.id}: ${workflow2.name}] No entry node configured - skipping`);
                  continue;
                }
                const entryNode = definition.nodes?.find((n) => n.id === entryNodeId);
                if (!entryNode) {
                  console.log(`[Workflow ${workflow2.id}: ${workflow2.name}] Entry node ${entryNodeId} not found in workflow definition`);
                  continue;
                }
                console.log(`[Workflow ${workflow2.id}: ${workflow2.name}] Found entry node, sending message...`);
                try {
                  const response = await sendNodeMessage(phone, entryNode, workflow2.userId, workflow2.id);
                  if (workflow2.id === activeWorkflow.id) {
                    executionLog.responsesSent.push(response);
                  }
                  console.log(`[Workflow ${workflow2.id}: ${workflow2.name}] Sent welcome message to ${phone} from entry node ${entryNodeId}`);
                  await db.insert(workflowExecutions).values({
                    workflowId: workflow2.id,
                    phone,
                    messageType: "text",
                    triggerData: { trigger: "first_message_of_day", phone, dateLocal },
                    responsesSent: [response],
                    status: "SUCCESS",
                    errorMessage: null
                  });
                } catch (sendError) {
                  const errorMsg = sendError.message || String(sendError);
                  console.error(`[Workflow ${workflow2.id}: ${workflow2.name}] Failed to send entry node message: ${errorMsg}`);
                  await db.insert(workflowExecutions).values({
                    workflowId: workflow2.id,
                    phone,
                    messageType: "text",
                    triggerData: { trigger: "first_message_of_day", phone, dateLocal },
                    responsesSent: [],
                    status: "ERROR",
                    errorMessage: `Failed to send welcome message: ${errorMsg}`
                  });
                  if (workflow2.id === activeWorkflow.id) {
                    executionLog.errorMessage = `Failed to send welcome message: ${errorMsg}`;
                    executionLog.status = "ERROR";
                  }
                }
                const conversationState = await db.select().from(conversationStates).where(
                  and2(
                    eq2(conversationStates.workflowId, workflow2.id),
                    eq2(conversationStates.phone, phone)
                  )
                ).limit(1);
                const now = /* @__PURE__ */ new Date();
                if (conversationState.length) {
                  await db.update(conversationStates).set({
                    lastMessageAt: now,
                    lastMessageDate: now,
                    currentNodeId: entryNodeId,
                    updatedAt: now
                  }).where(eq2(conversationStates.id, conversationState[0].id));
                } else {
                  await db.insert(conversationStates).values({
                    workflowId: workflow2.id,
                    phone,
                    lastMessageAt: now,
                    lastMessageDate: now,
                    currentNodeId: entryNodeId
                  });
                }
              } catch (workflowError) {
                const errorMsg = workflowError.message || String(workflowError);
                console.error(`[Workflow ${workflow2.id}: ${workflow2.name}] Critical error during first message processing: ${errorMsg}`);
                try {
                  await db.insert(workflowExecutions).values({
                    workflowId: workflow2.id,
                    phone,
                    messageType: "text",
                    triggerData: { trigger: "first_message_of_day", phone, dateLocal },
                    responsesSent: [],
                    status: "ERROR",
                    errorMessage: `Critical workflow error: ${errorMsg}`
                  });
                } catch (logError) {
                  console.error(`[Workflow ${workflow2.id}: ${workflow2.name}] Failed to log error: ${logError}`);
                }
                if (workflow2.id === activeWorkflow.id) {
                  executionLog.errorMessage = `Critical workflow error: ${errorMsg}`;
                  executionLog.status = "ERROR";
                }
              }
            }
            if (workflowsWithEntryNodes.length === 0) {
              console.log(`[First Message of Day] No active workflows with entry nodes found for user ${activeWorkflow.userId}`);
            }
          } else {
            console.log("Not first message of day, no action taken");
          }
        } else if (messageType === "button_reply") {
          console.log(`
[BUTTON CLICK DEBUG] =============================================`);
          console.log(`[BUTTON CLICK DEBUG] Button click received for workflow ${activeWorkflow.id} (${activeWorkflow.name})`);
          console.log(`[BUTTON CLICK DEBUG] Raw button ID: "${rawButtonId}"`);
          console.log(`[BUTTON CLICK DEBUG] Extracted button ID: "${buttonId}"`);
          console.log(`[BUTTON CLICK DEBUG] Reply type: ${incomingMessage.reply?.type}`);
          console.log(`[BUTTON CLICK DEBUG] context.quoted_id: ${incomingMessage.context?.quoted_id || "MISSING"}`);
          console.log(`[BUTTON CLICK DEBUG] Full context:`, JSON.stringify(incomingMessage.context, null, 2));
          const quotedId = incomingMessage.context?.quoted_id;
          if (quotedId) {
            console.log(`[BUTTON CLICK DEBUG] Looking up quotedId "${quotedId}" in sent_messages table...`);
            try {
              const anyOwnership = await db.select().from(sentMessages).where(eq2(sentMessages.messageId, quotedId)).limit(1);
              console.log(`[BUTTON CLICK DEBUG] sent_messages lookup result:`, JSON.stringify(anyOwnership, null, 2));
              if (anyOwnership && anyOwnership.length > 0) {
                console.log(`[BUTTON CLICK DEBUG] Found ownership record: workflowId=${anyOwnership[0].workflowId}, messageType=${anyOwnership[0].messageType}`);
                if (anyOwnership[0].workflowId !== activeWorkflow.id) {
                  console.log(`[Button Reply] Ignoring button click - message ${quotedId} belongs to workflow ${anyOwnership[0].workflowId}, not workflow ${activeWorkflow.id}`);
                  return res.json({ success: true, message: "Button click belongs to different workflow" });
                }
                console.log(`[Button Reply] Confirmed ownership - processing button click for workflow ${activeWorkflow.id}`);
              } else {
                console.log(`[BUTTON CLICK DEBUG] No record found in sent_messages for quotedId "${quotedId}"`);
                console.log(`[Button Reply] Message ${quotedId} not tracked in sent_messages - allowing all workflows to process (backward compatible)`);
              }
            } catch (ownershipError) {
              console.warn(`[Button Reply] Ownership check failed (table may not exist): ${ownershipError.message} - allowing processing for backward compatibility`);
            }
          } else {
            console.log(`[BUTTON CLICK DEBUG] No context.quoted_id in the webhook - cannot verify ownership`);
          }
          const definition = activeWorkflow.definitionJson;
          console.log(`[Button Reply Debug] =============================================`);
          console.log(`[Button Reply Debug] Workflow: ${activeWorkflow.name} (ID: ${activeWorkflow.id})`);
          console.log(`[Button Reply Debug] Button ID received: "${buttonId}"`);
          console.log(`[Button Reply Debug] Raw Button ID: "${rawButtonId}"`);
          console.log(`[Button Reply Debug] Total edges: ${definition.edges?.length || 0}`);
          console.log(`[Button Reply Debug] Total nodes: ${definition.nodes?.length || 0}`);
          console.log(`[Button Reply Debug] All edges:`, JSON.stringify(definition.edges?.map((e) => ({
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle
          })), null, 2));
          const carouselNodes = definition.nodes?.filter(
            (n) => n.data?.type === "carousel" || n.data?.nodeType === "carousel"
          ) || [];
          console.log(`[Button Reply Debug] Carousel nodes found: ${carouselNodes.length}`);
          carouselNodes.forEach((node, idx) => {
            const cards = node.data?.config?.cards || [];
            console.log(`[Button Reply Debug] Carousel ${idx + 1} (${node.id}):`, JSON.stringify({
              nodeId: node.id,
              cards: cards.map((card) => ({
                cardId: card.id,
                buttons: (card.buttons || []).map((btn) => ({
                  id: btn.id,
                  title: btn.title,
                  type: btn.type
                }))
              }))
            }, null, 2));
          });
          let targetEdge = definition.edges?.find((edge) => edge.sourceHandle === buttonId);
          if (targetEdge) {
            console.log(`[Button Reply Debug] Found edge by sourceHandle: ${JSON.stringify(targetEdge)}`);
          }
          if (!targetEdge) {
            console.log(`[Button Reply Debug] No edge found by sourceHandle, trying fallback 1 (buttons/list rows)...`);
            targetEdge = definition.edges?.find((edge) => {
              const sourceNode = definition.nodes?.find((n) => n.id === edge.source);
              if (!sourceNode) return false;
              const buttons = sourceNode.data?.config?.buttons || [];
              const hasMatchingButton = buttons.some((btn) => btn.id === buttonId);
              const sections = sourceNode.data?.config?.sections || [];
              const hasMatchingRow = sections.some(
                (section) => section.rows?.some((row) => row.id === buttonId)
              );
              const found = hasMatchingButton || hasMatchingRow;
              if (found) {
                console.log(`[Button Reply Debug] Found matching button in node ${sourceNode.id}`);
              }
              return found;
            });
            if (targetEdge) {
              console.log(`[Button Reply Debug] Found edge by fallback 1: ${JSON.stringify(targetEdge)}`);
            }
          }
          if (!targetEdge) {
            console.log(`[Button Reply Debug] No edge found by fallback 1, trying fallback 2 (carousel cards)...`);
            for (const node of definition.nodes || []) {
              const nodeType = node.data?.type || node.data?.nodeType;
              if (nodeType !== "carousel") continue;
              const cards = node.data?.config?.cards || [];
              for (const card of cards) {
                const matchingBtn = (card.buttons || []).find((btn) => btn.id === buttonId);
                if (matchingBtn) {
                  console.log(`[Button Reply Debug] Found matching button "${buttonId}" in carousel card "${card.id}"`);
                  targetEdge = definition.edges?.find(
                    (e) => e.source === node.id && e.sourceHandle === buttonId
                  );
                  if (!targetEdge) {
                    targetEdge = definition.edges?.find(
                      (e) => e.source === node.id && e.sourceHandle === card.id
                    );
                    if (targetEdge) {
                      console.log(`[Button Reply Debug] Found edge by card ID handle: ${JSON.stringify(targetEdge)}`);
                    }
                  }
                  if (!targetEdge) {
                    targetEdge = definition.edges?.find(
                      (e) => e.source === node.id && e.sourceHandle?.includes(matchingBtn.title)
                    );
                    if (targetEdge) {
                      console.log(`[Button Reply Debug] Found edge by button title handle: ${JSON.stringify(targetEdge)}`);
                    }
                  }
                  if (!targetEdge) {
                    const carouselEdges = definition.edges?.filter((e) => e.source === node.id) || [];
                    console.log(`[Button Reply Debug] Carousel edges from node ${node.id}: ${JSON.stringify(carouselEdges)}`);
                    if (carouselEdges.length > 0) {
                      let btnIndex = 0;
                      let found = false;
                      for (const c of cards) {
                        for (const b of c.buttons || []) {
                          if (b.id === buttonId) {
                            found = true;
                            break;
                          }
                          if (b.type === "quick_reply") btnIndex++;
                        }
                        if (found) break;
                      }
                      if (found && btnIndex < carouselEdges.length) {
                        targetEdge = carouselEdges[btnIndex];
                        console.log(`[Button Reply Debug] Using carousel edge by index ${btnIndex}: ${JSON.stringify(targetEdge)}`);
                      }
                    }
                  }
                  if (targetEdge) break;
                }
              }
              if (targetEdge) break;
            }
            if (targetEdge) {
              console.log(`[Button Reply Debug] Found edge by fallback 2 (carousel): ${JSON.stringify(targetEdge)}`);
            }
          }
          if (!targetEdge) {
            console.log(`[Button Reply Debug] No edge found by fallbacks 1 & 2, trying fallback 3 (any matching interactive node)...`);
            const interactiveNodes = definition.nodes?.filter((n) => {
              const nodeType = n.data?.type || n.data?.nodeType;
              return ["carousel", "quickReply", "quickReplyImage", "quickReplyVideo", "listMessage", "buttons"].includes(nodeType);
            }) || [];
            console.log(`[Button Reply Debug] Found ${interactiveNodes.length} interactive nodes`);
            for (const node of interactiveNodes) {
              const nodeType = node.data?.type || node.data?.nodeType;
              const config = node.data?.config || {};
              let hasMatchingButton = false;
              if (nodeType === "carousel") {
                const cards = config.cards || [];
                for (const card of cards) {
                  if ((card.buttons || []).some((btn) => btn.id === buttonId)) {
                    hasMatchingButton = true;
                    console.log(`[Button Reply Debug] Fallback 3: Found button "${buttonId}" in carousel node ${node.id}`);
                    break;
                  }
                }
              }
              if (["quickReply", "quickReplyImage", "quickReplyVideo", "buttons"].includes(nodeType)) {
                if ((config.buttons || []).some((btn) => btn.id === buttonId)) {
                  hasMatchingButton = true;
                  console.log(`[Button Reply Debug] Fallback 3: Found button "${buttonId}" in ${nodeType} node ${node.id}`);
                }
              }
              if (nodeType === "listMessage") {
                const sections = config.sections || [];
                for (const section of sections) {
                  if ((section.rows || []).some((row) => row.id === buttonId)) {
                    hasMatchingButton = true;
                    console.log(`[Button Reply Debug] Fallback 3: Found row "${buttonId}" in listMessage node ${node.id}`);
                    break;
                  }
                }
              }
              if (hasMatchingButton) {
                const nodeEdges = definition.edges?.filter((e) => e.source === node.id) || [];
                console.log(`[Button Reply Debug] Fallback 3: Node ${node.id} has ${nodeEdges.length} outgoing edges`);
                targetEdge = nodeEdges.find((e) => e.sourceHandle === buttonId);
                if (!targetEdge && nodeEdges.length > 0) {
                  console.log(`[Button Reply Debug] Fallback 3: No exact sourceHandle match, using first available edge`);
                  targetEdge = nodeEdges[0];
                }
                if (targetEdge) {
                  console.log(`[Button Reply Debug] Fallback 3: Using edge ${JSON.stringify(targetEdge)}`);
                  break;
                }
              }
            }
          }
          if (targetEdge) {
            const targetNodeId = targetEdge.target;
            const targetNode = definition.nodes?.find((n) => n.id === targetNodeId);
            console.log(`[Button Reply Debug] Target node ID: ${targetNodeId}`);
            console.log(`[Button Reply Debug] Target node found: ${!!targetNode}`);
            if (targetNode) {
              const nodeType = targetNode.data?.type || targetNode.data?.nodeType;
              console.log(`[Button Reply Debug] Target node type: ${nodeType}`);
              let currentNode = targetNode;
              let currentNodeId = targetNodeId;
              let conversationState = await db.select().from(conversationStates).where(
                and2(
                  eq2(conversationStates.workflowId, activeWorkflow.id),
                  eq2(conversationStates.phone, phone)
                )
              ).limit(1);
              if (!conversationState || conversationState.length === 0) {
                const now = /* @__PURE__ */ new Date();
                await db.insert(conversationStates).values({
                  workflowId: activeWorkflow.id,
                  phone,
                  lastMessageAt: now,
                  lastMessageDate: now,
                  currentNodeId,
                  context: {}
                });
                conversationState = await db.select().from(conversationStates).where(
                  and2(
                    eq2(conversationStates.workflowId, activeWorkflow.id),
                    eq2(conversationStates.phone, phone)
                  )
                ).limit(1);
              }
              let state = conversationState[0];
              while (currentNode) {
                const currentNodeType = currentNode.data?.type || currentNode.data?.nodeType;
                if (currentNodeType === "action.http_request") {
                  const httpResult = await executeHttpNode(
                    currentNode,
                    state,
                    incomingMessage,
                    { phone, userId: activeWorkflow.userId }
                  );
                  await db.update(conversationStates).set({
                    lastMessageAt: /* @__PURE__ */ new Date(),
                    currentNodeId,
                    context: httpResult.stateUpdate,
                    updatedAt: /* @__PURE__ */ new Date()
                  }).where(eq2(conversationStates.id, state.id));
                  state = { ...state, context: httpResult.stateUpdate };
                  executionLog.responsesSent.push({
                    nodeId: currentNodeId,
                    nodeType: "action.http_request",
                    success: httpResult.success,
                    handle: httpResult.nextHandle,
                    result: httpResult.result
                  });
                  const nextNodeId = getNextNodeByHandle(currentNodeId, httpResult.nextHandle, definition.edges);
                  if (!nextNodeId) {
                    console.log(`HTTP node ${currentNodeId} has no ${httpResult.nextHandle} handle connected - workflow ends here`);
                    break;
                  }
                  const nextNode = definition.nodes?.find((n) => n.id === nextNodeId);
                  if (!nextNode) {
                    console.log(`Next node ${nextNodeId} not found in workflow definition after HTTP node`);
                    break;
                  }
                  currentNode = nextNode;
                  currentNodeId = nextNodeId;
                } else if (currentNodeType && (currentNodeType.startsWith("message.") || ["quickReply", "quickReplyImage", "quickReplyVideo", "listMessage", "buttons", "carousel"].includes(currentNodeType))) {
                  console.log(`[Button Reply Debug] Sending message node: ${currentNodeId}, type: ${currentNodeType}`);
                  console.log(`[Button Reply Debug] Node config: ${JSON.stringify(currentNode.data?.config)}`);
                  try {
                    const response = await sendNodeMessage(phone, currentNode, activeWorkflow.userId, activeWorkflow.id);
                    console.log(`[Button Reply Debug] Message sent successfully: ${JSON.stringify(response)}`);
                    executionLog.responsesSent.push(response);
                    console.log(`[Button Reply Debug] Responses sent count: ${executionLog.responsesSent.length}`);
                  } catch (sendError) {
                    console.error(`[Button Reply Debug] Failed to send message: ${sendError.message}`);
                    throw sendError;
                  }
                  await db.update(conversationStates).set({
                    lastMessageAt: /* @__PURE__ */ new Date(),
                    currentNodeId,
                    updatedAt: /* @__PURE__ */ new Date()
                  }).where(eq2(conversationStates.id, state.id));
                  const hasInteractiveElements = ["quickReply", "quickReplyImage", "quickReplyVideo", "listMessage", "buttons", "carousel"].includes(currentNodeType);
                  if (hasInteractiveElements) {
                    console.log(`[Button Reply Debug] Stopping execution - message node has interactive elements (${currentNodeType})`);
                    break;
                  }
                  const outgoingEdges = definition.edges?.filter((e) => e.source === currentNodeId) || [];
                  if (outgoingEdges.length === 0) {
                    console.log(`[Button Reply Debug] No outgoing edges from message node ${currentNodeId} - workflow ends here`);
                    break;
                  }
                  const nextEdge = outgoingEdges[0];
                  const nextNodeId = nextEdge.target;
                  const nextNode = definition.nodes?.find((n) => n.id === nextNodeId);
                  if (!nextNode) {
                    console.log(`[Button Reply Debug] Next node ${nextNodeId} not found - workflow ends here`);
                    break;
                  }
                  console.log(`[Button Reply Debug] Continuing to next node: ${nextNodeId} (simple message, no user input required)`);
                  currentNode = nextNode;
                  currentNodeId = nextNodeId;
                } else {
                  console.log(`[Button Reply Debug] Unknown node type: ${currentNodeType} - stopping execution`);
                  console.log(`[Button Reply Debug] Node data: ${JSON.stringify(currentNode.data)}`);
                  break;
                }
              }
              console.log(`[Button Reply Debug] While loop finished. Total responses sent: ${executionLog.responsesSent.length}`);
            } else {
              console.log(`[Button Reply Debug] Target node not found in workflow definition`);
            }
          } else {
            console.log(`[Button Reply Debug] No target edge found for button_id: ${buttonId}`);
            console.log(`[Button Reply Debug] Available sourceHandles in edges:`, definition.edges?.map((e) => e.sourceHandle));
          }
        }
        if (executionLog.responsesSent.length === 0 && !executionLog.errorMessage) {
          console.log(`[Webhook] No responses sent - adding reason to log`);
          executionLog.errorMessage = `No messages sent. Possible reasons: No target node found, node is not a message node, or button triggers native WhatsApp action (call/URL button).`;
        }
        await db.insert(workflowExecutions).values(executionLog);
        res.json({ success: true });
      } catch (processingError) {
        executionLog.status = "ERROR";
        executionLog.errorMessage = processingError.message;
        await db.insert(workflowExecutions).values(executionLog);
        throw processingError;
      }
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed", message: error.message });
    }
  });
  app2.post("/webhooks/bulk/:userId/:bulkWebhookToken", async (req, res) => {
    try {
      const { userId, bulkWebhookToken } = req.params;
      const webhookPayload = req.body;
      console.log(`
${"=".repeat(80)}`);
      console.log(`[BULK WEBHOOK] Received for user ${userId} at ${(/* @__PURE__ */ new Date()).toISOString()}`);
      console.log(`[BULK WEBHOOK] Token: ${bulkWebhookToken.substring(0, 8)}...`);
      console.log(`[BULK WEBHOOK] Event type: ${webhookPayload.event?.type || "unknown"}`);
      const bulkMsg = webhookPayload.messages?.[0];
      if (bulkMsg) {
        console.log(`[BULK WEBHOOK] Message type: ${bulkMsg.type}`);
        console.log(`[BULK WEBHOOK] Reply type: ${bulkMsg.reply?.type || "none"}`);
        console.log(`[BULK WEBHOOK] From: ${bulkMsg.from}`);
        console.log(`[BULK WEBHOOK] Has context.quoted_id: ${!!bulkMsg.context?.quoted_id}`);
        if (bulkMsg.reply?.type === "buttons_reply") {
          console.log(`[BULK WEBHOOK] *** CAROUSEL/BUTTON CLICK DETECTED! ***`);
          console.log(`[BULK WEBHOOK] Button ID: ${bulkMsg.reply.buttons_reply?.id}`);
          console.log(`[BULK WEBHOOK] Button title: ${bulkMsg.reply.buttons_reply?.title}`);
        }
        if (bulkMsg.reply?.type === "list_reply") {
          console.log(`[BULK WEBHOOK] *** LIST CLICK DETECTED! ***`);
          console.log(`[BULK WEBHOOK] List ID: ${bulkMsg.reply.list_reply?.id}`);
          console.log(`[BULK WEBHOOK] List title: ${bulkMsg.reply.list_reply?.title}`);
        }
      }
      console.log(`[BULK WEBHOOK] Full payload:`, JSON.stringify(webhookPayload, null, 2));
      console.log(`${"=".repeat(80)}
`);
      const user = await db.select().from(users).where(
        and2(
          eq2(users.id, parseInt(userId)),
          eq2(users.bulkWebhookToken, bulkWebhookToken)
        )
      ).limit(1);
      if (!user || user.length === 0) {
        console.log("[Bulk Webhook] Token doesn't match bulkWebhookToken, checking if it's a workflow token...");
        const workflowWithToken = await db.select().from(workflows).where(
          and2(
            eq2(workflows.userId, parseInt(userId)),
            eq2(workflows.webhookToken, bulkWebhookToken)
          )
        ).limit(1);
        if (workflowWithToken && workflowWithToken.length > 0) {
          console.log(`[Bulk Webhook] Found workflow ${workflowWithToken[0].id} with this token - redirecting to workflow handler`);
          const messageEvent2 = webhookPayload.messages?.[0];
          if (messageEvent2 && (messageEvent2.reply?.type === "buttons_reply" || messageEvent2.reply?.type === "list_reply")) {
            console.log(`[Bulk Webhook] Processing button/list reply through workflow logic`);
            const workflowRecord = workflowWithToken[0];
            if (!workflowRecord.isActive) {
              console.log(`[Bulk Webhook] Workflow ${workflowRecord.id} is inactive`);
              return res.json({ success: true, message: "Workflow is inactive" });
            }
            const incomingMessage = messageEvent2;
            const chatId = incomingMessage.chat_id || "";
            const phone = chatId.split("@")[0];
            if (chatId.endsWith("@g.us")) {
              console.log(`[Bulk Webhook] Ignoring group message from chat_id: ${chatId}`);
              return res.json({ success: true, message: "Group messages ignored" });
            }
            let rawButtonId = "";
            if (incomingMessage.reply?.type === "buttons_reply") {
              rawButtonId = incomingMessage.reply.buttons_reply?.id || "";
            } else if (incomingMessage.reply?.type === "list_reply") {
              rawButtonId = incomingMessage.reply.list_reply?.id || "";
            }
            const buttonId = rawButtonId.includes(":") ? rawButtonId.split(":").pop() || "" : rawButtonId;
            console.log(`[Bulk Webhook] Processing button click: rawId="${rawButtonId}", extracted="${buttonId}"`);
            let definition = {};
            try {
              const defJson = workflowRecord.definitionJson;
              definition = typeof defJson === "string" ? JSON.parse(defJson) : defJson || {};
            } catch (e) {
              console.error("[Bulk Webhook] Failed to parse workflow definition:", e);
              return res.status(500).json({ error: "Invalid workflow definition" });
            }
            const userChannels = await db.select().from(channels).where(
              and2(
                eq2(channels.userId, workflowRecord.userId),
                eq2(channels.status, "ACTIVE")
              )
            ).limit(1);
            const channel = userChannels[0];
            if (!channel) {
              console.error("[Bulk Webhook] No active channel found for user");
              return res.status(400).json({ error: "No active channel" });
            }
            let targetEdge = null;
            targetEdge = definition.edges?.find((e) => e.sourceHandle === buttonId);
            if (!targetEdge) {
              console.log(`[Bulk Webhook] No exact sourceHandle match, trying fallbacks...`);
              const interactiveNodes = definition.nodes?.filter((n) => {
                const nodeType2 = n.data?.type || n.data?.nodeType;
                return ["carousel", "quickReply", "quickReplyImage", "quickReplyVideo", "listMessage", "buttons"].includes(nodeType2);
              }) || [];
              for (const node of interactiveNodes) {
                const nodeType2 = node.data?.type || node.data?.nodeType;
                const config2 = node.data?.config || {};
                let hasMatchingButton = false;
                if (nodeType2 === "carousel") {
                  const cards = config2.cards || [];
                  for (const card of cards) {
                    if ((card.buttons || []).some((btn) => btn.id === buttonId)) {
                      hasMatchingButton = true;
                      break;
                    }
                  }
                }
                if (["quickReply", "quickReplyImage", "quickReplyVideo", "buttons"].includes(nodeType2)) {
                  if ((config2.buttons || []).some((btn) => btn.id === buttonId)) {
                    hasMatchingButton = true;
                  }
                }
                if (nodeType2 === "listMessage") {
                  const sections = config2.sections || [];
                  for (const section of sections) {
                    if ((section.rows || []).some((row) => row.id === buttonId)) {
                      hasMatchingButton = true;
                      break;
                    }
                  }
                }
                if (hasMatchingButton) {
                  const nodeEdges = definition.edges?.filter((e) => e.source === node.id) || [];
                  targetEdge = nodeEdges.find((e) => e.sourceHandle === buttonId) || nodeEdges[0];
                  if (targetEdge) {
                    console.log(`[Bulk Webhook] Found edge from ${nodeType2} node: ${JSON.stringify(targetEdge)}`);
                    break;
                  }
                }
              }
            }
            if (!targetEdge) {
              console.log(`[Bulk Webhook] No target edge found for button "${buttonId}"`);
              return res.json({ success: true, message: "No target edge found" });
            }
            const targetNode = definition.nodes?.find((n) => n.id === targetEdge.target);
            if (!targetNode) {
              console.log(`[Bulk Webhook] Target node not found: ${targetEdge.target}`);
              return res.json({ success: true, message: "Target node not found" });
            }
            const nodeType = targetNode.data?.type || targetNode.data?.nodeType;
            const config = targetNode.data?.config || {};
            console.log(`[Bulk Webhook] Sending ${nodeType} message to ${phone}`);
            const result = await buildAndSendNodeMessage(channel, phone, nodeType, config);
            if (result.success) {
              console.log(`[Bulk Webhook] Successfully sent ${nodeType} to ${phone}`);
              if (result.messageId) {
                try {
                  await db.insert(sentMessages).values({
                    workflowId: workflowRecord.id,
                    messageId: result.messageId,
                    phone,
                    messageType: nodeType
                  });
                } catch (e) {
                  console.warn("[Bulk Webhook] Failed to track sent message:", e);
                }
              }
              await db.insert(workflowExecutions).values({
                workflowId: workflowRecord.id,
                phone,
                messageType: "button_reply",
                triggerData: webhookPayload,
                responsesSent: [{ nodeId: targetNode.id, nodeType, success: true }],
                status: "SUCCESS"
              });
            } else {
              console.error(`[Bulk Webhook] Failed to send ${nodeType}:`, result.error);
            }
            return res.json({ success: true, message: "Button reply processed via workflow" });
          }
        }
        console.error("[Bulk Webhook] Invalid webhook token");
        return res.status(401).json({ error: "Invalid webhook token" });
      }
      const statusEvent = webhookPayload.statuses?.[0];
      const messageEvent = webhookPayload.messages?.[0];
      const incomingEvent = statusEvent || messageEvent;
      if (!incomingEvent) {
        return res.json({ success: true, message: "No event to process" });
      }
      const providerMessageId = incomingEvent.id || incomingEvent.message_id;
      if (!providerMessageId) {
        console.log("[Bulk Webhook] No message_id found in payload");
        return res.json({ success: true, message: "No message_id in payload" });
      }
      const eventType = statusEvent ? "status" : "message";
      console.log(`[Bulk Webhook] Processing ${eventType} event for message_id: ${providerMessageId}`);
      let lookupMessageId = providerMessageId;
      if (messageEvent && messageEvent.context?.quoted_id) {
        lookupMessageId = messageEvent.context.quoted_id;
        console.log(`[Bulk Webhook] Using quoted_id for reply lookup: ${lookupMessageId} (reply message was: ${providerMessageId})`);
      }
      const existingMessages = await db.select().from(messages).where(eq2(messages.providerMessageId, lookupMessageId)).limit(1);
      if (!existingMessages || existingMessages.length === 0) {
        console.log(`[Bulk Webhook] Message not found for provider_message_id: ${lookupMessageId}`);
        if (messageEvent && !messageEvent.context?.quoted_id) {
          console.log(`[Bulk Webhook] Warning: Reply message received without context.quoted_id`);
        }
        return res.json({ success: true, message: "Message not found (might be from workflow)" });
      }
      const message = existingMessages[0];
      const jobId = message.jobId;
      const [job] = await db.select().from(jobs).where(eq2(jobs.id, jobId)).limit(1);
      const numericUserId = job?.userId || parseInt(userId);
      try {
        await storage.createBulkLog({
          userId: numericUserId,
          jobId,
          level: "info",
          category: "webhook",
          message: `Webhook received: ${eventType} event for message ${lookupMessageId}`,
          meta: { providerMessageId, lookupMessageId, eventType }
        });
      } catch (logError) {
        console.warn("[Bulk Webhook] Failed to create webhook log:", logError);
      }
      let updateData = { updatedAt: /* @__PURE__ */ new Date() };
      let newStatus = null;
      if (statusEvent) {
        const status = statusEvent.status?.toLowerCase();
        const timestamp2 = statusEvent.timestamp ? parseInt(statusEvent.timestamp) * 1e3 : Date.now();
        if (status === "delivered") {
          updateData.status = "DELIVERED";
          updateData.deliveredAt = new Date(timestamp2);
          newStatus = "DELIVERED";
          console.log(`[Bulk Webhook] Message ${providerMessageId} delivered`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: "info",
              category: "status",
              message: `Message delivered: ${lookupMessageId}`,
              meta: { providerMessageId, status: "DELIVERED" }
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log delivery:", logError);
          }
        } else if (status === "read") {
          updateData.status = "READ";
          updateData.readAt = new Date(timestamp2);
          newStatus = "READ";
          console.log(`[Bulk Webhook] Message ${providerMessageId} read`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: "info",
              category: "status",
              message: `Message read: ${lookupMessageId}`,
              meta: { providerMessageId, status: "READ" }
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log read status:", logError);
          }
        } else if (status === "failed" || status === "error") {
          updateData.status = "FAILED";
          updateData.error = statusEvent.error || "Delivery failed";
          newStatus = "FAILED";
          console.log(`[Bulk Webhook] Message ${providerMessageId} failed`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: "error",
              category: "status",
              message: `Message failed: ${lookupMessageId}`,
              meta: { providerMessageId, status: "FAILED", error: updateData.error }
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log failure:", logError);
          }
        }
      } else if (messageEvent && (messageEvent.type === "reply" || messageEvent.text || messageEvent.reply)) {
        updateData.status = "REPLIED";
        updateData.repliedAt = new Date(messageEvent.timestamp * 1e3 || Date.now());
        newStatus = "REPLIED";
        if (messageEvent.reply?.type === "buttons_reply") {
          const buttonReply = messageEvent.reply.buttons_reply;
          updateData.lastReplyType = "buttons_reply";
          updateData.lastReply = buttonReply?.title || buttonReply?.id || "Button clicked";
          updateData.lastReplyPayload = messageEvent;
          console.log(`[Bulk Webhook] Button reply: ${updateData.lastReply}`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: "info",
              category: "reply",
              message: `Button reply received: "${updateData.lastReply}" for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: "buttons_reply", replyTitle: updateData.lastReply }
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log button reply:", logError);
          }
        } else if (messageEvent.reply?.type === "list_reply") {
          const listReply = messageEvent.reply.list_reply;
          updateData.lastReplyType = "list_reply";
          updateData.lastReply = listReply?.title || listReply?.id || "List item selected";
          updateData.lastReplyPayload = messageEvent;
          console.log(`[Bulk Webhook] List reply: ${updateData.lastReply}`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: "info",
              category: "reply",
              message: `List reply received: "${updateData.lastReply}" for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: "list_reply", replyTitle: updateData.lastReply }
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log list reply:", logError);
          }
        } else if (messageEvent.text?.body) {
          updateData.lastReplyType = "text";
          updateData.lastReply = messageEvent.text.body;
          updateData.lastReplyPayload = messageEvent;
          console.log(`[Bulk Webhook] Text reply: ${updateData.lastReply}`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: "info",
              category: "reply",
              message: `Text reply received for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: "text", replyText: updateData.lastReply.substring(0, 100) }
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log text reply:", logError);
          }
        } else {
          updateData.lastReplyType = "other";
          updateData.lastReply = "Reply received";
          updateData.lastReplyPayload = messageEvent;
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: "info",
              category: "reply",
              message: `Other reply received for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: "other" }
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log other reply:", logError);
          }
        }
        if ((messageEvent.reply?.type === "buttons_reply" || messageEvent.reply?.type === "list_reply") && messageEvent.chat_id) {
          try {
            let buttonTitle = "";
            if (messageEvent.reply?.type === "buttons_reply") {
              buttonTitle = messageEvent.reply.buttons_reply?.title || "";
            } else if (messageEvent.reply?.type === "list_reply") {
              buttonTitle = messageEvent.reply.list_reply?.title || "";
            }
            const chatId = messageEvent.chat_id || "";
            const phone = chatId.split("@")[0];
            if (buttonTitle && buttonTitle.trim().length > 0 && phone) {
              const buttonTitleNormalized = buttonTitle.trim();
              const keywordsSetting = await storage.getSetting("subscriber_keywords");
              const keywords = keywordsSetting?.value ? JSON.parse(keywordsSetting.value) : { subscribe: ["Subscribe"], unsubscribe: ["Unsubscribe"] };
              const matchesSubscribe = keywords.subscribe.some(
                (kw) => kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
              );
              const matchesUnsubscribe = keywords.unsubscribe.some(
                (kw) => kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
              );
              if (matchesSubscribe || matchesUnsubscribe) {
                const status = matchesSubscribe ? "subscribed" : "unsubscribed";
                await storage.upsertSubscriber({
                  userId: numericUserId,
                  phone,
                  name: "",
                  // Default empty name, can be edited later
                  status
                });
                console.log(`[Subscriber] ${phone} ${status} via button: "${buttonTitle}"`);
              }
            }
          } catch (subscriberError) {
            console.error(`[Subscriber] Error processing subscriber: ${subscriberError.message}`);
          }
        }
      }
      if (Object.keys(updateData).length > 1) {
        await db.update(messages).set(updateData).where(eq2(messages.id, message.id));
        console.log(`[Bulk Webhook] Updated message ${message.id} with status: ${newStatus || "REPLIED"}`);
        const allMessages = await db.select().from(messages).where(eq2(messages.jobId, jobId));
        const jobStats = {
          queued: allMessages.filter((m) => m.status === "QUEUED").length,
          pending: allMessages.filter((m) => m.status === "PENDING").length,
          sent: allMessages.filter((m) => m.status === "SENT").length,
          delivered: allMessages.filter((m) => m.status === "DELIVERED").length,
          read: allMessages.filter((m) => m.status === "READ").length,
          failed: allMessages.filter((m) => m.status === "FAILED").length,
          replied: allMessages.filter((m) => m.status === "REPLIED").length,
          updatedAt: /* @__PURE__ */ new Date()
        };
        await db.update(jobs).set(jobStats).where(eq2(jobs.id, jobId));
        console.log(`[Bulk Webhook] Updated job ${jobId} stats:`, jobStats);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Bulk Webhook] Error:", error);
      try {
        const userIdNum = parseInt(req.params.userId);
        if (!isNaN(userIdNum)) {
          await storage.createBulkLog({
            userId: userIdNum,
            jobId: null,
            level: "error",
            category: "error",
            message: `Webhook processing error: ${error.message}`,
            meta: { error: error.message, stack: error.stack?.substring(0, 500) }
          });
        }
      } catch (logError) {
        console.warn("[Bulk Webhook] Failed to log error:", logError);
      }
      res.status(500).json({ error: "Webhook processing failed", message: error.message });
    }
  });
  app2.get("/api/bulk-logs", requireAuth, async (req, res) => {
    try {
      const userId = req.userId;
      const level = req.query.level;
      const category = req.query.category;
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const logs = await storage.getBulkLogs({
        userId,
        level,
        category,
        limit
      });
      res.json(logs);
    } catch (error) {
      console.error("Get bulk logs error:", error);
      res.status(500).json({ error: "Failed to fetch bulk logs" });
    }
  });
  async function trackSentMessage(workflowId, messageId, phone, messageType) {
    if (!workflowId || !messageId) return;
    try {
      await db.insert(sentMessages).values({
        workflowId,
        messageId,
        phone,
        messageType
      });
      console.log(`[Message Tracking] Recorded ${messageType} message ${messageId} for workflow ${workflowId}`);
    } catch (trackError) {
      console.error(`[Message Tracking] Failed to track message: ${trackError}`);
    }
  }
  async function sendNodeMessage(phone, node, workflowUserId, workflowId) {
    const nodeType = node.data?.type || node.data?.nodeType;
    const config = node.data?.config || {};
    const userChannels = await storage.getChannelsForUser(workflowUserId);
    const activeChannel = userChannels.find(
      (ch) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED" && ch.whapiChannelToken
    );
    if (!activeChannel || !activeChannel.whapiChannelToken) {
      throw new Error("No active authorized channel found for user");
    }
    const channelToken = activeChannel.whapiChannelToken;
    const { sendInteractiveMessage: sendInteractiveMessage2, sendCarouselMessage: sendCarouselMessage2, sendTextMessage: sendTextMessage2, sendMediaMessage: sendMediaMessage2, sendLocationMessage: sendLocationMessage2 } = await Promise.resolve().then(() => (init_whapi(), whapi_exports));
    if (nodeType === "message.text") {
      return await sendTextMessage2(channelToken, {
        to: phone,
        body: config.text || "No message"
      });
    } else if (nodeType === "message.media") {
      return await sendMediaMessage2(channelToken, {
        to: phone,
        media: config.mediaUrl || "",
        caption: config.caption,
        mediaType: config.mediaType || "Document"
      });
    } else if (nodeType === "message.location") {
      return await sendLocationMessage2(channelToken, {
        to: phone,
        latitude: parseFloat(config.latitude) || 0,
        longitude: parseFloat(config.longitude) || 0,
        name: config.name,
        address: config.address
      });
    } else if (nodeType === "quickReply") {
      const payload = {
        to: phone,
        type: "button"
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => ({
        type: "quick_reply",
        title: btn.title,
        id: btn.id
      }));
      payload.action = { buttons };
      const response = await sendInteractiveMessage2(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, "quickReply");
      return response;
    } else if (nodeType === "quickReplyImage") {
      const payload = {
        to: phone,
        type: "button",
        media: config.mediaUrl
      };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => ({
        type: "quick_reply",
        title: btn.title,
        id: btn.id
      }));
      payload.action = { buttons };
      const response = await sendInteractiveMessage2(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, "quickReplyImage");
      return response;
    } else if (nodeType === "quickReplyVideo") {
      const payload = {
        to: phone,
        type: "button",
        media: config.mediaUrl,
        no_encode: true
      };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => ({
        type: "quick_reply",
        title: btn.title,
        id: btn.id
      }));
      payload.action = { buttons };
      const response = await sendInteractiveMessage2(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, "quickReplyVideo");
      return response;
    } else if (nodeType === "listMessage") {
      const sections = (config.sections || []).map((section) => ({
        title: section.title || "Options",
        rows: (section.rows || []).filter((row) => row.title && row.id).map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description || ""
        }))
      }));
      const payload = {
        to: phone,
        type: "list"
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      payload.action = {
        list: {
          sections,
          label: config.buttonLabel || "Choose option"
        }
      };
      const response = await sendInteractiveMessage2(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, "listMessage");
      return response;
    } else if (nodeType === "buttons") {
      const payload = {
        to: phone,
        type: "button"
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      const buttons = (config.buttons || []).filter((btn) => btn.title && btn.id).map((btn) => {
        let buttonType = btn.type || btn.kind;
        if (buttonType === "phone_number") buttonType = "call";
        const button = {
          type: buttonType,
          // 'call', 'url', or 'copy'
          title: btn.title,
          id: btn.id
        };
        if (buttonType === "call") {
          button.phone_number = btn.phone_number || btn.value;
        } else if (buttonType === "url") {
          button.url = btn.url || btn.value;
        } else if (buttonType === "copy") {
          button.copy_code = btn.copy_code || btn.value;
        }
        return button;
      });
      payload.action = { buttons };
      return await sendInteractiveMessage2(channelToken, payload);
    } else if (nodeType === "callButton") {
      const payload = {
        to: phone,
        type: "button"
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      payload.action = {
        buttons: [{
          type: "call",
          title: config.buttonTitle || "Call us",
          id: config.buttonId || "call_btn",
          phone_number: config.phoneNumber
        }]
      };
      return await sendInteractiveMessage2(channelToken, payload);
    } else if (nodeType === "urlButton") {
      const payload = {
        to: phone,
        type: "button"
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      payload.action = {
        buttons: [{
          type: "url",
          title: config.buttonTitle || "Visit Website",
          id: config.buttonId || "url_btn",
          url: config.url
        }]
      };
      return await sendInteractiveMessage2(channelToken, payload);
    } else if (nodeType === "copyButton") {
      const payload = {
        to: phone,
        type: "button"
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || "No message" };
      if (config.footerText) payload.footer = { text: config.footerText };
      payload.action = {
        buttons: [{
          type: "copy",
          title: config.buttonTitle || "Copy OTP",
          id: config.buttonId || "copy_btn",
          copy_code: config.copyCode
        }]
      };
      return await sendInteractiveMessage2(channelToken, payload);
    } else if (nodeType === "carousel") {
      console.log(`[CAROUSEL DEBUG] Sending carousel to ${phone} for workflow ${workflowId}`);
      const response = await sendCarouselMessage2(channelToken, {
        to: phone,
        body: { text: config.bodyText || "Check out our offerings!" },
        cards: (config.cards || []).map((card) => ({
          id: card.id,
          media: { media: card.media },
          text: card.text,
          buttons: (card.buttons || []).map((btn) => {
            if (btn.type === "url") {
              return {
                type: "url",
                title: btn.title,
                id: btn.id,
                url: btn.url
              };
            }
            return {
              type: "quick_reply",
              title: btn.title,
              id: btn.id
            };
          })
        }))
      });
      console.log(`[CAROUSEL DEBUG] WHAPI response:`, JSON.stringify(response, null, 2));
      console.log(`[CAROUSEL DEBUG] response.id = ${response?.id}`);
      console.log(`[CAROUSEL DEBUG] response.message_id = ${response?.message_id}`);
      console.log(`[CAROUSEL DEBUG] response.sent?.id = ${response?.sent?.id}`);
      const messageId = response?.id || response?.message_id || response?.sent?.id || response?.sent?.message_id;
      console.log(`[CAROUSEL DEBUG] Final messageId to track: ${messageId}`);
      if (messageId) {
        await trackSentMessage(workflowId, messageId, phone, "carousel");
        console.log(`[CAROUSEL DEBUG] Tracked carousel message ${messageId} for workflow ${workflowId}`);
      } else {
        console.error(`[CAROUSEL DEBUG] WARNING: No message ID found in WHAPI response - button clicks won't be routed!`);
      }
      return response;
    }
    console.log(`Unsupported node type: ${nodeType}`);
    return { success: false, message: "Unsupported node type" };
  }
  app2.post("/api/workflows/test-http-request", requireAuth, async (req, res) => {
    try {
      const { config, testContext } = req.body;
      if (!config || !config.url) {
        return res.status(400).json({ error: "HTTP request configuration with URL is required" });
      }
      const executionContext = testContext || {};
      const { performHttpRequest: performHttpRequest2 } = await Promise.resolve().then(() => (init_httpExecutor(), httpExecutor_exports));
      const result = await performHttpRequest2(config, executionContext);
      res.json({
        success: result.success,
        status: result.status,
        statusText: result.statusText,
        data: result.data,
        mappedVariables: result.mappedVariables,
        error: result.error
      });
    } catch (error) {
      console.error("Test HTTP request error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to test HTTP request"
      });
    }
  });
  app2.get("/api/admin/settings/bulk-speed", requireAuth, requireAdmin, async (req, res) => {
    try {
      const minDelay = await storage.getSetting("bulk_send_min_delay");
      const maxDelay = await storage.getSetting("bulk_send_max_delay");
      res.json({
        minDelay: minDelay?.value || "10",
        maxDelay: maxDelay?.value || "20"
      });
    } catch (error) {
      console.error("Get bulk speed settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.put("/api/admin/settings/bulk-speed", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { minDelay, maxDelay } = req.body;
      if (minDelay) await storage.setSetting("bulk_send_min_delay", minDelay.toString());
      if (maxDelay) await storage.setSetting("bulk_send_max_delay", maxDelay.toString());
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "settings",
          updates: Object.keys(req.body),
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app2.get("/api/admin/settings/http-allowlist", requireAuth, requireAdmin, async (req, res) => {
    try {
      const setting = await storage.getSetting("http_allowed_domains");
      const allowedDomains = setting?.value ? JSON.parse(setting.value) : [];
      res.json({ allowedDomains });
    } catch (error) {
      console.error("Get HTTP allowlist settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.put("/api/admin/settings/http-allowlist", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { allowedDomains } = req.body;
      if (!Array.isArray(allowedDomains)) {
        return res.status(400).json({ error: "allowedDomains must be an array" });
      }
      const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
      for (const domain of allowedDomains) {
        if (typeof domain !== "string" || !domainPattern.test(domain.toLowerCase().trim())) {
          return res.status(400).json({ error: `Invalid domain: ${domain}` });
        }
      }
      await storage.setSetting("http_allowed_domains", JSON.stringify(allowedDomains));
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "http_allowlist",
          domainCount: allowedDomains.length,
          adminId: req.userId
        }
      });
      res.json({ success: true, allowedDomains });
    } catch (error) {
      console.error("Update HTTP allowlist settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app2.get("/api/settings/auth", async (req, res) => {
    try {
      const enableSignin = await storage.getSetting("enable_signin");
      const enableSignup = await storage.getSetting("enable_signup");
      const signupButtonText = await storage.getSetting("signup_button_text");
      res.json({
        enableSignin: enableSignin?.value !== "false",
        // Default true
        enableSignup: enableSignup?.value !== "false",
        // Default true
        signupButtonText: signupButtonText?.value || "Start Free Trial"
        // Default text
      });
    } catch (error) {
      console.error("Get auth settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.put("/api/admin/settings/auth", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { enableSignin, enableSignup, signupButtonText } = req.body;
      if (typeof enableSignin === "boolean") {
        await storage.setSetting("enable_signin", enableSignin.toString());
      }
      if (typeof enableSignup === "boolean") {
        await storage.setSetting("enable_signup", enableSignup.toString());
      }
      if (typeof signupButtonText === "string") {
        await storage.setSetting("signup_button_text", signupButtonText.trim() || "Start Free Trial");
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "auth_settings",
          updates: { enableSignin, enableSignup, signupButtonText },
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Update auth settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app2.get("/api/admin/settings/default-page-access", requireAuth, requireAdmin, async (req, res) => {
    try {
      const pageAccessSetting = await storage.getSetting("default_page_access");
      const defaultPageAccess = {
        dashboard: true,
        channels: false,
        send: false,
        templates: false,
        workflows: false,
        outbox: false,
        logs: false,
        bulkLogs: false,
        pricing: true,
        settings: false,
        balances: false,
        whapiSettings: false
      };
      const pageAccess = pageAccessSetting?.value ? JSON.parse(pageAccessSetting.value) : defaultPageAccess;
      res.json({ pageAccess });
    } catch (error) {
      console.error("Get default page access error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.put("/api/admin/settings/default-page-access", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pageAccess } = req.body;
      if (pageAccess && typeof pageAccess === "object") {
        await storage.setSetting("default_page_access", JSON.stringify(pageAccess));
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "default_page_access",
          updates: pageAccess,
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Update default page access error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app2.get("/api/admin/settings/default-theme", requireAuth, requireAdmin, async (req, res) => {
    try {
      const themeSetting = await storage.getSetting("default_theme");
      const defaultTheme = themeSetting?.value || "dark";
      res.json({ defaultTheme });
    } catch (error) {
      console.error("Get default theme error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.put("/api/admin/settings/default-theme", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { defaultTheme } = req.body;
      if (defaultTheme && (defaultTheme === "light" || defaultTheme === "dark")) {
        await storage.setSetting("default_theme", defaultTheme);
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "default_theme",
          defaultTheme,
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Update default theme error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app2.get("/api/settings/default-theme", async (req, res) => {
    try {
      const themeSetting = await storage.getSetting("default_theme");
      const defaultTheme = themeSetting?.value || "dark";
      res.json({ defaultTheme });
    } catch (error) {
      console.error("Get default theme error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.get("/api/admin/settings/chat-widget-location", requireAuth, requireAdmin, async (req, res) => {
    try {
      const widgetLocationSetting = await storage.getSetting("chat_widget_location");
      const chatWidgetLocation = widgetLocationSetting?.value || "all-pages";
      res.json({ chatWidgetLocation });
    } catch (error) {
      console.error("Get chat widget location error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.put("/api/admin/settings/chat-widget-location", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { chatWidgetLocation } = req.body;
      if (chatWidgetLocation && (chatWidgetLocation === "homepage-only" || chatWidgetLocation === "all-pages")) {
        await storage.setSetting("chat_widget_location", chatWidgetLocation);
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "chat_widget_location",
          chatWidgetLocation,
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Update chat widget location error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app2.get("/api/settings/chat-widget-location", async (req, res) => {
    try {
      const widgetLocationSetting = await storage.getSetting("chat_widget_location");
      const chatWidgetLocation = widgetLocationSetting?.value || "all-pages";
      res.json({ chatWidgetLocation });
    } catch (error) {
      console.error("Get chat widget location error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.get("/api/admin/settings/subscriber-keywords", requireAuth, requireAdmin, async (req, res) => {
    try {
      const keywordsSetting = await storage.getSetting("subscriber_keywords");
      const defaultKeywords = {
        subscribe: ["Subscribe"],
        unsubscribe: ["Unsubscribe"]
      };
      const keywords = keywordsSetting?.value ? JSON.parse(keywordsSetting.value) : defaultKeywords;
      res.json(keywords);
    } catch (error) {
      console.error("Get subscriber keywords error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });
  app2.put("/api/admin/settings/subscriber-keywords", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { subscribe, unsubscribe } = req.body;
      if (!Array.isArray(subscribe) || !Array.isArray(unsubscribe)) {
        return res.status(400).json({ error: "Subscribe and unsubscribe must be arrays" });
      }
      const subscribeKeywords = Array.from(new Set(
        subscribe.filter((k) => typeof k === "string" && k.trim().length > 0).map((k) => k.trim())
      ));
      const unsubscribeKeywords = Array.from(new Set(
        unsubscribe.filter((k) => typeof k === "string" && k.trim().length > 0).map((k) => k.trim())
      ));
      if (subscribeKeywords.length === 0 || unsubscribeKeywords.length === 0) {
        return res.status(400).json({
          error: "At least one subscribe and one unsubscribe keyword is required"
        });
      }
      const keywordsData = {
        subscribe: subscribeKeywords,
        unsubscribe: unsubscribeKeywords
      };
      await storage.setSetting("subscriber_keywords", JSON.stringify(keywordsData));
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "subscriber_keywords",
          keywords: keywordsData,
          adminId: req.userId
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Update subscriber keywords error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app2.post("/api/admin/use-cases/upload-image", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { file } = req.body;
      if (!file) {
        return res.status(400).json({ error: "File data is required" });
      }
      const base64Data = file.split(",")[1] || file;
      const buffer = Buffer.from(base64Data, "base64");
      const fileSizeMB = buffer.length / (1024 * 1024);
      if (fileSizeMB > 5) {
        return res.status(400).json({
          error: `File size (${fileSizeMB.toFixed(2)}MB) exceeds 5MB limit`
        });
      }
      const mimeMatch = file.match(/^data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const extensionMap = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp"
      };
      const extension = extensionMap[mimeType] || "jpg";
      const uniqueId = crypto.randomBytes(8).toString("hex");
      const timestamp2 = Date.now();
      const fileName = `${timestamp2}-${uniqueId}.${extension}`;
      const useCasesDir = path.join(process.cwd(), "uploads", "use-cases");
      if (!fs.existsSync(useCasesDir)) {
        fs.mkdirSync(useCasesDir, { recursive: true });
      }
      const filePath = path.join(useCasesDir, fileName);
      fs.writeFileSync(filePath, buffer);
      console.log(`[Use Case Upload] Saved ${fileName} (${fileSizeMB.toFixed(2)}MB)`);
      const relativeUrl = `/uploads/use-cases/${fileName}`;
      res.json({
        path: relativeUrl,
        fileName,
        fileSizeMB: fileSizeMB.toFixed(2)
      });
    } catch (error) {
      console.error("Use case image upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload image" });
    }
  });
  app2.get("/api/use-cases", async (req, res) => {
    try {
      const cases = await db.select().from(useCases).where(eq2(useCases.published, true)).orderBy(useCases.sortOrder, useCases.id);
      res.json(cases);
    } catch (error) {
      console.error("Get use cases error:", error);
      res.status(500).json({ error: "Failed to fetch use cases" });
    }
  });
  app2.get("/api/admin/use-cases", requireAuth, requireAdmin, async (req, res) => {
    try {
      const cases = await db.select().from(useCases).orderBy(useCases.sortOrder, useCases.id);
      res.json(cases);
    } catch (error) {
      console.error("Get all use cases error:", error);
      res.status(500).json({ error: "Failed to fetch use cases" });
    }
  });
  app2.post("/api/admin/use-cases", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [useCase] = await db.insert(useCases).values(req.body).returning();
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CREATE",
        meta: { entity: "use_case", useCaseId: useCase.id, adminId: req.userId }
      });
      res.json(useCase);
    } catch (error) {
      console.error("Create use case error:", error);
      res.status(500).json({ error: "Failed to create use case" });
    }
  });
  app2.put("/api/admin/use-cases/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(useCases).set({ ...req.body, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(useCases.id, id)).returning();
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE",
        meta: { entity: "use_case", useCaseId: id, adminId: req.userId }
      });
      res.json(updated);
    } catch (error) {
      console.error("Update use case error:", error);
      res.status(500).json({ error: "Failed to update use case" });
    }
  });
  app2.delete("/api/admin/use-cases/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(useCases).where(eq2(useCases.id, id));
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE",
        meta: { entity: "use_case", useCaseId: id, adminId: req.userId }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete use case error:", error);
      res.status(500).json({ error: "Failed to delete use case" });
    }
  });
  app2.get("/api/homepage-features", async (req, res) => {
    try {
      const features = await db.select().from(homepageFeatures).where(eq2(homepageFeatures.published, true)).orderBy(homepageFeatures.sortOrder, homepageFeatures.id);
      res.json(features);
    } catch (error) {
      console.error("Get homepage features error:", error);
      res.status(500).json({ error: "Failed to fetch homepage features" });
    }
  });
  app2.get("/api/admin/homepage-features", requireAuth, requireAdmin, async (req, res) => {
    try {
      const features = await db.select().from(homepageFeatures).orderBy(homepageFeatures.sortOrder, homepageFeatures.id);
      res.json(features);
    } catch (error) {
      console.error("Get all homepage features error:", error);
      res.status(500).json({ error: "Failed to fetch homepage features" });
    }
  });
  app2.post("/api/admin/homepage-features", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [feature] = await db.insert(homepageFeatures).values(req.body).returning();
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CREATE",
        meta: { entity: "homepage_feature", featureId: feature.id, adminId: req.userId }
      });
      res.json(feature);
    } catch (error) {
      console.error("Create homepage feature error:", error);
      res.status(500).json({ error: "Failed to create homepage feature" });
    }
  });
  app2.put("/api/admin/homepage-features/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(homepageFeatures).set({ ...req.body, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(homepageFeatures.id, id)).returning();
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE",
        meta: { entity: "homepage_feature", featureId: id, adminId: req.userId }
      });
      res.json(updated);
    } catch (error) {
      console.error("Update homepage feature error:", error);
      res.status(500).json({ error: "Failed to update homepage feature" });
    }
  });
  app2.delete("/api/admin/homepage-features/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(homepageFeatures).where(eq2(homepageFeatures.id, id));
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE",
        meta: { entity: "homepage_feature", featureId: id, adminId: req.userId }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete homepage feature error:", error);
      res.status(500).json({ error: "Failed to delete homepage feature" });
    }
  });
  app2.get("/api/terms", async (req, res) => {
    try {
      const terms = await storage.getActiveTermsDocuments();
      res.json(terms);
    } catch (error) {
      console.error("Get terms error:", error);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  });
  app2.get("/api/terms/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const terms = await storage.getTermsDocumentByType(type);
      if (!terms) {
        return res.status(404).json({ error: "Terms document not found" });
      }
      res.json(terms);
    } catch (error) {
      console.error("Get terms by type error:", error);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  });
  app2.get("/api/admin/terms", requireAuth, requireAdmin, async (req, res) => {
    try {
      const terms = await db.select().from(termsDocuments).orderBy(desc2(termsDocuments.createdAt));
      res.json(terms);
    } catch (error) {
      console.error("Get all terms error:", error);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  });
  app2.post("/api/admin/terms", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validation = insertTermsDocumentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }
      const document = await storage.createTermsDocument(validation.data);
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CREATE_TERMS",
        meta: {
          entity: "terms_documents",
          documentId: document.id,
          type: document.type,
          version: document.version
        }
      });
      res.json(document);
    } catch (error) {
      console.error("Create terms error:", error);
      res.status(500).json({ error: "Failed to create terms document" });
    }
  });
  app2.put("/api/admin/terms/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateSchema = z2.object({
        title: z2.string().min(1).optional(),
        content: z2.string().min(1).optional(),
        version: z2.string().min(1).optional()
      });
      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }
      const document = await storage.updateTermsDocument(id, validation.data);
      if (!document) {
        return res.status(404).json({ error: "Terms document not found" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "UPDATE_TERMS",
        meta: {
          entity: "terms_documents",
          documentId: id,
          updates: Object.keys(validation.data)
        }
      });
      res.json(document);
    } catch (error) {
      console.error("Update terms error:", error);
      res.status(500).json({ error: "Failed to update terms document" });
    }
  });
  app2.post("/api/admin/terms/:id/activate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.setActiveTermsDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Terms document not found" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "ACTIVATE_TERMS",
        meta: {
          entity: "terms_documents",
          documentId: id,
          type: document.type,
          version: document.version
        }
      });
      res.json(document);
    } catch (error) {
      console.error("Activate terms error:", error);
      res.status(500).json({ error: "Failed to activate terms document" });
    }
  });
  app2.post("/api/admin/users/:id/cancel-subscription", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }
      await storage.updateSubscription(subscription.id, { status: "CANCELLED" });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CANCEL_USER_SUBSCRIPTION",
        meta: {
          entity: "subscription",
          entityId: subscription.id,
          userId,
          planId: subscription.planId
        }
      });
      res.json({ message: "Subscription cancelled successfully" });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });
  app2.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (userId === req.userId) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "DELETE_USER",
        meta: {
          entity: "user",
          userId,
          email: user.email,
          name: user.name
        }
      });
      await storage.deleteUser(userId);
      res.json({ message: "User account deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Failed to delete user account" });
    }
  });
  app2.post("/api/me/cancel-subscription", requireAuth, async (req, res) => {
    try {
      const subscription = await storage.getActiveSubscriptionForUser(req.userId);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }
      await storage.updateSubscription(subscription.id, { status: "CANCELLED" });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "CANCEL_OWN_SUBSCRIPTION",
        meta: {
          entity: "subscription",
          entityId: subscription.id,
          planId: subscription.planId
        }
      });
      res.json({ message: "Subscription cancelled successfully" });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });
  app2.post("/api/me/reset-password", requireAuth, async (req, res) => {
    try {
      const validation = z2.object({
        newPassword: z2.string().min(6, "Password must be at least 6 characters")
      }).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }
      const { newPassword } = validation.data;
      const passwordHash = await hashPassword(newPassword);
      await storage.updateUser(req.userId, { passwordHash });
      await storage.createAuditLog({
        actorUserId: req.userId,
        action: "RESET_PASSWORD",
        meta: {
          entity: "user",
          userId: req.userId
        }
      });
      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
}

// server/vite.ts
import express from "express";
import fs2 from "fs";
import path3 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      (await import("@replit/vite-plugin-cartographer")).default?.(),
      runtimeErrorOverlay(),
      (await import("@replit/vite-plugin-dev-banner")).default?.()
    ] : []
  ],
  resolve: {
    alias: [
      // IMPORTANT: use regex so we match "@/..." only, not "@radix-ui/..."
      { find: /^@\//, replacement: path2.resolve(import.meta.dirname, "client", "src") + "/" },
      { find: /^@shared\//, replacement: path2.resolve(import.meta.dirname, "shared") + "/" },
      { find: /^@assets\//, replacement: path2.resolve(import.meta.dirname, "attached_assets") + "/" }
    ]
  },
  // Build the React client from /client
  root: path2.resolve(import.meta.dirname, "client"),
  build: {
    // Output to /app/client-dist
    outDir: path2.resolve(import.meta.dirname, "client-dist"),
    emptyOutDir: true,
    sourcemap: false
  },
  // Works behind Coolify’s domain
  base: "/",
  // Dev server hardening
  server: {
    fs: { strict: true, deny: ["**/.**"] }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}

// server/utils.ts
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// server/seed.ts
init_storage();
async function seedDatabase() {
  console.log("Seeding database...");
  const existingAdmin = await storage.getUserByEmail("admin@omniplus.com");
  if (!existingAdmin) {
    const adminPassword = await hashPassword("admin123");
    await storage.createUser({
      name: "Admin User",
      email: "admin@omniplus.com",
      passwordHash: adminPassword,
      role: "admin",
      daysBalance: 999,
      status: "active"
    });
    console.log("\u2713 Admin user created (admin@omniplus.com / admin123)");
  }
  const existingUser = await storage.getUserByEmail("user@omniplus.com");
  if (!existingUser) {
    const userPassword = await hashPassword("password123");
    await storage.createUser({
      name: "Test User",
      email: "user@omniplus.com",
      passwordHash: userPassword,
      role: "user",
      daysBalance: 0,
      status: "active"
    });
    console.log("\u2713 Test user created (user@omniplus.com / password123)");
  }
  const existingPlans = await storage.getPlans();
  if (existingPlans.length === 0) {
    await storage.createPlan({
      name: "Starter",
      price: 2900,
      // $29 in cents
      currency: "USD",
      durationDays: 30,
      channelsLimit: 1,
      dailyMessagesLimit: 100,
      bulkMessagesLimit: 500,
      features: ["Basic templates", "Email support"]
    });
    await storage.createPlan({
      name: "Growth",
      price: 7900,
      // $79 in cents
      currency: "USD",
      durationDays: 30,
      channelsLimit: 3,
      dailyMessagesLimit: 500,
      bulkMessagesLimit: 5e3,
      features: ["Advanced templates", "Chatbot builder", "Priority support"]
    });
    await storage.createPlan({
      name: "Advanced",
      price: 19900,
      // $199 in cents
      currency: "USD",
      durationDays: 30,
      channelsLimit: 10,
      dailyMessagesLimit: 2e3,
      bulkMessagesLimit: 5e4,
      features: ["Custom workflows", "API access", "Dedicated support"]
    });
    await storage.createPlan({
      name: "Enterprise",
      price: 49900,
      // $499 in cents (custom pricing in reality)
      currency: "USD",
      durationDays: 30,
      channelsLimit: 999,
      dailyMessagesLimit: 999999,
      bulkMessagesLimit: 999999,
      features: [
        "Custom integrations",
        "SLA guarantee",
        "Account manager",
        "White-label option"
      ]
    });
    console.log("\u2713 Sample plans created");
  }
  const mainBalanceSetting = await storage.getSetting("main_days_balance");
  if (!mainBalanceSetting) {
    await storage.setSetting("main_days_balance", "1000");
    console.log("\u2713 Main admin balance initialized (1000 days)");
  }
  const existingTerms = await storage.getActiveTermsDocuments();
  if (existingTerms.length === 0) {
    await storage.createTermsDocument({
      type: "BUTTON_FUNCTIONALITY",
      version: "1.0",
      title: "OMNI PLUS \u2013 Terms of Use for Button Functionality on WhatsApp API",
      content: `OMNI PLUS \u2013 Terms of Use for Button Functionality on WhatsApp API

Last Updated: November 2025

By activating the button functionality in WhatsApp through OMNI PLUS, you agree to the terms outlined in this document.

1. Functionality Description

The endpoint for sending interactive button messages via OMNI PLUS API is used to send messages with buttons that allow users to engage, reply, or open URLs within WhatsApp.

2. Disclaimer

OMNI PLUS is not responsible for any changes, suspension, or removal of button features by Meta Platforms Inc. Meta may modify or discontinue such functionality at any time without prior notice.

3. Risk Notice

Users acknowledge that Meta may, at its discretion, modify, limit, or terminate button features without notice. OMNI PLUS assumes no liability for resulting data interruptions or business losses.

4. Limitation of Liability

OMNI PLUS shall not be liable for direct, indirect, incidental, or consequential damages arising from the use or inability to use button functionalities, including but not limited to business disruptions or data loss.

5. User Responsibility

Users are solely responsible for the content and compliance of messages sent using button features. OMNI PLUS does not monitor, control, or assume liability for user-generated content.

6. Amendments

OMNI PLUS reserves the right to update these terms at any time. Continued use of button functionality constitutes acceptance of revised terms.

For questions, contact: support@omniplus.ai`,
      isActive: true
    });
    await storage.createTermsDocument({
      type: "PAYPAL_PAYMENT",
      version: "1.0",
      title: "Payment Terms & Conditions",
      content: `Payment Terms & Conditions

By subscribing to OMNI PLUS services via PayPal, you agree to the following terms:

1. Payment Processing
All payments are processed securely through PayPal. OMNI PLUS does not store your payment information.

2. Subscription Billing
Subscriptions are billed on a recurring basis according to your selected plan duration (monthly, quarterly, semi-annual, or annual).

3. Refund Policy
Refunds are handled on a case-by-case basis. Please contact support@omniplus.ai for refund requests.

4. Service Availability
OMNI PLUS reserves the right to modify service features and pricing with advance notice to subscribers.

5. Cancellation
You may cancel your subscription at any time through your account settings. Access continues until the end of your billing period.`,
      isActive: true
    });
    console.log("\u2713 Terms & Conditions documents created");
  }
  console.log("Database seeded successfully!");
}

// server/worker.ts
init_storage();
init_whapi();
import cron from "node-cron";
import fs3 from "fs";
import path4 from "path";
var BackgroundWorker = class {
  dailyBalanceJob = null;
  messageProcessorJob = null;
  mediaCleanupJob = null;
  start() {
    this.dailyBalanceJob = cron.schedule("0 * * * *", async () => {
      await this.deductDailyBalance();
    });
    this.mediaCleanupJob = cron.schedule("0 3 * * *", async () => {
      await this.cleanupOldMedia();
    });
  }
  stop() {
    if (this.dailyBalanceJob) {
      this.dailyBalanceJob.stop();
    }
    if (this.messageProcessorJob) {
      this.messageProcessorJob.stop();
    }
    if (this.mediaCleanupJob) {
      this.mediaCleanupJob.stop();
    }
  }
  // Check and pause expired channels
  async deductDailyBalance() {
    try {
      const users2 = await storage.getAllUsers();
      const now = /* @__PURE__ */ new Date();
      let expiredCount = 0;
      for (const user of users2) {
        const channels2 = await storage.getChannelsForUser(user.id);
        for (const channel of channels2) {
          if (channel.status !== "ACTIVE") continue;
          if (channel.expiresAt && new Date(channel.expiresAt) <= now) {
            if (channel.whapiChannelToken) {
              try {
                await logoutChannel(channel.whapiChannelToken);
                console.log(`Logged out expired channel: ${channel.label}`);
              } catch (error) {
                console.error(`Failed to logout channel ${channel.label}:`, error);
              }
            }
            await storage.updateChannel(channel.id, {
              status: "PAUSED",
              daysRemaining: 0,
              whapiStatus: "stopped"
              // Mark as stopped
            });
            expiredCount++;
            await storage.createAuditLog({
              userId: user.id,
              action: "CHANNEL_EXPIRED",
              meta: {
                channelId: channel.id,
                channelLabel: channel.label,
                expiresAt: channel.expiresAt,
                phone: channel.phone
              }
            });
          } else if (channel.expiresAt) {
            const daysRemaining = Math.max(
              0,
              Math.ceil((new Date(channel.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1e3))
            );
            await storage.updateChannel(channel.id, {
              daysRemaining
            });
          }
        }
        const updatedChannels = await storage.getChannelsForUser(user.id);
        const hasActiveChannels = updatedChannels.some((c) => c.status === "ACTIVE");
        if (!hasActiveChannels && user.status === "active") {
          await storage.updateUser(user.id, {
            status: "expired"
          });
        }
      }
      console.log(`Daily channel expiration check completed. Expired ${expiredCount} channels.`);
    } catch (error) {
      console.error("Error in daily channel expiration check:", error);
    }
  }
  // Process queued messages and update statuses
  async processMessageQueue() {
    try {
      const jobs2 = [];
      for (const job of jobs2) {
        if (job.status === "DELIVERED" || job.status === "FAILED") continue;
        const messages2 = await storage.getMessagesForJob(job.id);
        let queued = 0;
        let pending = 0;
        let sent = 0;
        let delivered = 0;
        let read = 0;
        let failed = 0;
        let replied = 0;
        for (const message of messages2) {
          switch (message.status) {
            case "QUEUED":
              queued++;
              break;
            case "PENDING":
              pending++;
              break;
            case "SENT":
              sent++;
              break;
            case "DELIVERED":
              delivered++;
              break;
            case "READ":
              read++;
              break;
            case "FAILED":
              failed++;
              break;
            case "REPLIED":
              replied++;
              break;
          }
          if (message.status === "QUEUED") {
            await storage.updateMessage(message.id, {
              status: "PENDING"
            });
            queued--;
            pending++;
          } else if (message.status === "PENDING") {
            await storage.updateMessage(message.id, {
              status: "SENT"
            });
            pending--;
            sent++;
          }
        }
        await storage.updateJob(job.id, {
          queued,
          pending,
          sent,
          delivered,
          read,
          failed,
          replied,
          status: this.calculateJobStatus(queued, pending, sent, delivered, failed, job.total)
        });
      }
    } catch (error) {
    }
  }
  // Calculate overall job status based on message statuses
  calculateJobStatus(queued, pending, sent, delivered, failed, total) {
    if (failed === total) return "FAILED";
    if (failed > 0 && delivered + failed === total) return "PARTIAL";
    if (delivered === total) return "DELIVERED";
    if (sent > 0 || delivered > 0) return "SENT";
    if (pending > 0) return "PENDING";
    return "QUEUED";
  }
  // Clean up uploaded media files older than 30 days
  async cleanupOldMedia() {
    try {
      const uploadsDir = path4.join(process.cwd(), "uploads");
      if (!fs3.existsSync(uploadsDir)) {
        return;
      }
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1e3;
      let deletedCount = 0;
      const files = fs3.readdirSync(uploadsDir);
      for (const file of files) {
        if (file === ".gitkeep") continue;
        const filePath = path4.join(uploadsDir, file);
        const stats = fs3.statSync(filePath);
        if (stats.mtimeMs < thirtyDaysAgo) {
          try {
            fs3.unlinkSync(filePath);
            deletedCount++;
            console.log(`Deleted old media file: ${file}`);
          } catch (error) {
            console.error(`Failed to delete ${file}:`, error);
          }
        }
      }
      console.log(`Media cleanup completed. Deleted ${deletedCount} files older than 30 days.`);
    } catch (error) {
      console.error("Error in media cleanup:", error);
    }
  }
};
var backgroundWorker = new BackgroundWorker();

// server/index.ts
var app = express2();
app.use(express2.json({
  limit: "50mb",
  // Allow larger payloads for base64 file uploads
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express2.urlencoded({ limit: "50mb", extended: false }));
app.use(cookieParser());
app.use("/uploads", express2.static(path5.join(process.cwd(), "uploads")));
app.use((req, res, next) => {
  const start = Date.now();
  const path6 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path6.startsWith("/api")) {
      let logLine = `${req.method} ${path6} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  try {
    await seedDatabase();
  } catch (error) {
    log(`Seed database error (may be expected if data already exists): ${error}`);
  }
  registerRoutes(app);
  const server = app.server;
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    const __dirname = path5.resolve();
    const clientDist = path5.join(__dirname, "client-dist");
    app.use(express2.static(clientDist));
    app.get("*", (_, res) => {
      res.sendFile(path5.join(clientDist, "index.html"));
    });
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  const httpServer = server || app.listen({
    port,
    host: "0.0.0.0"
  }, () => {
    log(`serving on port ${port}`);
    backgroundWorker.start();
  });
  process.on("SIGTERM", () => {
    log("SIGTERM signal received: closing HTTP server");
    backgroundWorker.stop();
    httpServer.close(() => {
      log("HTTP server closed");
    });
  });
})();
