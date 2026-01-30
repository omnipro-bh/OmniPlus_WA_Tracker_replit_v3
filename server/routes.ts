import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, inArray, desc, gte, sql } from "drizzle-orm";
import { workflows, conversationStates, workflowExecutions, firstMessageFlags, users, messages, jobs, termsDocuments, sentMessages } from "@shared/schema";
import * as schema from "@shared/schema";
import { hashPassword, comparePassword, generateToken, requireAuth, requireAdmin, type AuthRequest } from "./auth";
import { z } from "zod";
import type { InsertUser, InsertChannel, InsertTemplate, InsertJob, InsertMessage, InsertWorkflow, InsertOfflinePayment, InsertPlan } from "@shared/schema";
import { 
  insertChannelSchema, 
  insertTemplateSchema, 
  insertJobSchema, 
  insertMessageSchema, 
  insertWorkflowSchema,
  insertOfflinePaymentSchema,
  insertPlanSchema,
  insertPlanRequestSchema,
  insertCouponSchema,
  buttonSchema
} from "@shared/schema";
import { createPaypalOrder, capturePaypalOrder, loadPaypalDefault, verifyPayPalOrder } from "./paypal";
import { verifyWebhookSignature } from "./paypal-webhooks";
import * as whapi from "./whapi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { executeHttpNode, getNextNodeByHandle } from "./workflows/httpNodeExecutor";

dayjs.extend(utc);
dayjs.extend(timezone);

// Helper function to get the effective user ID (handles impersonation)
function getEffectiveUserId(req: AuthRequest): number {
  return req.impersonatedUser?.id || req.userId!;
}

// CRITICAL: Normalize buttons to ALWAYS have 'title' field (NEVER 'text')
// This ensures WHAPI compatibility regardless of source
// MUST strip out 'text' field completely
function normalizeButtons(buttons: any[] | undefined): any[] {
  if (!buttons || !Array.isArray(buttons)) return [];
  return buttons.map((btn: any) => {
    const normalized: any = {
      type: btn.type || "quick_reply",
      id: btn.id,
      title: btn.title || btn.text || "Button",  // Use title if exists, fallback to text, then default
    };
    // Add optional fields but NEVER add 'text'
    if (btn.value !== undefined) normalized.value = btn.value;
    if (btn.url) normalized.url = btn.url;
    if (btn.phone_number) normalized.phone_number = btn.phone_number;
    if (btn.copy_code) normalized.copy_code = btn.copy_code;
    return normalized;
  });
}

// Helper function to calculate days from billing period
function getDaysFromBillingPeriod(billingPeriod: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL"): number {
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

// Helper function to get the effective phonebook limit for a user
async function getPhonebookLimit(userId: number): Promise<number | null> {
  const user = await storage.getUser(userId);
  if (!user) {
    console.log(`[PhonebookLimit] User ${userId} not found`);
    return null;
  }

  // Check if user has an override
  if (user.phonebookLimit !== null && user.phonebookLimit !== undefined) {
    console.log(`[PhonebookLimit] User ${userId} has override: ${user.phonebookLimit}`);
    // Normalize -1 (and other negative values) to null for unlimited
    const normalizedLimit = user.phonebookLimit < 0 ? null : user.phonebookLimit;
    console.log(`[PhonebookLimit] Normalized override: ${normalizedLimit}`);
    return normalizedLimit;
  }

  // Get ALL active subscriptions and use the most permissive limit
  const activeSubscriptions = await db.query.subscriptions.findMany({
    where: (subscriptions, { eq, and }) => and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "ACTIVE")
    ),
  });
  
  if (activeSubscriptions.length === 0) {
    console.log(`[PhonebookLimit] User ${userId} has no active subscription - unlimited`);
    return null; // No subscription = unlimited
  }

  console.log(`[PhonebookLimit] User ${userId} has ${activeSubscriptions.length} active subscriptions`);
  
  // Get all plan limits
  let mostPermissiveLimit: number | null = null;
  
  for (const subscription of activeSubscriptions) {
    const plan = await storage.getPlan(subscription.planId);
    if (!plan) continue;
    
    const planLimit = plan.phonebookLimit ?? null;
    const normalizedPlanLimit = (planLimit !== null && planLimit < 0) ? null : planLimit;
    
    console.log(`[PhonebookLimit] Plan ${plan.name} (ID ${plan.id}) limit: ${normalizedPlanLimit}`);
    
    // If any plan is unlimited, user gets unlimited
    if (normalizedPlanLimit === null) {
      console.log(`[PhonebookLimit] Found unlimited plan - returning unlimited`);
      return null;
    }
    
    // Otherwise, use the highest limit
    if (mostPermissiveLimit === null || normalizedPlanLimit > mostPermissiveLimit) {
      mostPermissiveLimit = normalizedPlanLimit;
    }
  }

  console.log(`[PhonebookLimit] Final most permissive limit: ${mostPermissiveLimit}`);
  return mostPermissiveLimit;
}

export function registerRoutes(app: Express) {
  // ============================================================================
  // PAYPAL INTEGRATION
  // ============================================================================

  // PayPal configuration endpoint - returns environment setting
  app.get("/api/paypal/config", async (req, res) => {
    try {
      const environment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
      res.json({ environment });
    } catch (e) {
      console.error("Failed to get PayPal config", e);
      res.status(500).json({ error: "Failed to get PayPal config" });
    }
  });

  app.get("/paypal/setup", async (req, res) => {
    try {
      await loadPaypalDefault(req, res);
    } catch (error) {
      console.error("PayPal setup error:", error);
      res.status(500).json({ 
        error: "PayPal service unavailable. Please check your PayPal credentials." 
      });
    }
  });

  app.post("/paypal/order", async (req, res) => {
    await createPaypalOrder(req, res);
  });

  app.post("/paypal/order/:orderID/capture", async (req, res) => {
    await capturePaypalOrder(req, res);
  });

  // PayPal Webhook Handler for subscription payments
  app.post("/webhooks/paypal", async (req: Request, res: Response) => {
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
          payload: webhookPayload,
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
            customId,
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
            const [ledgerEntry] = await tx.insert(schema.ledger).values({
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
                eventId,
              },
            }).returning();

            const now = new Date();
            const [ledgerRecord] = await tx.insert(schema.channelDaysLedger).values({
              channelId,
              days: daysToAdd,
              source: "PAYPAL",
              subscriptionId: subscriptionId || null,
              metadata: {
                planId,
                planName: plan.name,
                captureId,
                ledgerId: ledgerEntry.id,
              },
            }).returning();

            const currentExpiresAt = channel.expiresAt ? new Date(channel.expiresAt) : null;
            const startDate = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;
            const newExpiresAt = new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
            const newStatus = "ACTIVE";

            await tx.update(schema.channels)
              .set({
                status: newStatus,
                activeFrom: channel.activeFrom || now,
                expiresAt: newExpiresAt,
                daysRemaining: daysToAdd,
                lastExtendedAt: now,
                updatedAt: now,
              })
              .where(eq(schema.channels.id, channelId));

            if (subscriptionId) {
              await tx.update(schema.subscriptions)
                .set({ status: "ACTIVE" })
                .where(eq(schema.subscriptions.id, subscriptionId));
            }

            await tx.insert(schema.auditLogs).values({
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
                captureId,
              },
            });
          });

          await storage.markWebhookProcessed(webhookEvent.id);
          console.log(`[PayPal Webhook] Payment processed successfully for channel ${channelId}`);
        } catch (error: any) {
          console.error("[PayPal Webhook] Processing error:", error);
          return res.status(500).json({ error: "Failed to process payment" });
        }
      } else {
        console.log(`[PayPal Webhook] Ignoring event type: ${eventType}`);
        await storage.markWebhookProcessed(webhookEvent.id);
      }

      res.status(200).json({ message: "Webhook processed" });
    } catch (error: any) {
      console.error("[PayPal Webhook] Unexpected error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
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
        status: "active",
      });

      const token = generateToken(user.id);
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
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

      // Check if user is banned
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
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie("token");
    res.json({ success: true });
  });

  // Get current user with enriched data
  app.get("/api/me", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Determine which user's data to return
      // When impersonating: return impersonated user's data, with admin context
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      const effectiveUser = req.impersonatedUser || req.user!;
      
      const user = await storage.getUser(effectiveUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get current subscription and plan for the effective user
      const subscription = await storage.getActiveSubscriptionForUser(user.id);
      let currentPlan = null;
      let effectivePageAccess = null;
      
      if (subscription) {
        currentPlan = await storage.getPlan(subscription.planId);
        
        // Calculate effective page access (plan + subscription overrides)
        if (currentPlan) {
          const planPageAccess = typeof currentPlan.pageAccess === 'object' && currentPlan.pageAccess !== null ? currentPlan.pageAccess : {};
          const subscriptionPageAccess = typeof subscription.pageAccess === 'object' && subscription.pageAccess !== null ? subscription.pageAccess : {};
          
          effectivePageAccess = {
            ...planPageAccess,
            ...subscriptionPageAccess
          };
          
          console.log(`[/api/me] User ${user.id} - Plan pageAccess:`, JSON.stringify(planPageAccess));
          console.log(`[/api/me] User ${user.id} - Subscription pageAccess:`, JSON.stringify(subscriptionPageAccess));
          console.log(`[/api/me] User ${user.id} - Effective pageAccess:`, JSON.stringify(effectivePageAccess));
        }
      } else {
        // Default page access for users without a subscription - get from settings
        const pageAccessSetting = await storage.getSetting("default_page_access");
        effectivePageAccess = pageAccessSetting?.value 
          ? JSON.parse(pageAccessSetting.value)
          : {
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
              whapiSettings: false,
              bookingScheduler: false,
            };
      }

      // Get channels count for the effective user
      const channels = await storage.getChannelsForUser(user.id);
      const channelsUsed = channels.length;
      const channelsLimit = currentPlan?.channelsLimit || 0;

      // Calculate total days remaining from all channels
      const totalDaysRemaining = channels.reduce((sum, channel) => {
        return sum + (channel.daysRemaining || 0);
      }, 0);

      // Calculate messages sent today for the effective user
      // Get start and end of today in UTC
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      
      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
      
      // Query all jobs created today for this user and sum their total field
      const todayJobs = await db
        .select({
          totalMessages: sql<number>`COALESCE(SUM(${jobs.total}), 0)`,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.userId, user.id),
            gte(jobs.createdAt, startOfToday),
            sql`${jobs.createdAt} < ${startOfTomorrow}`
          )
        );
      
      const messagesSentToday = Number(todayJobs[0]?.totalMessages || 0);

      const { passwordHash: _, ...userWithoutPassword } = user;
      
      // Build response - when impersonating, this contains the impersonated user's data
      const response: any = {
        ...userWithoutPassword,
        daysBalance: totalDaysRemaining,
        currentSubscription: subscription,
        currentPlan,
        effectivePageAccess,
        channelsUsed,
        channelsLimit,
        messagesSentToday,
      };

      // Add impersonation metadata when impersonating
      if (req.isImpersonating && req.user) {
        response.impersonation = {
          isImpersonating: true,
          admin: {
            id: req.userId,
            name: req.user.name,
            email: req.user.email,
          },
        };
      }

      res.json(response);
    } catch (error: any) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user data" });
    }
  });

  // ============================================================================
  // PLANS & SUBSCRIPTIONS
  // ============================================================================

  // Get all plans
  app.get("/api/plans", async (req: Request, res: Response) => {
    try {
      const plans = await storage.getPlans();
      console.log("[GET /api/plans] Returning plans with limits:", plans.map(p => ({ 
        id: p.id, 
        name: p.name,
        channelsLimit: p.channelsLimit,
        chatbotsLimit: p.chatbotsLimit,
        phonebookLimit: p.phonebookLimit,
        dailyMessagesLimit: p.dailyMessagesLimit,
        bulkMessagesLimit: p.bulkMessagesLimit
      })));
      res.json(plans);
    } catch (error: any) {
      console.error("Get plans error:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  // Subscribe to a plan (direct or PayPal)
  app.post("/api/subscribe", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { planId, durationType } = req.body;

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Calculate days based on duration type
      let days = getDaysFromBillingPeriod(plan.billingPeriod);
      if (durationType === "QUARTERLY") {
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 3;
      } else if (durationType === "SEMI_ANNUAL") {
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 6;
      } else if (durationType === "ANNUAL") {
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 12;
      }

      // Create subscription
      const subscription = await storage.createSubscription({
        userId: req.userId!,
        planId: plan.id,
        status: "ACTIVE",
        durationType: durationType || "MONTHLY",
        provider: "DIRECT",
      });

      // Add days to user balance
      const user = await storage.getUser(req.userId!);
      if (user) {
        await storage.updateUser(req.userId!, {
          daysBalance: (user.daysBalance || 0) + days,
          status: "active",
        });
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "SUBSCRIBE",
        meta: { 
          entity: "subscription",
          entityId: subscription.id,
          planId, 
          durationType, 
          days 
        },
      });

      res.json({ subscription, daysAdded: days });
    } catch (error: any) {
      console.error("Subscribe error:", error);
      res.status(500).json({ error: "Subscription failed" });
    }
  });

  // Confirm PayPal subscription payment
  app.post("/api/subscribe/paypal/confirm", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const validationResult = z.object({
        planId: z.number(),
        durationType: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
        orderId: z.string().min(1),
        termsVersion: z.string().min(1, "Terms acceptance is required"),
      }).safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten() 
        });
      }

      const { planId, durationType, orderId, termsVersion } = validationResult.data;

      // Check for duplicate transaction (idempotency)
      const existingSubscription = await storage.getActiveSubscriptionForUser(req.userId!);
      if (existingSubscription && existingSubscription.transactionId === orderId) {
        return res.status(409).json({ error: "This payment has already been processed" });
      }

      // Verify payment with PayPal servers
      const verification = await verifyPayPalOrder(orderId);
      
      if (!verification.success || verification.status !== "COMPLETED") {
        return res.status(400).json({ error: "Payment verification failed or not completed" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Calculate price and days based on duration type
      let durationMultiplier = 1;
      let discountMultiplier = 1;
      let days = getDaysFromBillingPeriod(plan.billingPeriod);
      
      if (durationType === "QUARTERLY") {
        durationMultiplier = 3;
        discountMultiplier = 1 - ((plan.quarterlyDiscountPercent || 0) / 100); // Use plan's quarterly discount
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 3;
      } else if (durationType === "SEMI_ANNUAL") {
        durationMultiplier = 6;
        discountMultiplier = 1 - ((plan.semiAnnualDiscountPercent || 5) / 100); // Use plan's semi-annual discount
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 6;
      } else if (durationType === "ANNUAL") {
        durationMultiplier = 12;
        discountMultiplier = 1 - ((plan.annualDiscountPercent || 10) / 100); // Use plan's annual discount
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 12;
      }

      // Verify payment amount matches expected price for duration (with discount)
      const expectedAmount = plan.price ? ((plan.price * durationMultiplier * discountMultiplier) / 100).toFixed(2) : "0"; // Convert cents to dollars
      if (verification.amount !== expectedAmount || verification.currency !== plan.currency) {
        return res.status(400).json({ 
          error: "Payment amount mismatch", 
          details: `Expected ${expectedAmount} ${plan.currency} for ${durationType}, got ${verification.amount} ${verification.currency}` 
        });
      }

      // Check if admin balance pool has enough days
      const mainBalance = await storage.getMainDaysBalance();
      if (mainBalance < days) {
        return res.status(400).json({ 
          error: "Insufficient admin balance", 
          details: `Admin pool has ${mainBalance} days, but ${days} days are needed for this subscription. Please contact support.` 
        });
      }

      // Get user and their channels
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const userChannels = await storage.getChannelsForUser(req.userId!);
      if (userChannels.length === 0) {
        return res.status(400).json({ 
          error: "No channels found", 
          details: "Please create a channel before subscribing." 
        });
      }

      // Get the first active or pending channel
      const targetChannel = userChannels.find(c => c.status === "ACTIVE" || c.status === "PENDING") || userChannels[0];

      // Deduct from admin balance pool FIRST (atomic operation)
      const newMainBalance = await storage.updateMainDaysBalance(-days);

      // Create balance transaction for audit trail
      const balanceTransaction = await storage.createBalanceTransaction({
        type: "allocate",
        days,
        channelId: targetChannel.id,
        userId: req.userId!,
        note: `PayPal subscription - ${plan.name} (${durationType}, ${days} days)`,
      });

      // Create subscription with PayPal details
      const subscription = await storage.createSubscription({
        userId: req.userId!,
        planId: plan.id,
        status: "ACTIVE",
        durationType: durationType || "MONTHLY",
        provider: "PAYPAL",
        transactionId: orderId,
        termsVersion,
        agreedAt: new Date(),
      });

      // Call WHAPI API to extend the channel
      let whapiResponse = null;
      try {
        if (!targetChannel.whapiChannelId && targetChannel.status === "PENDING") {
          // PENDING channel - create new WHAPI channel
          console.log("Creating new WHAPI channel for PayPal subscription:", targetChannel.label);
          whapiResponse = await whapi.createWhapiChannel(targetChannel.label, targetChannel.phone);
          
          // Store WHAPI metadata
          await storage.updateChannel(targetChannel.id, {
            whapiChannelId: whapiResponse.id,
            whapiChannelToken: whapiResponse.token,
            phone: whapiResponse.phone || targetChannel.phone,
            whapiStatus: whapiResponse.status,
            stopped: whapiResponse.stopped || false,
            creationTS: whapiResponse.creationTS ? new Date(whapiResponse.creationTS) : null,
            activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null,
          });
        } else if (targetChannel.whapiChannelId) {
          // Existing channel - extend days via WHAPI API
          console.log("Extending WHAPI channel via PayPal:", targetChannel.whapiChannelId);
          whapiResponse = await whapi.extendWhapiChannel(
            targetChannel.whapiChannelId, 
            days, 
            `PayPal subscription for ${user.email}`
          );
        }
      } catch (whapiError: any) {
        console.error("WHAPI API failed during PayPal subscription:", whapiError.message);
        
        // Rollback: refund to main balance, delete transaction, and cancel subscription
        await storage.updateMainDaysBalance(days);
        await storage.deleteBalanceTransaction(balanceTransaction.id);
        await storage.updateSubscription(subscription.id, { status: "CANCELLED" });
        
        return res.status(500).json({ 
          error: "Failed to activate channel", 
          details: whapiError.message 
        });
      }

      // Add days to channel ledger (this updates channel status and expiry)
      await storage.addDaysToChannel({
        channelId: targetChannel.id,
        days,
        source: "PAYPAL",
        balanceTransactionId: balanceTransaction.id,
        subscriptionId: subscription.id,
        metadata: {
          orderId,
          planId,
          durationType,
        },
      });

      // Update WHAPI status if we got a response
      if (whapiResponse) {
        await storage.updateChannel(targetChannel.id, {
          whapiStatus: whapiResponse.status,
          activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null,
        });
      }

      // Update user status to active
      await storage.updateUser(req.userId!, {
        daysBalance: (user.daysBalance || 0) + days,
        status: "active",
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
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
        },
      });

      res.json({ subscription, daysAdded: days, channelExtended: true });
    } catch (error: any) {
      console.error("PayPal subscription error:", error);
      res.status(500).json({ error: "PayPal subscription failed" });
    }
  });

  // Submit offline payment (including quote requests and demo bookings)
  app.post("/api/subscribe/offline", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      console.log("[OfflinePayment] Received request body:", JSON.stringify(req.body, null, 2));
      
      // Validate request body with type field explicitly allowed
      const validationResult = insertOfflinePaymentSchema.extend({ 
        userId: z.number(),
        type: z.enum(["OFFLINE_PAYMENT", "FREE_TRIAL"]).optional(),
        termsVersion: z.preprocess(
          val => val == null ? undefined : String(val),
          z.string().optional()
        )
      }).safeParse({
        ...req.body,
        userId: req.userId!,
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
      const submittedDurationType = (validationResult.data as any).durationType;
      const paymentType = (validationResult.data as any).type || "OFFLINE_PAYMENT"; // FREE_TRIAL or OFFLINE_PAYMENT

      // Validate terms acceptance (not required for FREE_TRIAL)
      if (paymentType !== "FREE_TRIAL" && !termsVersion) {
        return res.status(400).json({ error: "Terms acceptance is required" });
      }

      // Validate proofUrl to prevent XSS attacks
      if (proofUrl) {
        if (!proofUrl.startsWith('data:')) {
          return res.status(400).json({ error: "Invalid proof file format. Only base64 data URIs are allowed." });
        }
        // Check file size (5MB limit for base64)
        if (proofUrl.length > 7000000) { // ~5MB in base64
          return res.status(400).json({ error: "Proof file is too large. Maximum size is 5MB." });
        }
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Get duration type for record-keeping
      const durationType = submittedDurationType || "MONTHLY";

      // Basic validation only - require positive amount
      // Offline payments are manually reviewed by admin, so strict price validation is not needed
      // Admin can verify the amount during approval process
      if (paymentType !== "FREE_TRIAL") {
        if (!amount || amount <= 0) {
          return res.status(400).json({ error: "Amount must be a positive number" });
        }
        
        // Validate coupon if provided (just check validity, not amount calculation)
        if (couponCode) {
          const couponValidation = await storage.validateCoupon(couponCode, req.userId!, planId);
          if (!couponValidation.valid) {
            return res.status(400).json({ error: couponValidation.message });
          }
        }
        
        // Log the submission for admin review (no blocking)
        console.log(`[OfflinePayment] Submitted: planId=${planId}, amount=${amount}, currency=${currency}, durationType=${durationType}, couponCode=${couponCode || 'none'}`);
      }

      const payment = await storage.createOfflinePayment({
        userId: req.userId!,
        planId,
        type: paymentType,
        amount,
        currency: currency || "USD",
        reference,
        proofUrl,
        couponCode: couponCode || undefined,
        requestType: requestType || "PAID",
        metadata,
        termsVersion,
        status: "PENDING",
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "OFFLINE_PAYMENT_SUBMIT",
        meta: {
          entity: "offline_payment",
          entityId: payment.id,
          planId,
          amount,
          currency,
          requestType: requestType || "PAID",
          metadata
        },
      });

      res.json(payment);
    } catch (error: any) {
      console.error("Offline payment error:", error);
      res.status(500).json({ error: "Failed to submit payment" });
    }
  });

  // ============================================================================
  // CHANNELS
  // ============================================================================

  // Get user channels
  app.get("/api/channels", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const channels = await storage.getChannelsForUser(effectiveUserId);
      
      // Check for expired channels in real-time and update status if needed
      const now = new Date();
      const updatedChannels = [];
      
      for (const channel of channels) {
        let updatedChannel = channel;
        
        // If channel is ACTIVE but expired, mark as PAUSED and logout
        if (channel.status === "ACTIVE" && channel.expiresAt && new Date(channel.expiresAt) <= now) {
          // Logout from WhatsApp if still connected
          if (channel.whapiChannelToken) {
            try {
              await whapi.logoutChannel(channel.whapiChannelToken);
              console.log(`Auto-logged out expired channel: ${channel.label}`);
            } catch (error) {
              console.error(`Failed to logout expired channel ${channel.label}:`, error);
            }
          }
          
          // Update channel to PAUSED
          const pausedChannel = await storage.updateChannel(channel.id, {
            status: "PAUSED",
            daysRemaining: 0,
            authStatus: "PENDING",
            whapiStatus: "stopped",
          });
          
          if (pausedChannel) {
            updatedChannel = pausedChannel;
          }
          
          // Log expiration
          await storage.createAuditLog({
            actorUserId: req.userId!,
            action: "CHANNEL_EXPIRED",
            meta: {
              channelId: channel.id,
              channelLabel: channel.label,
              expiresAt: channel.expiresAt,
            },
          });
        }
        
        updatedChannels.push(updatedChannel);
      }
      
      res.json(updatedChannels);
    } catch (error: any) {
      console.error("Get channels error:", error);
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  // Create channel
  app.post("/api/channels", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      // Validate request body
      const validationResult = insertChannelSchema.extend({ userId: z.number() }).safeParse({
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

      // Check subscription and limits
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

      // Create WHAPI channel (required - no fallback)
      // Note: Days balance is NOT required for channel creation, only for activation/extension
      let whapiResponse;
      try {
        whapiResponse = await whapi.createWhapiChannel(label, phone);
        console.log("WHAPI channel created successfully with ID:", whapiResponse.id);
      } catch (whapiError: any) {
        console.error("WHAPI channel creation failed:", whapiError.message);
        return res.status(500).json({ 
          error: "Failed to create channel", 
          details: whapiError.message 
        });
      }

      // Store channel with all WHAPI response data
      // Status is PENDING until extended/activated with days
      const channel = await storage.createChannel({
        userId: effectiveUserId,
        label,
        phone: whapiResponse.phone || phone, // Use WHAPI-confirmed phone
        status: "PENDING", // Always create as PENDING - activation requires days via /extend endpoint
        authStatus: "PENDING", // User must scan QR code to authorize
        whapiChannelId: whapiResponse.id,
        whapiChannelToken: whapiResponse.token, // Token already includes "Bearer " prefix
        whapiStatus: whapiResponse.status, // WHAPI channel status from API
        stopped: whapiResponse.stopped || false,
        creationTS: whapiResponse.creationTS ? new Date(whapiResponse.creationTS) : new Date(),
        activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CREATE",
        meta: { 
          entity: "channel",
          entityId: channel.id,
          label, 
          phone, 
          whapiChannelId: whapiResponse.id,
          whapiStatus: whapiResponse.status
        },
      });

      res.json(channel);
    } catch (error: any) {
      console.error("Create channel error:", error);
      res.status(500).json({ error: "Failed to create channel" });
    }
  });

  // Get QR code for channel authentication
  app.get("/api/channels/:id/qr", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);

      // Use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      // Check if channel is expired
      if (channel.expiresAt && new Date(channel.expiresAt) <= new Date()) {
        return res.status(400).json({ 
          error: "Channel has expired. Please extend the channel before scanning QR code." 
        });
      }

      // Check if channel is ACTIVE
      if (channel.status !== "ACTIVE") {
        return res.status(400).json({ 
          error: "Channel must be ACTIVE. Please extend the channel first." 
        });
      }

      if (!channel.whapiChannelToken) {
        return res.status(400).json({ error: "Channel token not available. Please contact support." });
      }

      // Fetch QR code from WHAPI using channel token
      try {
        const qrData = await whapi.getChannelQRCode(channel.whapiChannelToken);
        res.json(qrData);
      } catch (whapiError: any) {
        console.error("Failed to fetch QR code from WHAPI:", whapiError.message);
        // Return the actual error message for accurate troubleshooting
        res.status(500).json({ error: whapiError.message || "Failed to fetch QR code" });
      }
    } catch (error: any) {
      console.error("Get QR code error:", error);
      res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  // Mark channel as authorized after QR scan
  app.patch("/api/channels/:id/authorize", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);

      // Use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      // Check if channel is expired
      if (channel.expiresAt && new Date(channel.expiresAt) <= new Date()) {
        return res.status(400).json({ 
          error: "Channel has expired. Please add days to your account before authorizing." 
        });
      }

      // Check if channel is ACTIVE
      if (channel.status !== "ACTIVE") {
        return res.status(400).json({ 
          error: "Channel must be ACTIVE to authorize. Please extend the channel first." 
        });
      }

      // Fetch real channel status from WHAPI Gate API
      let whapiStatusData: any = null;
      if (channel.whapiChannelId && channel.whapiChannelToken) {
        try {
          whapiStatusData = await whapi.getChannelStatus(channel.whapiChannelId, channel.whapiChannelToken);
          console.log("WHAPI channel status:", whapiStatusData);
        } catch (statusError: any) {
          console.error("Failed to fetch WHAPI status:", statusError.message);
          // Continue even if status fetch fails
        }
      }

      // Update channel auth status to AUTHORIZED and save WHAPI status
      const updatedChannel = await storage.updateChannel(channelId, {
        authStatus: "AUTHORIZED",
        stopped: false,
        whapiStatus: whapiStatusData?.status || channel.whapiStatus || "unknown",
      });

      // Update user status to "active" if they have any active channels
      const user = await storage.getUser(req.userId!);
      const userChannels = await storage.getChannelsForUser(req.userId!);
      const hasActiveChannels = userChannels.some(c => c.status === "ACTIVE");
      if (hasActiveChannels && user && user.status === "expired") {
        await storage.updateUser(req.userId!, { status: "active" });
        console.log(`Updated user ${user.email} status from expired to active after channel authorization`);
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE",
        meta: {
          entity: "channel",
          entityId: channelId,
          field: "authStatus",
          newValue: "AUTHORIZED",
          whapiStatus: whapiStatusData?.status || "unknown",
          userStatusUpdated: hasActiveChannels && user && user.status === "expired",
        },
      });

      res.json(updatedChannel);
    } catch (error: any) {
      console.error("Authorize channel error:", error);
      res.status(500).json({ error: "Failed to authorize channel" });
    }
  });

  // Logout channel from WhatsApp
  app.post("/api/channels/:id/logout", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);

      // Use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      if (!channel.whapiChannelToken) {
        return res.status(400).json({ error: "Channel token not found" });
      }

      // Call WHAPI logout API
      try {
        await whapi.logoutChannel(channel.whapiChannelToken);
      } catch (whapiError: any) {
        console.error("WHAPI logout error:", whapiError.message);
        // Continue even if WHAPI logout fails (channel might already be logged out)
      }

      // Update channel auth status back to PENDING
      const updatedChannel = await storage.updateChannel(channelId, {
        authStatus: "PENDING",
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE",
        meta: {
          entity: "channel",
          entityId: channelId,
          field: "authStatus",
          oldValue: "AUTHORIZED",
          newValue: "PENDING",
        },
      });

      res.json(updatedChannel);
    } catch (error: any) {
      console.error("Logout channel error:", error);
      res.status(500).json({ error: "Failed to logout channel" });
    }
  });

  // Extend channel (add days to activate/renew)
  app.post("/api/channels/:id/extend", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);

      // Use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      if (!channel.whapiChannelId) {
        return res.status(400).json({ error: "Channel not connected to WHAPI" });
      }

      const { days, comment } = req.body;
      if (!days || days <= 0) {
        return res.status(400).json({ error: "Invalid days value" });
      }

      // Check if user has sufficient days balance
      const user = await storage.getUser(req.userId!);
      if (!user || user.daysBalance < days) {
        return res.status(403).json({ error: "Insufficient days balance" });
      }

      // Extend channel via WHAPI Partner API
      try {
        await whapi.extendWhapiChannel(
          channel.whapiChannelId, 
          days, 
          comment || `Extension for ${user.email}`
        );
      } catch (whapiError: any) {
        console.error("Failed to extend WHAPI channel:", whapiError.message);
        return res.status(500).json({ 
          error: "Failed to extend channel", 
          details: whapiError.message 
        });
      }

      // Deduct days from user balance
      await storage.updateUser(req.userId!, {
        daysBalance: user.daysBalance - days
      });

      // Update channel status to active
      const updated = await storage.updateChannel(channelId, { status: "ACTIVE" });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "EXTEND",
        meta: {
          entity: "channel",
          entityId: channelId,
          days,
          daysRemaining: user.daysBalance - days
        },
      });

      res.json({ 
        success: true, 
        channel: updated, 
        daysRemaining: user.daysBalance - days 
      });
    } catch (error: any) {
      console.error("Extend channel error:", error);
      res.status(500).json({ error: "Failed to extend channel" });
    }
  });

  // Delete channel
  app.delete("/api/channels/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);
      const channel = await storage.getChannel(channelId);

      // Use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      console.log(`[DELETE /api/channels/${channelId}] userId=${req.userId}, impersonatedId=${req.impersonatedUser?.id}, effectiveUserId=${effectiveUserId}, channel.userId=${channel?.userId}`);
      
      if (!channel || channel.userId !== effectiveUserId) {
        console.log(`[DELETE /api/channels/${channelId}] Channel not found or ownership mismatch`);
        return res.status(404).json({ error: "Channel not found" });
      }

      // Calculate remaining days (best-effort local calculation)
      let remainingDays = 0;
      if (channel.expiresAt) {
        const now = new Date();
        const expiresAt = new Date(channel.expiresAt);
        const msRemaining = expiresAt.getTime() - now.getTime();
        const daysRemaining = msRemaining / (24 * 60 * 60 * 1000);
        remainingDays = Math.max(0, Math.floor(daysRemaining));
      }

      // Delete from WHAPI (unused days automatically returned to partner balance)
      if (channel.whapiChannelId) {
        try {
          await whapi.deleteWhapiChannel(channel.whapiChannelId);
          console.log(`WHAPI channel deleted successfully. ${remainingDays} unused days to be refunded.`);
        } catch (whapiError: any) {
          console.error("Failed to delete WHAPI channel:", whapiError.message);
          // Continue with local deletion even if WHAPI fails
        }
      }

      // Add remaining days back to main balance
      if (remainingDays > 0) {
        await storage.updateMainDaysBalance(remainingDays);
        
        // Log refund transaction
        await storage.createBalanceTransaction({
          type: "refund",
          days: remainingDays,
          channelId,
          userId: channel.userId,
          note: `WHAPI delete successful - ${remainingDays} unused days returned`,
        });
      }

      await storage.deleteChannel(channelId);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "DELETE",
        meta: {
          entity: "channel",
          entityId: channelId,
          label: channel.label,
          refundedDays: remainingDays
        },
      });

      res.json({ 
        success: true, 
        message: remainingDays > 0 
          ? `Channel deleted successfully. ${remainingDays} unused days refunded to main balance.`
          : "Channel deleted successfully.",
        refundedDays: remainingDays
      });
    } catch (error: any) {
      console.error("Delete channel error:", error);
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });

  // Get Safety Meter metrics for a channel
  app.get("/api/channels/:id/safety-meter", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);

      // Get channel - use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      // Check if user has access to Safety Meter feature from their plan
      const subscription = await storage.getActiveSubscriptionForUser(req.userId!);
      let hasSafetyMeterAccess = false;

      if (subscription) {
        const plan = await storage.getPlan(subscription.planId);
        if (plan) {
          hasSafetyMeterAccess = (plan as any).safetyMeterEnabled === true;
        }
      }

      if (!hasSafetyMeterAccess) {
        return res.status(403).json({ 
          error: "Safety Meter feature not available",
          message: "This feature is not included in your current plan. Please upgrade to access Safety Meter."
        });
      }

      // Check if channel has a valid token
      if (!channel.whapiChannelToken) {
        return res.status(400).json({ 
          error: "Channel token not found",
          message: "Channel must be authorized before checking Safety Meter."
        });
      }

      // Fetch safety metrics from WHAPI Tools API
      const whapiResponse = await fetch("https://tools.whapi.cloud/services/riskOfBlocking", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${channel.whapiChannelToken}`,
          "Content-Type": "application/json",
        },
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
    } catch (error: any) {
      console.error("Get safety meter error:", error);
      res.status(500).json({ error: "Failed to fetch safety metrics" });
    }
  });

  // Refresh/recalculate Safety Meter metrics for a channel
  app.post("/api/channels/:id/safety-meter/refresh", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);

      // Get channel - use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      // Check if user has access to Safety Meter feature from their plan
      const subscription = await storage.getActiveSubscriptionForUser(req.userId!);
      let hasSafetyMeterAccess = false;

      if (subscription) {
        const plan = await storage.getPlan(subscription.planId);
        if (plan) {
          hasSafetyMeterAccess = (plan as any).safetyMeterEnabled === true;
        }
      }

      if (!hasSafetyMeterAccess) {
        return res.status(403).json({ 
          error: "Safety Meter feature not available",
          message: "This feature is not included in your current plan. Please upgrade to access Safety Meter."
        });
      }

      // Check if channel has a valid token
      if (!channel.whapiChannelToken) {
        return res.status(400).json({ 
          error: "Channel token not found",
          message: "Channel must be authorized before checking Safety Meter."
        });
      }

      // Recalculate safety metrics via WHAPI Tools API
      const whapiResponse = await fetch("https://tools.whapi.cloud/services/riskOfBlocking", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${channel.whapiChannelToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!whapiResponse.ok) {
        const errorText = await whapiResponse.text();
        console.error("[Safety Meter] WHAPI API refresh error:", errorText);
        
        // Check if it's a rate limit error (already refreshed today)
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
      
      // Log the refresh action
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "SAFETY_METER_REFRESH",
        meta: {
          channelId,
          channelLabel: channel.label,
          metrics: safetyData,
        },
      });

      res.json(safetyData);
    } catch (error: any) {
      console.error("Refresh safety meter error:", error);
      res.status(500).json({ error: "Failed to refresh safety metrics" });
    }
  });

  // ============================================================================
  // MESSAGING
  // ============================================================================

  // Send single message
  app.post("/api/messages/send", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { channelId, to, header, body, footer, buttons, messageType, mediaUrl } = req.body;

      // Validate required fields
      if (!channelId || !to || !body) {
        return res.status(400).json({ error: "Missing required fields: channelId, to, body" });
      }

      // Validate media for media message types
      const mediaRequiredTypes = ["image", "image_buttons", "video_buttons", "document"];
      if (mediaRequiredTypes.includes(messageType) && !mediaUrl) {
        return res.status(400).json({ 
          error: `Media file is required for ${messageType} messages. Please upload a file before sending.` 
        });
      }

      // Verify channel belongs to user and is active - use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      if (channel.status !== "ACTIVE" || channel.authStatus !== "AUTHORIZED") {
        return res.status(400).json({ error: "Channel must be active and authorized" });
      }

      // Check if channel is expired
      if (channel.expiresAt && new Date(channel.expiresAt) <= new Date()) {
        return res.status(400).json({ 
          error: "Channel has expired. Please extend the channel before sending messages." 
        });
      }

      // Check if channel has a valid token
      if (!channel.whapiChannelToken) {
        return res.status(400).json({ 
          error: "Channel is not properly configured. Please contact support or re-authorize this channel." 
        });
      }

      // Get user's active subscription and plan limits
      const subscription = await storage.getActiveSubscriptionForUser(req.userId!);
      if (!subscription) {
        return res.status(400).json({ error: "No active subscription. Please subscribe to a plan." });
      }

      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(500).json({ error: "Plan not found" });
      }

      // Check daily single message limit (independent of bulk messages)
      // -1 means unlimited
      if (plan.dailyMessagesLimit !== -1) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaysJobs = await storage.getJobsForUser(req.userId!);
        const todaysSingleMessages = todaysJobs
          .filter(job => new Date(job.createdAt) >= today && job.type === "SINGLE")
          .reduce((sum, job) => sum + job.total, 0);

        if (todaysSingleMessages >= plan.dailyMessagesLimit) {
          return res.status(400).json({ 
            error: `Daily single message limit reached (${plan.dailyMessagesLimit}). Upgrade plan to send more.`,
            limitReached: true
          });
        }
      }

      // Create job
      const job = await storage.createJob({
        userId: req.userId!,
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
        replied: 0,
      });

      // Create message record
      const message = await storage.createMessage({
        jobId: job.id,
        to,
        header,
        body,
        footer,
        buttons: buttons || [],
        status: "PENDING",
        messageType: messageType || "text_buttons",
        mediaUrl: mediaUrl || null,
      });

      // Call WHAPI to send the message
      try {
        let whapiResponse;
        const currentMessageType = messageType || "text_buttons";
        
        // Resolve media URL (convert local paths to base64)
        const resolvedMediaUrl = await resolveMediaForWhapi(mediaUrl);

        // Handle different message types
        if (currentMessageType === "text_buttons") {
          // Text with buttons
          const whapiPayload = {
            to,
            type: "button",
            ...(header && { header: { text: header } }),
            body: { text: body },
            ...(footer && { footer: { text: footer } }),
            action: {
              buttons: (buttons || []).map((btn: any) => ({
                type: btn.type || "quick_reply",
                title: btn.text || btn.title || btn,
                id: btn.id || `btn${Math.random().toString(36).substr(2, 9)}`,
                ...(btn.type === "url" && btn.value && { url: btn.value }),
                ...(btn.type === "call" && btn.value && { phone_number: btn.value })
              }))
            }
          };
          whapiResponse = await whapi.sendInteractiveMessage(channel.whapiChannelToken!, whapiPayload);
          
        } else if (currentMessageType === "image") {
          // Image only (no buttons)
          whapiResponse = await whapi.sendMediaMessage(channel.whapiChannelToken!, {
            to,
            media: resolvedMediaUrl || "",
            caption: body,
            mediaType: "Image",
          });
          
        } else if (currentMessageType === "image_buttons") {
          // Image with buttons - media at ROOT level per WHAPI docs
          const imageButtonPayload = {
            to,
            type: "button",
            ...(resolvedMediaUrl && { media: resolvedMediaUrl }), // Media at root level!
            body: { text: body },
            ...(footer && { footer: { text: footer } }),
            action: {
              buttons: (buttons || []).map((btn: any) => ({
                type: btn.type || "quick_reply",
                title: btn.text || btn.title || btn,
                id: btn.id || `btn${Math.random().toString(36).substr(2, 9)}`,
                ...(btn.type === "url" && btn.value && { url: btn.value }),
                ...(btn.type === "call" && btn.value && { phone_number: btn.value })
              }))
            }
          };
          console.log(`[Single Send] image_buttons with media at root level`);
          whapiResponse = await whapi.sendInteractiveMessage(channel.whapiChannelToken!, imageButtonPayload);
          
        } else if (currentMessageType === "video_buttons") {
          // Video with buttons - media at ROOT level per WHAPI docs
          const videoButtonPayload = {
            to,
            type: "button",
            ...(resolvedMediaUrl && { media: resolvedMediaUrl }), // Media at root level!
            body: { text: body },
            ...(footer && { footer: { text: footer } }),
            action: {
              buttons: (buttons || []).map((btn: any) => ({
                type: btn.type || "quick_reply",
                title: btn.text || btn.title || btn,
                id: btn.id || `btn${Math.random().toString(36).substr(2, 9)}`,
                ...(btn.type === "url" && btn.value && { url: btn.value }),
                ...(btn.type === "call" && btn.value && { phone_number: btn.value })
              }))
            }
          };
          console.log(`[Single Send] video_buttons with media at root level`);
          whapiResponse = await whapi.sendInteractiveMessage(channel.whapiChannelToken!, videoButtonPayload);
          
        } else if (currentMessageType === "document") {
          // Document (no buttons)
          whapiResponse = await whapi.sendMediaMessage(channel.whapiChannelToken!, {
            to,
            media: resolvedMediaUrl || "",
            caption: body,
            mediaType: "Document",
          });
        }

        // Extract provider message ID from WHAPI response
        // WHAPI can return different structures:
        // - Bulk/Interactive: { sent: true, messages: [{ id: "..." }] }
        // - Simple text: { sent: true, message: { id: "..." } }
        // - Legacy: { sent: true, id: "..." }
        const providerMessageId = whapiResponse.messages?.[0]?.id || whapiResponse.message?.id || whapiResponse.id || whapiResponse.message_id;
        
        console.log(`[Single Send] Message to ${to}:`);
        console.log(`[Single Send] Full WHAPI response:`, JSON.stringify(whapiResponse, null, 2));
        console.log(`[Single Send] Provider ID extracted: ${providerMessageId || 'MISSING'}`);
        
        if (!providerMessageId) {
          console.error(`[Single Send] ERROR: No provider message ID found in response!`);
          console.error(`[Single Send] Response keys:`, Object.keys(whapiResponse));
        }

        // Update message with provider ID and status
        await storage.updateMessage(message.id, {
          providerMessageId,
          status: "SENT",
        });
        
        console.log(`[Send] Updated message ${message.id} with providerMessageId: ${providerMessageId}`);

        // Update job counters and status
        await storage.updateJob(job.id, {
          status: "COMPLETED",
          pending: 0,
          sent: 1,
        });

        await storage.createAuditLog({
          actorUserId: req.userId!,
          action: "SEND_MESSAGE",
          meta: {
            entity: "job",
            entityId: job.id,
            messageId: message.id,
            to,
            providerMessageId: whapiResponse.id || whapiResponse.message_id
          },
        });

        res.json({ job, message, success: true });

      } catch (whapiError: any) {
        console.error("Message send error:", whapiError);
        
        // Extract error message - handle both string errors and complex objects
        let errorMessage = "Failed to send message";
        if (whapiError.message) {
          errorMessage = typeof whapiError.message === "string" 
            ? whapiError.message 
            : JSON.stringify(whapiError.message);
        } else if (whapiError.error) {
          errorMessage = typeof whapiError.error === "string" 
            ? whapiError.error 
            : JSON.stringify(whapiError.error);
        } else if (typeof whapiError === "string") {
          errorMessage = whapiError;
        }
        
        // Update message status to failed
        await storage.updateMessage(message.id, {
          status: "FAILED",
          error: errorMessage
        });

        // Update job counters and status
        await storage.updateJob(job.id, {
          status: "FAILED",
          pending: 0,
          failed: 1,
        });

        return res.status(500).json({ 
          error: "Failed to send message. Please try again later.",
          details: errorMessage 
        });
      }

    } catch (error: any) {
      console.error("Send message error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Send bulk messages with controlled speed
  app.post("/api/messages/bulk", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { channelId, rows } = req.body;

      if (!channelId || !rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "channelId and rows are required" });
      }

      // Check user status
      const user = await storage.getUser(req.userId!);
      if (!user || user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }

      // Check channel - use effective user ID for impersonation support
      const effectiveUserId = req.impersonatedUser?.id || req.userId!;
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== effectiveUserId || channel.status !== "ACTIVE") {
        return res.status(403).json({ error: "Channel not available" });
      }

      // Check if channel has a valid token
      if (!channel.whapiChannelToken) {
        return res.status(400).json({ 
          error: "Channel is not properly configured. Please contact support or re-authorize this channel." 
        });
      }

      // Check subscription and bulk message limit
      const subscription = await storage.getActiveSubscriptionForUser(req.userId!);
      if (!subscription) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Check for existing running bulk job (only one at a time per user)
      const existingJobs = await storage.getJobsForUser(req.userId!);
      const runningJob = existingJobs.find(j => 
        j.type === "BULK" && 
        (j.status === "PROCESSING" || j.status === "QUEUED" || j.status === "PENDING")
      );
      if (runningJob) {
        return res.status(409).json({ 
          error: "You already have a running bulk campaign. Please wait for it to complete or stop it before starting a new one.",
          runningJobId: runningJob.id
        });
      }

      // Check bulk batch size limit (-1 means unlimited)
      if (plan.bulkMessagesLimit !== -1 && rows.length > plan.bulkMessagesLimit) {
        return res.status(403).json({ 
          error: `Bulk message limit is ${plan.bulkMessagesLimit} messages per batch` 
        });
      }

      // Check daily bulk message limit (independent of single messages)
      // -1 means unlimited
      if (plan.bulkMessagesLimit !== -1) {
        const jobs = await storage.getJobsForUser(req.userId!);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bulkMessagesToday = jobs
          .filter(j => new Date(j.createdAt) >= today && j.type === "BULK")
          .reduce((sum, j) => sum + j.total, 0);

        if (bulkMessagesToday + rows.length > plan.bulkMessagesLimit) {
          return res.status(403).json({ 
            error: `Daily bulk message limit would be exceeded. Today: ${bulkMessagesToday}/${plan.bulkMessagesLimit}` 
          });
        }
      }

      // Create job
      const job = await storage.createJob({
        userId: req.userId!,
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
        replied: 0,
      });

      // Create messages with enhanced data
      for (const row of rows) {
        const buttons = [];
        // Use user-provided button IDs if available, otherwise auto-generate
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
          buttons: normalizeButtons(buttons),
          status: "QUEUED",
        });
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "SEND_BULK",
        meta: {
          entity: "job",
          entityId: job.id,
          type: "BULK",
          count: rows.length
        },
      });

      // Start background processing with controlled delays
      processBulkJob(job.id, channel).catch(err => {
        console.error(`Bulk job ${job.id} processing error:`, err);
      });

      res.json(job);
    } catch (error: any) {
      console.error("Bulk send error:", error);
      res.status(500).json({ error: "Failed to send bulk messages" });
    }
  });

  // Background processing for bulk jobs with controlled delays
  async function processBulkJob(jobId: number, channel: any) {
    try {
      // Get speed settings
      const minDelaySetting = await storage.getSetting("bulk_send_min_delay");
      const maxDelaySetting = await storage.getSetting("bulk_send_max_delay");
      const minDelay = parseInt(minDelaySetting?.value || "10") * 1000; // Convert to ms
      const maxDelay = parseInt(maxDelaySetting?.value || "20") * 1000; // Convert to ms

      // Get all queued messages for this job
      const messages = await storage.getMessagesForJob(jobId);
      const queuedMessages = messages.filter(m => m.status === "QUEUED");

      if (queuedMessages.length === 0) {
        await storage.updateJob(jobId, { status: "COMPLETED" });
        return;
      }

      // Update job status to processing
      await storage.updateJob(jobId, { status: "PROCESSING" });

      // Track accurate counters instead of filtering stale array
      let queuedCount = queuedMessages.length;
      let pendingCount = 0;
      let sentCount = messages.filter(m => m.status === "SENT").length;
      let failedCount = messages.filter(m => m.status === "FAILED").length;

      // Process messages one by one with random delays
      for (const message of queuedMessages) {
        // Check if job was paused
        const currentJob = await storage.getJob(jobId);
        if (!currentJob || currentJob.status === "PAUSED") {
          console.log(`[Job ${jobId}] Job was paused, stopping processing`);
          return;
        }
        
        // Check daily bulk message limit during processing
        const job = await storage.getJob(jobId);
        if (job) {
          const user = await storage.getUser(job.userId);
          if (user) {
            const subscription = await storage.getActiveSubscriptionForUser(job.userId);
            if (subscription) {
              const plan = await storage.getPlan(subscription.planId);
              if (plan && plan.bulkMessagesLimit !== -1) {
                const jobs = await storage.getJobsForUser(job.userId);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const bulkMessagesSentToday = jobs
                  .filter(j => new Date(j.createdAt) >= today && j.type === "BULK")
                  .reduce((sum, j) => sum + j.sent + j.delivered + j.read, 0);
                
                if (bulkMessagesSentToday >= plan.bulkMessagesLimit) {
                  console.log(`[Job ${jobId}] Daily bulk limit reached (${bulkMessagesSentToday}/${plan.bulkMessagesLimit}), pausing job`);
                  await storage.updateJob(jobId, { status: "PAUSED" });
                  return;
                }
              }
            }
          }
        }
        
        try {
          console.log(`[Bulk Send] Processing message ${message.id} to ${message.to}`);
          console.log(`[Bulk Send] Raw message data:`, JSON.stringify({
            id: message.id,
            messageType: message.messageType,
            buttons: message.buttons,
            body: message.body?.substring(0, 50),
            mediaUrl: message.mediaUrl,
          }, null, 2));
          
          // Update message to pending
          await storage.updateMessage(message.id, { status: "PENDING" });
          queuedCount--;
          pendingCount++;
          await storage.updateJob(jobId, { queued: queuedCount, pending: pendingCount });

          // Get message type and buttons
          const messageType = message.messageType || "text_buttons";
          
          // Parse buttons - they might be JSON string or already an array
          let buttons: any[] = [];
          try {
            if (message.buttons) {
              if (typeof message.buttons === 'string') {
                try {
                  buttons = JSON.parse(message.buttons);
                  console.log(`[Bulk Send] Parsed buttons from JSON string: ${buttons.length} buttons`);
                } catch (parseErr) {
                  console.warn(`[Bulk Send] Failed to parse buttons as JSON, treating as empty:`, message.buttons);
                  buttons = [];
                }
              } else if (Array.isArray(message.buttons)) {
                buttons = message.buttons;
                console.log(`[Bulk Send] Buttons already array: ${buttons.length} buttons`);
              }
            }
            
            console.log(`[Bulk Send] Raw buttons before transform:`, JSON.stringify(buttons.slice(0, 1), null, 2));
            
            // Transform buttons: map "text" field to "title" for WHAPI compatibility
            // WHAPI expects "title", but buttons are stored with "text" field
            buttons = buttons.map((btn: any) => {
              const transformed: any = {
                id: btn.id,
                type: btn.type,
              };
              // Use "title" if it exists, otherwise use "text" and rename it
              if (btn.title) {
                transformed.title = btn.title;
              } else if (btn.text) {
                transformed.title = btn.text;  // Map "text" to "title" for WHAPI
              }
              // Include optional fields for button types that need them
              if (btn.phone_number) transformed.phone_number = btn.phone_number;
              if (btn.url) transformed.url = btn.url;
              if (btn.copy_code) transformed.copy_code = btn.copy_code;
              return transformed;
            });
            
            console.log(`[Bulk Send] Transformed buttons:`, JSON.stringify(buttons.slice(0, 1), null, 2));
            console.log(`[Bulk Send] Message type: ${messageType}, buttons count: ${buttons.length}`);
          } catch (btnErr: any) {
            console.error(`[Bulk Send] ERROR transforming buttons:`, btnErr?.message || btnErr);
            throw new Error(`Failed to process buttons: ${btnErr?.message || 'Unknown error'}`);
          }
          
          // Resolve media URL (convert local paths to base64)
          const resolvedMediaUrl = await resolveMediaForWhapi(message.mediaUrl);

          // Send message via WHAPI based on message type
          let result;
          
          switch (messageType) {
            case "image":
              // Send image without buttons
              result = await whapi.sendMediaMessage(channel.whapiChannelToken, {
                to: message.to,
                media: resolvedMediaUrl || "",
                caption: message.body || "",
                mediaType: "Image",
              });
              break;
              
            case "image_buttons": {
              // Send image with buttons - media at ROOT level per WHAPI docs
              const imgPayload = {
                to: message.to,
                type: "button",
                ...(resolvedMediaUrl && { media: resolvedMediaUrl }), // Media at root level!
                body: { text: message.body || "No message" },
                footer: message.footer ? { text: message.footer } : undefined,
                action: { buttons },
              };
              console.log(`[Bulk Send] image_buttons payload:`, JSON.stringify(imgPayload, null, 2));
              result = await whapi.sendInteractiveMessage(channel.whapiChannelToken, imgPayload);
              break;
            }
              
            case "video_buttons": {
              // Send video with buttons - media at ROOT level per WHAPI docs
              const vidPayload = {
                to: message.to,
                type: "button",
                ...(resolvedMediaUrl && { media: resolvedMediaUrl }), // Media at root level!
                body: { text: message.body || "No message" },
                footer: message.footer ? { text: message.footer } : undefined,
                action: { buttons },
              };
              console.log(`[Bulk Send] video_buttons payload:`, JSON.stringify(vidPayload, null, 2));
              result = await whapi.sendInteractiveMessage(channel.whapiChannelToken, vidPayload);
              break;
            }
              
            case "document":
              // Send document file
              result = await whapi.sendMediaMessage(channel.whapiChannelToken, {
                to: message.to,
                media: resolvedMediaUrl || "",
                caption: message.body || "",
                mediaType: "Document",
              });
              break;
              
            case "text_buttons":
            default:
              // Send text with buttons or simple text
              if (buttons.length > 0) {
                // Send interactive message with buttons
                const txtButtonPayload = {
                  to: message.to,
                  type: "button",
                  header: message.header ? { text: message.header } : undefined,
                  body: { text: message.body || "No message" },
                  footer: message.footer ? { text: message.footer } : undefined,
                  action: { buttons },
                };
                console.log(`[Bulk Send] text_buttons payload for ${message.to}:`, JSON.stringify(txtButtonPayload, null, 2));
                console.log(`[Bulk Send] Buttons array type:`, Array.isArray(buttons), `length: ${buttons.length}`);
                console.log(`[Bulk Send] First button:`, buttons[0] ? JSON.stringify(buttons[0]) : "NO BUTTONS");
                result = await whapi.sendInteractiveMessage(channel.whapiChannelToken, txtButtonPayload);
              } else {
                // Send simple text message
                result = await whapi.sendTextMessage(channel.whapiChannelToken, {
                  to: message.to,
                  body: message.body || "No message",
                });
              }
              break;
          }

          console.log(`[Bulk Send] WHAPI result status:`, {
            resultExists: !!result,
            resultSent: result?.sent,
            resultError: result?.error,
            resultMessage: result?.message,
          });
          
          if (result && result.sent) {
            // Extract provider message ID from WHAPI response
            // WHAPI can return different structures:
            // - Bulk/Interactive: { sent: true, messages: [{ id: "..." }] }
            // - Simple text: { sent: true, message: { id: "..." } }
            // - Legacy: { sent: true, id: "..." }
            const providerMessageId = result.messages?.[0]?.id || result.message?.id || result.id || result.message_id;
            
            console.log(`[Bulk Send] SUCCESS - Message ${message.id} to ${message.to}:`);
            console.log(`[Bulk Send] Full WHAPI response:`, JSON.stringify(result, null, 2));
            console.log(`[Bulk Send] Provider ID extracted: ${providerMessageId || 'MISSING'}`);
            
            if (!providerMessageId) {
              console.error(`[Bulk Send] ERROR: No provider message ID found in response!`);
              console.error(`[Bulk Send] Response keys:`, Object.keys(result));
            }
            
            await storage.updateMessage(message.id, { 
              status: "SENT",
              providerMessageId,
              sentAt: new Date(),
            });
            pendingCount--;
            sentCount++;
            await storage.updateJob(jobId, { pending: pendingCount, sent: sentCount });
          } else {
            // Message send failed - log full response for debugging
            console.error(`[Bulk Send] FAILED - Message ${message.id} to ${message.to}`);
            console.error(`[Bulk Send] Full WHAPI result:`, JSON.stringify(result, null, 2));
            
            // Properly extract error message from WHAPI response
            let errorMessage = "Failed to send";
            if (result?.message) {
              errorMessage = typeof result.message === "string" 
                ? result.message 
                : JSON.stringify(result.message);
            } else if (result?.error) {
              errorMessage = typeof result.error === "string" 
                ? result.error 
                : JSON.stringify(result.error);
            } else if (result === undefined) {
              errorMessage = "WHAPI returned undefined";
            } else if (result === null) {
              errorMessage = "WHAPI returned null";
            } else {
              errorMessage = `WHAPI returned unexpected result: ${JSON.stringify(result)}`;
            }
            throw new Error(errorMessage);
          }

          // Random delay before next message (unless it's the last one)
          if (message.id !== queuedMessages[queuedMessages.length - 1].id) {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (msgError: any) {
          console.error(`[Bulk Send] EXCEPTION - Failed to send message ${message.id}:`, msgError);
          console.error(`[Bulk Send] Error type:`, typeof msgError);
          console.error(`[Bulk Send] Error keys:`, Object.keys(msgError || {}));
          console.error(`[Bulk Send] Full error object:`, JSON.stringify(msgError, null, 2).substring(0, 500));
          
          // Extract error message - handle all error types properly
          let errorMessage = "Unknown error";
          
          // Try multiple ways to extract a meaningful error message
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
          
          // Safety check: ensure it's not [object Object]
          if (errorMessage === "[object Object]") {
            errorMessage = `Error (${typeof msgError}): ${Object.keys(msgError || {}).join(", ")}`;
          }
          
          console.error(`[Bulk Send] Extracted error message: ${errorMessage}`);
          
          await storage.updateMessage(message.id, { 
            status: "FAILED",
            error: errorMessage,
          });
          pendingCount--;
          failedCount++;
          await storage.updateJob(jobId, { pending: pendingCount, failed: failedCount });
        }
      }

      // Mark job as completed
      await storage.updateJob(jobId, { status: "COMPLETED" });
    } catch (error: any) {
      console.error(`Bulk job ${jobId} processing error:`, error);
      await storage.updateJob(jobId, { status: "FAILED" });
    }
  }

  // ============================================================================
  // JOBS
  // ============================================================================

  // Get user jobs
  app.get("/api/jobs", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobs = await storage.getJobsForUser(effectiveUserId);
      res.json(jobs);
    } catch (error: any) {
      console.error("Get jobs error:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });


  // ============================================================================
  // TEMPLATES
  // ============================================================================

  // Helper function to convert media upload to URL
  const getMediaUrl = (mediaUpload: any): string | null => {
    if (!mediaUpload) return null;
    
    // For locally stored files, return the file path
    if (mediaUpload.whapiMediaId?.startsWith('local-') && mediaUpload.fileName) {
      return `/uploads/${mediaUpload.fileName}`;
    }
    
    // For WHAPI-hosted media, return the media ID
    return mediaUpload.whapiMediaId || null;
  };

  // Helper function to resolve media URL for WHAPI
  // Converts local file paths to base64 data that WHAPI can use
  const resolveMediaForWhapi = async (mediaUrl: string | null): Promise<string | null> => {
    if (!mediaUrl) return null;
    
    // If it's already base64 data, return as-is
    if (mediaUrl.startsWith('data:')) {
      return mediaUrl;
    }
    
    // If it's a local file path (starts with /uploads/), read and convert to base64
    if (mediaUrl.startsWith('/uploads/')) {
      try {
        const fileName = mediaUrl.replace('/uploads/', '');
        const filePath = path.join(process.cwd(), 'uploads', fileName);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          console.error(`[Media Resolver] File not found: ${filePath}`);
          return null;
        }
        
        // Read file and convert to base64
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');
        
        // Detect MIME type from file extension
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.mp4': 'video/mp4',
          '.mpeg': 'video/mpeg',
          '.mov': 'video/quicktime',
          '.avi': 'video/x-msvideo',
          '.pdf': 'application/pdf',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        
        console.log(`[Media Resolver] Converted local file ${fileName} to base64 (${(base64Data.length / 1024).toFixed(2)}KB)`);
        return dataUrl;
      } catch (error) {
        console.error(`[Media Resolver] Error reading file:`, error);
        return null;
      }
    }
    
    // Otherwise, assume it's a URL or WHAPI media ID
    return mediaUrl;
  };

  // Get templates
  app.get("/api/templates", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const templates = await storage.getTemplatesForUser(effectiveUserId);
      
      // Resolve media URLs for templates with media uploads
      const templatesWithMedia = await Promise.all(
        templates.map(async (template) => {
          if (template.mediaUploadId) {
            const mediaUpload = await storage.getMediaUpload(template.mediaUploadId);
            return {
              ...template,
              mediaUrl: getMediaUrl(mediaUpload),
              mediaUploadId: template.mediaUploadId, // Keep the ID for editing
            };
          }
          return { ...template, mediaUrl: null };
        })
      );
      
      res.json(templatesWithMedia);
    } catch (error: any) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Create template
  app.post("/api/templates", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      // Validate request body
      const validationResult = insertTemplateSchema.extend({ userId: z.number() }).safeParse({
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

      // Validate media upload ownership if provided
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
        mediaUploadId: mediaUploadId || null,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CREATE",
        meta: {
          entity: "template",
          entityId: template.id,
          title
        },
      });

      // Resolve media URL if present
      let responseTemplate = { ...template, mediaUrl: null as string | null };
      if (template.mediaUploadId) {
        const mediaUpload = await storage.getMediaUpload(template.mediaUploadId);
        responseTemplate.mediaUrl = getMediaUrl(mediaUpload);
      }

      res.json(responseTemplate);
    } catch (error: any) {
      console.error("Create template error:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // Update template
  app.put("/api/templates/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getTemplate(templateId);

      if (!template || template.userId !== req.userId!) {
        return res.status(404).json({ error: "Template not found" });
      }

      const { title, header, body, footer, buttons, messageType, mediaUploadId } = req.body;
      
      // Validate media upload ownership if provided
      if (mediaUploadId !== undefined && mediaUploadId !== null) {
        const mediaUpload = await storage.getMediaUpload(mediaUploadId);
        if (!mediaUpload || mediaUpload.userId !== req.userId!) {
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
        mediaUploadId,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE",
        meta: {
          entity: "template",
          entityId: templateId,
          title
        },
      });

      // Resolve media URL if present
      let responseTemplate = { ...updated, mediaUrl: null as string | null };
      if (updated?.mediaUploadId) {
        const mediaUpload = await storage.getMediaUpload(updated.mediaUploadId);
        responseTemplate.mediaUrl = getMediaUrl(mediaUpload);
      }

      res.json(responseTemplate);
    } catch (error: any) {
      console.error("Update template error:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // Delete template
  app.delete("/api/templates/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getTemplate(templateId);

      if (!template || template.userId !== req.userId!) {
        return res.status(404).json({ error: "Template not found" });
      }

      await storage.deleteTemplate(templateId);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "DELETE",
        meta: {
          entity: "template",
          entityId: templateId,
          title: template.title
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete template error:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ============================================================================
  // PHONEBOOKS
  // ============================================================================

  // Get phonebooks
  app.get("/api/phonebooks", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebooks = await storage.getPhonebooksForUser(effectiveUserId);
      
      // Include contact count for each phonebook
      const phonebooksWithCount = await Promise.all(
        phonebooks.map(async (phonebook) => {
          const contacts = await storage.getContactsForPhonebook(phonebook.id);
          return {
            ...phonebook,
            contactCount: contacts.length,
          };
        })
      );
      
      res.json(phonebooksWithCount);
    } catch (error: any) {
      console.error("Get phonebooks error:", error);
      res.status(500).json({ error: "Failed to fetch phonebooks" });
    }
  });

  // Get sample CSV template (must be before :id route)
  app.get("/api/phonebooks/sample-csv", requireAuth, async (req: AuthRequest, res: Response) => {
    const sampleCSV = `phone_number,name,email,header,body,footer,button1_text,button2_text,button3_text,button1_id,button2_id,button3_id
+97312345678,John Doe,john@example.com,Hello!,This is a test message,Thank you,Option 1,Option 2,Option 3,btn1_custom,btn2_custom,btn3_custom
+97398765432,Jane Smith,jane@example.com,,Simple message without header/footer,,,,,,,`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="phonebook-contacts-sample.csv"');
    res.send(sampleCSV);
  });

  // Get single phonebook with contacts
  app.get("/api/phonebooks/:id", requireAuth, async (req: AuthRequest, res: Response) => {
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
        contacts,
      });
    } catch (error: any) {
      console.error("Get phonebook error:", error);
      res.status(500).json({ error: "Failed to fetch phonebook" });
    }
  });

  // Create phonebook
  app.post("/api/phonebooks", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { name, description } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Phonebook name is required" });
      }

      const phonebook = await storage.createPhonebook({
        userId: effectiveUserId,
        name: name.trim(),
        description: description || null,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CREATE",
        meta: {
          entity: "phonebook",
          entityId: phonebook.id,
          name
        },
      });

      res.json(phonebook);
    } catch (error: any) {
      console.error("Create phonebook error:", error);
      res.status(500).json({ error: "Failed to create phonebook" });
    }
  });

  // Update phonebook
  app.put("/api/phonebooks/:id", requireAuth, async (req: AuthRequest, res: Response) => {
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
        description,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE",
        meta: {
          entity: "phonebook",
          entityId: phonebookId,
          name
        },
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Update phonebook error:", error);
      res.status(500).json({ error: "Failed to update phonebook" });
    }
  });

  // Delete phonebook
  app.delete("/api/phonebooks/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);

      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      await storage.deletePhonebook(phonebookId);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "DELETE",
        meta: {
          entity: "phonebook",
          entityId: phonebookId,
          name: phonebook.name
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete phonebook error:", error);
      res.status(500).json({ error: "Failed to delete phonebook" });
    }
  });

  // ============================================================================
  // PHONEBOOK CONTACTS
  // ============================================================================

  // Get contacts for a phonebook
  app.get("/api/phonebooks/:id/contacts", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);

      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      const contacts = await storage.getContactsForPhonebook(phonebookId);
      res.json(contacts);
    } catch (error: any) {
      console.error("Get contacts error:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Create contact
  app.post("/api/phonebooks/:id/contacts", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);

      if (!phonebook || phonebook.userId !== req.userId!) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      // Check phonebook limit
      const limit = await getPhonebookLimit(req.userId!);
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
        button3Id,
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
        button3Id: button3Id || null,
      });

      res.json(contact);
    } catch (error: any) {
      console.error("Create contact error:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  // Update contact
  app.put("/api/contacts/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId);

      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }

      // Verify ownership through phonebook
      const phonebook = await storage.getPhonebook(contact.phonebookId);
      if (!phonebook || phonebook.userId !== req.userId!) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateContact(contactId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Update contact error:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // Delete contact
  app.delete("/api/contacts/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId);

      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }

      // Verify ownership through phonebook
      const phonebook = await storage.getPhonebook(contact.phonebookId);
      if (!phonebook || phonebook.userId !== req.userId!) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteContact(contactId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete contact error:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // ============================================================================
  // MEDIA UPLOADS
  // ============================================================================

  // Upload media - Local storage only (instant)
  app.post("/api/media/upload", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { file, fileType, fileName } = req.body;

      if (!file || !fileType) {
        return res.status(400).json({ error: "File data and fileType are required" });
      }

      // Get user's plan to check file size limits
      const subscription = await storage.getActiveSubscriptionForUser(req.userId!);
      if (!subscription) {
        return res.status(403).json({ error: "No active subscription" });
      }

      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(403).json({ error: "Plan not found" });
      }

      // Parse base64 file and check size
      const base64Data = file.split(',')[1] || file;
      const buffer = Buffer.from(base64Data, 'base64');
      const fileSizeMB = buffer.length / (1024 * 1024);

      // Check against plan limits
      let maxAllowed = 5; // Default
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

      // Save locally for backup
      const mimeMatch = file.match(/^data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      
      const extensionMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/mpeg': 'mpeg',
        'video/quicktime': 'mov',
        'video/x-msvideo': 'avi',
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      };

      const extension = extensionMap[mimeType] || 'bin';
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const timestamp = Date.now();
      const generatedFileName = `${timestamp}-${uniqueId}.${extension}`;
      
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, generatedFileName);
      fs.writeFileSync(filePath, buffer);

      // Store upload record
      const mediaId = `local-${uniqueId}`;
      const mediaUpload = await storage.createMediaUpload({
        userId: req.userId!,
        whapiMediaId: mediaId,
        fileName: fileName || generatedFileName,
        fileType: fileType,
        fileSizeMB: Math.round(fileSizeMB),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      console.log(`[Media Upload] Saved ${generatedFileName} (${fileSizeMB.toFixed(2)}MB) for user ${req.userId}`);

      // Return the database ID and original base64 data URL for inline sending
      res.json({ 
        id: mediaUpload.id, // Database record ID for mediaUploadId
        mediaId: mediaId,
        url: file, // Return original base64 data URL for inline sending
        fileName: generatedFileName,
        fileSizeMB: fileSizeMB.toFixed(2),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
    } catch (error: any) {
      console.error("Media upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload media" });
    }
  });

  // ============================================================================
  // SEND TO PHONEBOOK
  // ============================================================================

  // Send messages to all contacts in a phonebook
  app.post("/api/phonebooks/:id/send", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const { channelId } = req.body;

      if (!channelId) {
        return res.status(400).json({ error: "Channel ID is required" });
      }

      // Verify phonebook ownership
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      // Verify channel ownership
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(403).json({ error: "Channel not found or access denied" });
      }

      // Check for existing running bulk job (only one at a time per user)
      const existingJobs = await storage.getJobsForUser(effectiveUserId);
      const runningJob = existingJobs.find(j => 
        j.type === "BULK" && 
        (j.status === "PROCESSING" || j.status === "QUEUED" || j.status === "PENDING")
      );
      if (runningJob) {
        return res.status(409).json({ 
          error: "You already have a running bulk campaign. Please wait for it to complete or stop it before starting a new one.",
          runningJobId: runningJob.id
        });
      }

      // Get all contacts
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      if (contacts.length === 0) {
        return res.status(400).json({ error: "Phonebook has no contacts" });
      }

      // Create job
      const job = await storage.createJob({
        userId: effectiveUserId,
        channelId: channelId,
        type: "BULK",
        status: "PENDING",
        total: contacts.length,
        queued: contacts.length,
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replied: 0,
      });

      // Create messages for each contact
      for (const contact of contacts) {
        // Build buttons array
        const buttons: any[] = [];
        
        if (contact.button1Text) {
          const button: any = {
            type: contact.button1Type || "quick_reply",
            title: contact.button1Text,
            id: contact.button1Id || `btn1_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          
          if (contact.button1Type === "url" && contact.button1Value) {
            button.url = contact.button1Value;
          } else if (contact.button1Type === "call" && contact.button1Value) {
            button.phone = contact.button1Value;
          }
          
          buttons.push(button);
        }
        
        if (contact.button2Text) {
          const button: any = {
            type: contact.button2Type || "quick_reply",
            title: contact.button2Text,
            id: contact.button2Id || `btn2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          
          if (contact.button2Type === "url" && contact.button2Value) {
            button.url = contact.button2Value;
          } else if (contact.button2Type === "call" && contact.button2Value) {
            button.phone = contact.button2Value;
          }
          
          buttons.push(button);
        }
        
        if (contact.button3Text) {
          const button: any = {
            type: contact.button3Type || "quick_reply",
            title: contact.button3Text,
            id: contact.button3Id || `btn3_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          
          if (contact.button3Type === "url" && contact.button3Value) {
            button.url = contact.button3Value;
          } else if (contact.button3Type === "call" && contact.button3Value) {
            button.phone = contact.button3Value;
          }
          
          buttons.push(button);
        }

        // Create message
        await storage.createMessage({
          jobId: job.id,
          to: contact.phone,
          name: contact.name,
          email: contact.email || null,
          body: contact.body,
          header: contact.header || null,
          footer: contact.footer || null,
          buttons: normalizeButtons(buttons),
          status: "QUEUED",
          messageType: contact.messageType,
          mediaUrl: contact.mediaUrl || null,
        });
      }

      // Start processing the job (trigger processBulkJob)
      processBulkJob(job.id, channel);

      res.json(job);
    } catch (error: any) {
      console.error("Send to phonebook error:", error);
      res.status(500).json({ error: "Failed to send messages" });
    }
  });

  // Send uniform message to all contacts in phonebook
  app.post("/api/phonebooks/:id/send-uniform", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const phonebookId = parseInt(req.params.id);
      const { channelId, header, body, footer, buttons, messageType, mediaUrl } = req.body;

      console.log(`[Send Uniform] Received buttons from frontend:`, JSON.stringify(buttons && Array.isArray(buttons) ? buttons.slice(0, 1) : buttons, null, 2));
      
      if (!channelId || !body) {
        return res.status(400).json({ error: "Channel ID and message body are required" });
      }

      // Validate media for media message types
      const mediaRequiredTypes = ["image", "image_buttons", "video_buttons", "document"];
      if (mediaRequiredTypes.includes(messageType) && !mediaUrl) {
        return res.status(400).json({ 
          error: `Media file is required for ${messageType} messages. Please upload a file before sending.` 
        });
      }

      // Verify phonebook ownership
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      // Verify channel ownership
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(403).json({ error: "Channel not found or access denied" });
      }

      // Check for existing running bulk job (only one at a time per user)
      const existingJobs = await storage.getJobsForUser(effectiveUserId);
      const runningJob = existingJobs.find(j => 
        j.type === "BULK" && 
        (j.status === "PROCESSING" || j.status === "QUEUED" || j.status === "PENDING")
      );
      if (runningJob) {
        return res.status(409).json({ 
          error: "You already have a running bulk campaign. Please wait for it to complete or stop it before starting a new one.",
          runningJobId: runningJob.id
        });
      }

      // Get all contacts
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      if (contacts.length === 0) {
        return res.status(400).json({ error: "Phonebook has no contacts" });
      }

      // Validate and normalize buttons through schema
      let normalizedButtons: any[] = [];
      if (buttons && Array.isArray(buttons)) {
        try {
          normalizedButtons = z.array(buttonSchema).parse(buttons);
          console.log(`[Send Uniform] Buttons normalized via schema:`, JSON.stringify(normalizedButtons, null, 2));
        } catch (error: any) {
          console.error(`[Send Uniform] Button validation error:`, error.message);
          return res.status(400).json({ error: `Invalid button format: ${error.message}` });
        }
      }

      // Create job
      const job = await storage.createJob({
        userId: effectiveUserId,
        channelId: channelId,
        type: "BULK",
        status: "PENDING",
        total: contacts.length,
        queued: contacts.length,
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replied: 0,
      });

      // Create messages for each contact with the same message content
      for (const contact of contacts) {
        await storage.createMessage({
          jobId: job.id,
          to: contact.phone,
          name: contact.name,
          email: contact.email || null,
          body: body,
          header: header || null,
          footer: footer || null,
          buttons: normalizeButtons(normalizedButtons),
          status: "QUEUED",
          messageType: messageType || "text_buttons",
          mediaUrl: mediaUrl || null,
        });
      }

      // Start processing the job
      processBulkJob(job.id, channel);

      res.json(job);
    } catch (error: any) {
      console.error("Send uniform message error:", error);
      res.status(500).json({ error: "Failed to send messages" });
    }
  });

  // Import contacts from CSV
  app.post("/api/phonebooks/:id/import-csv", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const phonebookId = parseInt(req.params.id);
      const { csvData } = req.body;

      if (!csvData || typeof csvData !== 'string') {
        return res.status(400).json({ error: "CSV data is required" });
      }

      // Verify phonebook ownership
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== req.userId!) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      // Check phonebook limit before parsing
      const limit = await getPhonebookLimit(req.userId!);
      const currentContacts = await storage.getContactsForPhonebook(phonebookId);

      // Parse CSV data
      const Papa = await import('papaparse');
      const parsed = Papa.default.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      });

      const validContacts: any[] = [];
      const invalidRows: { row: number; errors: string[] }[] = [];

      // Process each row
      parsed.data.forEach((row: any, index: number) => {
        const rowNumber = index + 2; // +2 because index is 0-based and we skip header
        const errors: string[] = [];

        // Validate required fields
        if (!row.phone_number || typeof row.phone_number !== 'string' || row.phone_number.trim() === '') {
          errors.push("Phone number is required");
        } else {
          const phone = row.phone_number.trim();
          // Validate phone length (minimum 8 digits)
          if (phone.length < 8) {
            errors.push("Phone number is too short");
          }
          // Update the row with trimmed phone
          row.phone_number = phone;
        }

        // Name is optional but recommended
        const name = row.name?.trim() || row.phone_number?.trim() || 'Unknown';

        // Body is optional - use empty string if not provided
        const body = row.body?.trim() || '';

        if (errors.length > 0) {
          invalidRows.push({ row: rowNumber, errors });
        } else {
          // Generate button IDs if not provided
          const button1Id = row.button1_id?.trim() || 
            (row.button1_text ? `btn1_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null);
          const button2Id = row.button2_id?.trim() || 
            (row.button2_text ? `btn2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null);
          const button3Id = row.button3_id?.trim() || 
            (row.button3_text ? `btn3_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null);

          validContacts.push({
            phonebookId,
            phone: row.phone_number.trim(),
            name,
            email: row.email?.trim() || null,
            header: row.header?.trim() || null,
            body,
            footer: row.footer?.trim() || null,
            messageType: 'text_buttons', // Default for CSV import
            mediaUrl: null,
            button1Text: row.button1_text?.trim() || null,
            button1Type: 'quick_reply', // Default type
            button1Value: null,
            button1Id,
            button2Text: row.button2_text?.trim() || null,
            button2Type: 'quick_reply',
            button2Value: null,
            button2Id,
            button3Text: row.button3_text?.trim() || null,
            button3Type: 'quick_reply',
            button3Value: null,
            button3Id,
          });
        }
      });

      // Check phonebook limit and determine how many contacts can be imported
      let contactsToImport = validContacts;
      let limitWarning: string | undefined = undefined;
      let contactsSkipped = 0;

      if (limit !== null) {
        const availableSlots = limit - currentContacts.length;
        
        if (availableSlots <= 0) {
          // No slots available
          return res.status(400).json({ 
            error: `Your phonebook is full. Your plan allows a maximum of ${limit} contacts per phonebook and you currently have ${currentContacts.length} contacts.`
          });
        }
        
        if (validContacts.length > availableSlots) {
          // Trim the import to fit within the limit
          contactsToImport = validContacts.slice(0, availableSlots);
          contactsSkipped = validContacts.length - availableSlots;
          limitWarning = `Your plan allows a maximum of ${limit} contacts per phonebook. You currently have ${currentContacts.length} contacts. Only the first ${availableSlots} contact(s) from your CSV will be imported. ${contactsSkipped} contact(s) will be skipped.`;
          console.log(`[PhonebookLimit] Trimming CSV import: ${validContacts.length} valid rows, only importing ${availableSlots}, skipping ${contactsSkipped}`);
        }
      }

      // Insert contacts in batch (much faster than one-by-one for large imports)
      console.log(`[CSV Import] Starting batch insert of ${contactsToImport.length} contacts`);
      const insertedCount = await storage.createContactsBatch(contactsToImport);
      console.log(`[CSV Import] Batch insert completed: ${insertedCount} contacts inserted`);

      res.json({
        success: true,
        summary: {
          total: parsed.data.length,
          valid: validContacts.length,
          invalid: invalidRows.length,
          inserted: insertedCount,
          skipped: contactsSkipped,
        },
        limitWarning,
        invalidRows: invalidRows.length > 0 ? invalidRows : undefined,
      });
    } catch (error: any) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: error.message || "Failed to import CSV" });
    }
  });

  // ============================================================================
  // SUBSCRIBERS
  // ============================================================================

  // Get subscribers for user (paginated)
  app.get("/api/subscribers", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const status = req.query.status as 'subscribed' | 'unsubscribed' | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      
      // Validate status filter if provided
      if (status && status !== 'subscribed' && status !== 'unsubscribed') {
        return res.status(400).json({ error: "Invalid status filter" });
      }

      // Validate pagination parameters
      if (page < 1 || pageSize < 1 || pageSize > 100) {
        return res.status(400).json({ error: "Invalid pagination parameters" });
      }

      const result = await storage.getSubscribersForUser(effectiveUserId, { status, page, pageSize });
      res.json({
        subscribers: result.subscribers,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      });
    } catch (error: any) {
      console.error("Get subscribers error:", error);
      res.status(500).json({ error: "Failed to fetch subscribers" });
    }
  });

  // Update subscriber (edit status)
  app.put("/api/subscribers/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const subscriberId = parseInt(req.params.id);
      
      if (isNaN(subscriberId)) {
        return res.status(400).json({ error: "Invalid subscriber ID" });
      }

      const subscriber = await storage.getSubscriber(subscriberId);

      if (!subscriber || subscriber.userId !== req.userId!) {
        return res.status(404).json({ error: "Subscriber not found" });
      }

      // Validate request body with Zod
      const updateSchema = z.object({
        status: z.enum(["subscribed", "unsubscribed"]),
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
    } catch (error: any) {
      console.error("Update subscriber error:", error);
      res.status(500).json({ error: "Failed to update subscriber" });
    }
  });

  // Delete subscriber
  app.delete("/api/subscribers/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const subscriberId = parseInt(req.params.id);
      
      if (isNaN(subscriberId)) {
        return res.status(400).json({ error: "Invalid subscriber ID" });
      }

      const subscriber = await storage.getSubscriber(subscriberId);

      if (!subscriber || subscriber.userId !== req.userId!) {
        return res.status(404).json({ error: "Subscriber not found" });
      }

      await storage.deleteSubscriber(subscriberId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete subscriber error:", error);
      res.status(500).json({ error: "Failed to delete subscriber" });
    }
  });

  // Export subscribers as CSV
  app.get("/api/subscribers/export", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Get all subscribers (no pagination for export)
      const result = await storage.getSubscribersForUser(req.userId!, { pageSize: 100000 });
      
      // Generate CSV
      const csvLines = [
        "Name,Phone,Status,Last Updated" // Header
      ];

      for (const sub of result.subscribers) {
        const lastUpdated = sub.lastUpdated ? new Date(sub.lastUpdated).toLocaleString() : "";
        csvLines.push(`"${sub.name}","${sub.phone}","${sub.status}","${lastUpdated}"`);
      }

      const csv = csvLines.join("\n");

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="subscribers-${Date.now()}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error("Export subscribers error:", error);
      res.status(500).json({ error: "Failed to export subscribers" });
    }
  });

  // ============================================================================
  // CAPTURE SEQUENCES
  // ============================================================================

  // Get capture sequences for user with captured data
  app.get("/api/capture-sequences", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const sequences = await storage.getCaptureSequencesForUser(effectiveUserId);
      
      // Fetch captured data for each sequence
      const sequencesWithData = await Promise.all(
        sequences.map(async (seq) => {
          const { entries } = await storage.getCapturedDataForSequence(seq.id);
          return {
            ...seq,
            capturedData: entries,
          };
        })
      );
      
      res.json(sequencesWithData);
    } catch (error: any) {
      console.error("Get capture sequences error:", error);
      res.status(500).json({ error: "Failed to fetch capture sequences" });
    }
  });

  // Delete capture sequence and all its data
  app.delete("/api/capture-sequences/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const sequenceId = parseInt(req.params.id);
      if (isNaN(sequenceId)) {
        return res.status(400).json({ error: "Invalid sequence ID" });
      }

      const sequence = await storage.getCaptureSequence(sequenceId);
      if (!sequence) {
        return res.status(404).json({ error: "Sequence not found" });
      }

      // Verify ownership
      const effectiveUserId = getEffectiveUserId(req);
      if (sequence.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Delete all captured data for this sequence first
      const capturedEntries = await storage.getCapturedDataForSequence(sequenceId);
      for (const entry of capturedEntries.entries) {
        await storage.deleteCapturedData(entry.id);
      }
      
      // Delete the sequence
      await storage.deleteCaptureSequence(sequenceId);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete capture sequence error:", error);
      res.status(500).json({ error: "Failed to delete sequence" });
    }
  });

  // Delete individual captured data
  app.delete("/api/captured-data/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const dataId = parseInt(req.params.id);
      if (isNaN(dataId)) {
        return res.status(400).json({ error: "Invalid data ID" });
      }

      const data = await storage.getCapturedDataEntry(dataId);
      if (!data) {
        return res.status(404).json({ error: "Data not found" });
      }

      // Verify ownership
      const effectiveUserId = getEffectiveUserId(req);
      if (data.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.deleteCapturedData(dataId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete captured data error:", error);
      res.status(500).json({ error: "Failed to delete data" });
    }
  });

  // ============================================================================
  // LABEL MANAGEMENT
  // ============================================================================

  // Get user's label settings
  app.get("/api/label-settings", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const user = await storage.getUser(effectiveUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        labelManagementAllowed: user.labelManagementAllowed,
        chatbotLabelId: user.chatbotLabelId,
        chatbotLabelName: user.chatbotLabelName,
        inquiryLabelId: user.inquiryLabelId,
        inquiryLabelName: user.inquiryLabelName,
      });
    } catch (error: any) {
      console.error("Get label settings error:", error);
      res.status(500).json({ error: "Failed to fetch label settings" });
    }
  });

  // Update user's label settings
  app.post("/api/label-settings", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { chatbotLabelName, inquiryLabelName } = req.body;
      
      const updateData: any = {};
      if (chatbotLabelName) updateData.chatbotLabelName = chatbotLabelName;
      if (inquiryLabelName) updateData.inquiryLabelName = inquiryLabelName;
      
      const updated = await storage.updateUser(effectiveUserId, updateData);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        success: true,
        chatbotLabelName: updated.chatbotLabelName,
        inquiryLabelName: updated.inquiryLabelName,
      });
    } catch (error: any) {
      console.error("Update label settings error:", error);
      res.status(500).json({ error: "Failed to update label settings" });
    }
  });

  // Sync labels with WhatsApp (create if not exists)
  app.post("/api/label-settings/sync", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      console.log(`[Label Sync] Starting sync for user ${effectiveUserId}`);
      
      const user = await storage.getUser(effectiveUserId);
      if (!user) {
        console.log(`[Label Sync] User ${effectiveUserId} not found`);
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`[Label Sync] User ${effectiveUserId} labelManagementAllowed: ${user.labelManagementAllowed}`);
      
      if (!user.labelManagementAllowed) {
        return res.status(403).json({ error: "Label management is disabled for your account" });
      }
      
      // Get an active channel with token for this user
      const userChannels = await storage.getChannelsForUser(effectiveUserId);
      console.log(`[Label Sync] Found ${userChannels.length} channels for user ${effectiveUserId}`);
      
      const activeChannel = userChannels.find(c => c.authStatus === "AUTHORIZED" && c.whapiChannelToken);
      
      if (!activeChannel?.whapiChannelToken) {
        console.log(`[Label Sync] No active authorized channel with token found`);
        return res.status(400).json({ error: "No active WhatsApp channel found. Please authorize a channel first." });
      }
      
      console.log(`[Label Sync] Using channel ${activeChannel.id} with phone ${activeChannel.phone}`);
      console.log(`[Label Sync] Label names - Chatbot: "${user.chatbotLabelName || 'Chatbot'}", Inquiry: "${user.inquiryLabelName || 'Inquiries'}"`);
      
      // Initialize labels using WHAPI
      const { initializeUserLabels } = await import("./whapi");
      const { chatbotLabelId, inquiryLabelId } = await initializeUserLabels(
        activeChannel.whapiChannelToken,
        user.chatbotLabelName,
        user.inquiryLabelName,
        { userId: effectiveUserId, channelId: activeChannel.id }
      );
      
      console.log(`[Label Sync] WHAPI returned - chatbotLabelId: ${chatbotLabelId}, inquiryLabelId: ${inquiryLabelId}`);
      
      // Save the label IDs to user
      await storage.updateUser(effectiveUserId, {
        chatbotLabelId,
        inquiryLabelId,
      });
      
      console.log(`[Label Sync] Saved label IDs to user ${effectiveUserId}`);
      
      res.json({
        success: true,
        chatbotLabelId,
        inquiryLabelId,
        message: "Labels synced successfully with WhatsApp",
      });
    } catch (error: any) {
      console.error("[Label Sync] Error:", error);
      res.status(500).json({ error: "Failed to sync labels" });
    }
  });

  // Get available labels from WhatsApp
  app.get("/api/label-settings/labels", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      
      // Get an active channel with token for this user
      const userChannels = await storage.getChannelsForUser(effectiveUserId);
      const activeChannel = userChannels.find(c => c.authStatus === "AUTHORIZED" && c.whapiChannelToken);
      
      if (!activeChannel?.whapiChannelToken) {
        return res.status(400).json({ error: "No active WhatsApp channel found" });
      }
      
      const { getLabels } = await import("./whapi");
      const labels = await getLabels(activeChannel.whapiChannelToken);
      
      res.json(labels);
    } catch (error: any) {
      console.error("Get WhatsApp labels error:", error);
      res.status(500).json({ error: "Failed to fetch labels" });
    }
  });

  // Get label operation logs for user
  app.get("/api/label-logs", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { operation, status, limit } = req.query;
      
      const logs = await storage.getLabelLogs({
        userId: effectiveUserId,
        operation: operation as string | undefined,
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 100,
      });
      
      res.json(logs);
    } catch (error: any) {
      console.error("Get label logs error:", error);
      res.status(500).json({ error: "Failed to fetch label logs" });
    }
  });

  // ============================================================================
  // BOOKING SCHEDULER
  // ============================================================================

  // --- Services (groups of departments) ---
  app.get("/api/booking/services", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const services = await storage.getBookingServicesForUser(effectiveUserId);
      res.json(services);
    } catch (error: any) {
      console.error("Get services error:", error);
      res.status(500).json({ error: "Failed to fetch services" });
    }
  });

  app.post("/api/booking/services", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { name, description, slotLabels } = req.body;
      
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Service name is required" });
      }

      // Validate slotLabels if provided - must be array of strings
      let validatedSlotLabels: string[] | null = null;
      if (slotLabels && Array.isArray(slotLabels) && slotLabels.length > 0) {
        validatedSlotLabels = slotLabels.map((label: any) => String(label || '').trim()).filter(Boolean);
        if (validatedSlotLabels.length === 0) validatedSlotLabels = null;
      }

      const service = await storage.createBookingService({
        userId: effectiveUserId,
        name: name.trim(),
        description: description || null,
        slotLabels: validatedSlotLabels,
      });
      res.json(service);
    } catch (error: any) {
      console.error("Create service error:", error);
      res.status(500).json({ error: "Failed to create service" });
    }
  });

  app.put("/api/booking/services/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const serviceId = parseInt(req.params.id);
      if (isNaN(serviceId)) return res.status(400).json({ error: "Invalid ID" });

      const service = await storage.getBookingService(serviceId);
      if (!service) return res.status(404).json({ error: "Service not found" });
      if (service.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateBookingService(serviceId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Update service error:", error);
      res.status(500).json({ error: "Failed to update service" });
    }
  });

  app.delete("/api/booking/services/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const serviceId = parseInt(req.params.id);
      if (isNaN(serviceId)) return res.status(400).json({ error: "Invalid ID" });

      const service = await storage.getBookingService(serviceId);
      if (!service) return res.status(404).json({ error: "Service not found" });
      if (service.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteBookingService(serviceId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete service error:", error);
      res.status(500).json({ error: "Failed to delete service" });
    }
  });

  // Get departments for a specific service
  app.get("/api/booking/services/:serviceId/departments", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      if (isNaN(serviceId)) return res.status(400).json({ error: "Invalid service ID" });

      const departments = await storage.getBookingDepartmentsForService(serviceId);
      res.json(departments);
    } catch (error: any) {
      console.error("Get departments for service error:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // --- Departments ---
  app.get("/api/booking/departments", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const departments = await storage.getBookingDepartmentsForUser(effectiveUserId);
      res.json(departments);
    } catch (error: any) {
      console.error("Get departments error:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.post("/api/booking/departments", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { name, description, serviceId } = req.body;
      
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Department name is required" });
      }

      // Validate serviceId if provided
      if (serviceId) {
        const service = await storage.getBookingService(serviceId);
        if (!service || service.userId !== effectiveUserId) {
          return res.status(400).json({ error: "Invalid service ID" });
        }
      }

      const department = await storage.createBookingDepartment({
        userId: effectiveUserId,
        name: name.trim(),
        description: description || null,
        serviceId: serviceId || null,
      });
      res.json(department);
    } catch (error: any) {
      console.error("Create department error:", error);
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  app.put("/api/booking/departments/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const deptId = parseInt(req.params.id);
      if (isNaN(deptId)) return res.status(400).json({ error: "Invalid ID" });

      const dept = await storage.getBookingDepartment(deptId);
      if (!dept) return res.status(404).json({ error: "Department not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (dept.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await storage.updateBookingDepartment(deptId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Update department error:", error);
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  app.delete("/api/booking/departments/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const deptId = parseInt(req.params.id);
      if (isNaN(deptId)) return res.status(400).json({ error: "Invalid ID" });

      const dept = await storage.getBookingDepartment(deptId);
      if (!dept) return res.status(404).json({ error: "Department not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (dept.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.deleteBookingDepartment(deptId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete department error:", error);
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // --- Staff ---
  app.get("/api/booking/departments/:deptId/staff", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const deptId = parseInt(req.params.deptId);
      if (isNaN(deptId)) return res.status(400).json({ error: "Invalid department ID" });

      const dept = await storage.getBookingDepartment(deptId);
      if (!dept) return res.status(404).json({ error: "Department not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (dept.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const staff = await storage.getBookingStaffForDepartment(deptId);
      res.json(staff);
    } catch (error: any) {
      console.error("Get staff error:", error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  app.get("/api/booking/staff", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const staff = await storage.getBookingStaffForUser(effectiveUserId);
      res.json(staff);
    } catch (error: any) {
      console.error("Get all staff error:", error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  app.post("/api/booking/departments/:deptId/staff", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const deptId = parseInt(req.params.deptId);
      if (isNaN(deptId)) return res.status(400).json({ error: "Invalid department ID" });

      const dept = await storage.getBookingDepartment(deptId);
      if (!dept) return res.status(404).json({ error: "Department not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (dept.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { name, phone, email } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Staff name is required" });
      }

      const staff = await storage.createBookingStaff({
        userId: effectiveUserId,
        departmentId: deptId,
        name: name.trim(),
        phone: phone || null,
        email: email || null,
      });
      res.json(staff);
    } catch (error: any) {
      console.error("Create staff error:", error);
      res.status(500).json({ error: "Failed to create staff" });
    }
  });

  app.put("/api/booking/staff/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) return res.status(400).json({ error: "Invalid ID" });

      const staff = await storage.getBookingStaff(staffId);
      if (!staff) return res.status(404).json({ error: "Staff not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await storage.updateBookingStaff(staffId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Update staff error:", error);
      res.status(500).json({ error: "Failed to update staff" });
    }
  });

  app.delete("/api/booking/staff/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) return res.status(400).json({ error: "Invalid ID" });

      const staff = await storage.getBookingStaff(staffId);
      if (!staff) return res.status(404).json({ error: "Staff not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.deleteBookingStaff(staffId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete staff error:", error);
      res.status(500).json({ error: "Failed to delete staff" });
    }
  });

  // --- Slots ---
  app.get("/api/booking/staff/:staffId/slots", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const staffId = parseInt(req.params.staffId);
      if (isNaN(staffId)) return res.status(400).json({ error: "Invalid staff ID" });

      const staff = await storage.getBookingStaff(staffId);
      if (!staff) return res.status(404).json({ error: "Staff not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const slots = await storage.getBookingStaffSlots(staffId);
      res.json(slots);
    } catch (error: any) {
      console.error("Get slots error:", error);
      res.status(500).json({ error: "Failed to fetch slots" });
    }
  });

  app.post("/api/booking/staff/:staffId/slots", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const staffId = parseInt(req.params.staffId);
      if (isNaN(staffId)) return res.status(400).json({ error: "Invalid staff ID" });

      const staff = await storage.getBookingStaff(staffId);
      if (!staff) return res.status(404).json({ error: "Staff not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { dayOfWeek, startTime, endTime, slotDuration, capacity } = req.body;

      if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ error: "Invalid day of week (0-6)" });
      }
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "Start time and end time are required" });
      }

      const slot = await storage.createBookingStaffSlot({
        staffId,
        dayOfWeek,
        startTime,
        endTime,
        slotDuration: slotDuration || 30,
        capacity: capacity || 1,
      });
      res.json(slot);
    } catch (error: any) {
      console.error("Create slot error:", error);
      res.status(500).json({ error: "Failed to create slot" });
    }
  });

  app.put("/api/booking/slots/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const slotId = parseInt(req.params.id);
      if (isNaN(slotId)) return res.status(400).json({ error: "Invalid ID" });

      const slot = await storage.getBookingStaffSlot(slotId);
      if (!slot) return res.status(404).json({ error: "Slot not found" });

      const staff = await storage.getBookingStaff(slot.staffId);
      if (!staff) return res.status(404).json({ error: "Staff not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await storage.updateBookingStaffSlot(slotId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Update slot error:", error);
      res.status(500).json({ error: "Failed to update slot" });
    }
  });

  app.delete("/api/booking/slots/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const slotId = parseInt(req.params.id);
      if (isNaN(slotId)) return res.status(400).json({ error: "Invalid ID" });

      const slot = await storage.getBookingStaffSlot(slotId);
      if (!slot) return res.status(404).json({ error: "Slot not found" });

      const staff = await storage.getBookingStaff(slot.staffId);
      if (!staff) return res.status(404).json({ error: "Staff not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.deleteBookingStaffSlot(slotId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete slot error:", error);
      res.status(500).json({ error: "Failed to delete slot" });
    }
  });

  // --- CSV Import for Booking Data ---
  const dayNameToNumber: Record<string, number> = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6,
    'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
  };

  app.post("/api/booking/import/departments", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { rows } = req.body;

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data to import" });
      }

      const created: any[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = (row.name || '').toString().trim();
        const description = (row.description || '').toString().trim();

        if (!name) {
          errors.push(`Row ${i + 1}: Department name is required`);
          continue;
        }

        try {
          const dept = await storage.createBookingDepartment({
            userId: effectiveUserId,
            name,
            description: description || null,
          });
          created.push(dept);
        } catch (err: any) {
          errors.push(`Row ${i + 1}: Failed to create department "${name}"`);
        }
      }

      res.json({ imported: created.length, errors });
    } catch (error: any) {
      console.error("Import departments error:", error);
      res.status(500).json({ error: "Failed to import departments" });
    }
  });

  app.post("/api/booking/import/staff", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { rows, departmentId } = req.body;

      if (!departmentId) {
        return res.status(400).json({ error: "Department ID is required" });
      }

      const dept = await storage.getBookingDepartment(departmentId);
      if (!dept) return res.status(404).json({ error: "Department not found" });
      if (dept.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data to import" });
      }

      const created: any[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = (row.name || '').toString().trim();
        const phone = (row.phone || '').toString().trim();
        const email = (row.email || '').toString().trim();

        if (!name) {
          errors.push(`Row ${i + 1}: Staff name is required`);
          continue;
        }

        try {
          const staff = await storage.createBookingStaff({
            userId: effectiveUserId,
            departmentId,
            name,
            phone: phone || null,
            email: email || null,
          });
          created.push(staff);
        } catch (err: any) {
          errors.push(`Row ${i + 1}: Failed to create staff "${name}"`);
        }
      }

      res.json({ imported: created.length, errors });
    } catch (error: any) {
      console.error("Import staff error:", error);
      res.status(500).json({ error: "Failed to import staff" });
    }
  });

  app.post("/api/booking/import/slots", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { rows, staffId } = req.body;

      if (!staffId) {
        return res.status(400).json({ error: "Staff ID is required" });
      }

      const staff = await storage.getBookingStaff(staffId);
      if (!staff) return res.status(404).json({ error: "Staff not found" });
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data to import" });
      }

      const created: any[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let dayOfWeek = row.day ?? row.dayOfWeek ?? row.dayofweek;
        const startTime = (row.starttime || '').toString().trim();
        const endTime = (row.endtime || '').toString().trim();
        const slotDuration = parseInt(row.slotduration || '30');
        const capacity = parseInt(row.capacity || '1');

        if (typeof dayOfWeek === 'string') {
          const lowerDay = dayOfWeek.toLowerCase();
          if (dayNameToNumber[lowerDay] !== undefined) {
            dayOfWeek = dayNameToNumber[lowerDay];
          } else {
            dayOfWeek = parseInt(dayOfWeek);
          }
        }

        if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          errors.push(`Row ${i + 1}: Invalid day of week`);
          continue;
        }

        if (!startTime || !endTime) {
          errors.push(`Row ${i + 1}: Start time and end time are required`);
          continue;
        }

        try {
          const slot = await storage.createBookingStaffSlot({
            staffId,
            dayOfWeek,
            startTime,
            endTime,
            slotDuration: isNaN(slotDuration) ? 30 : slotDuration,
            capacity: isNaN(capacity) ? 1 : capacity,
          });
          created.push(slot);
        } catch (err: any) {
          errors.push(`Row ${i + 1}: Failed to create slot`);
        }
      }

      res.json({ imported: created.length, errors });
    } catch (error: any) {
      console.error("Import slots error:", error);
      res.status(500).json({ error: "Failed to import slots" });
    }
  });

  // --- Bookings ---
  app.get("/api/booking/bookings", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { status, fromDate, toDate, staffId, departmentId, page, pageSize, search } = req.query;

      const result = await storage.getBookingsForUser(effectiveUserId, {
        status: status as string,
        fromDate: fromDate as string,
        toDate: toDate as string,
        staffId: staffId ? parseInt(staffId as string) : undefined,
        departmentId: departmentId ? parseInt(departmentId as string) : undefined,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 20,
        search: search as string,
      });
      
      // Enrich bookings with department and staff names
      const enrichedBookings = await Promise.all(
        result.bookings.map(async (booking) => {
          const [department, staff] = await Promise.all([
            booking.departmentId ? storage.getBookingDepartment(booking.departmentId) : null,
            booking.staffId ? storage.getBookingStaff(booking.staffId) : null,
          ]);
          return {
            ...booking,
            departmentName: department?.name || null,
            staffName: staff?.name || null,
          };
        })
      );
      
      res.json({ bookings: enrichedBookings, total: result.total });
    } catch (error: any) {
      console.error("Get bookings error:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  app.post("/api/booking/bookings", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { departmentId, staffId, slotDate, startTime, endTime, customerPhone, customerName, nodeId, bookingLabel, metadata } = req.body;

      if (!departmentId || !staffId || !slotDate || !startTime || !endTime || !customerPhone) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check slot availability
      const availability = await storage.checkSlotAvailability(staffId, slotDate, startTime);
      if (!availability.available) {
        return res.status(409).json({ 
          error: "Slot not available", 
          existingCount: availability.existingCount,
          capacity: availability.capacity 
        });
      }

      const booking = await storage.createBooking({
        userId: effectiveUserId,
        departmentId,
        staffId,
        slotDate,
        startTime,
        endTime,
        customerPhone,
        customerName: customerName || null,
        nodeId: nodeId || null,
        bookingLabel: bookingLabel || null,
        metadata: metadata || null,
        status: "confirmed",
      });
      res.json(booking);
    } catch (error: any) {
      console.error("Create booking error:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  app.put("/api/booking/bookings/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const bookingId = parseInt(req.params.id);
      if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid ID" });

      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (booking.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await storage.updateBooking(bookingId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Update booking error:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Confirm booking with optional notification
  app.post("/api/booking/bookings/:id/confirm", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const bookingId = parseInt(req.params.id);
      if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid ID" });

      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (booking.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Update status to confirmed
      const updated = await storage.updateBooking(bookingId, { status: 'confirmed' });

      // Send notification if requested
      const { sendNotification } = req.body;
      if (sendNotification) {
        try {
          const channels = await storage.getChannelsForUser(effectiveUserId);
          const activeChannel = channels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
          
          if (activeChannel?.whapiChannelToken) {
            const staff = await storage.getBookingStaff(booking.staffId);
            const dept = await storage.getBookingDepartment(booking.departmentId);
            
            // Get customizable message from per-user settings or use default
            const userSettings = await storage.getUserBookingSettings(effectiveUserId);
            let message = userSettings?.confirmMessage || `Your booking has been confirmed!\n\nDate: {{date}}\nTime: {{time}}\nDepartment: {{department}}\nStaff: {{staff}}\n\nWe look forward to seeing you!`;
            
            // Replace template variables
            message = message
              .replace(/\{\{customerName\}\}/g, booking.customerName || '')
              .replace(/\{\{date\}\}/g, booking.slotDate)
              .replace(/\{\{time\}\}/g, booking.startTime)
              .replace(/\{\{oldDate\}\}/g, '')
              .replace(/\{\{oldTime\}\}/g, '')
              .replace(/\{\{department\}\}/g, dept?.name || '')
              .replace(/\{\{staff\}\}/g, staff?.name || '');
            
            await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
              to: booking.customerPhone,
              body: message,
            });
          }
        } catch (notifyErr) {
          console.error("Failed to send confirmation notification:", notifyErr);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Confirm booking error:", error);
      res.status(500).json({ error: "Failed to confirm booking" });
    }
  });

  // Cancel booking with optional notification
  app.post("/api/booking/bookings/:id/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const bookingId = parseInt(req.params.id);
      if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid ID" });

      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (booking.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Update status to cancelled
      const updated = await storage.updateBooking(bookingId, { status: 'cancelled' });

      // Send notification if requested
      const { sendNotification } = req.body;
      if (sendNotification) {
        try {
          const channels = await storage.getChannelsForUser(effectiveUserId);
          const activeChannel = channels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
          
          if (activeChannel?.whapiChannelToken) {
            const staff = await storage.getBookingStaff(booking.staffId);
            const dept = await storage.getBookingDepartment(booking.departmentId);
            
            // Get customizable message from per-user settings or use default
            const userSettings = await storage.getUserBookingSettings(effectiveUserId);
            let message = userSettings?.cancelMessage || `Your booking has been cancelled.\n\nDate: {{date}}\nTime: {{time}}\nDepartment: {{department}}\n\nIf you have questions, please contact us.`;
            
            // Replace template variables
            message = message
              .replace(/\{\{customerName\}\}/g, booking.customerName || '')
              .replace(/\{\{date\}\}/g, booking.slotDate)
              .replace(/\{\{time\}\}/g, booking.startTime)
              .replace(/\{\{oldDate\}\}/g, '')
              .replace(/\{\{oldTime\}\}/g, '')
              .replace(/\{\{department\}\}/g, dept?.name || '')
              .replace(/\{\{staff\}\}/g, staff?.name || '');
            
            await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
              to: booking.customerPhone,
              body: message,
            });
          }
        } catch (notifyErr) {
          console.error("Failed to send cancellation notification:", notifyErr);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Cancel booking error:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  // Get user's booking notification settings
  app.get("/api/booking/notification-settings", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const settings = await storage.getUserBookingSettings(effectiveUserId);
      
      res.json({
        confirmMessage: settings?.confirmMessage || null,
        rescheduleMessage: settings?.rescheduleMessage || null,
        cancelMessage: settings?.cancelMessage || null,
        customDayNames: settings?.customDayNames || null,
      });
    } catch (error: any) {
      console.error("Get booking notification settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update user's booking notification settings
  app.put("/api/booking/notification-settings", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const { confirmMessage, rescheduleMessage, cancelMessage, customDayNames } = req.body;
      
      // Validate customDayNames if provided - must be array of exactly 7 strings
      let validatedDayNames: string[] | null = null;
      if (customDayNames && Array.isArray(customDayNames) && customDayNames.length === 7) {
        validatedDayNames = customDayNames.map((name: any) => String(name || ''));
      }
      
      const updated = await storage.updateUserBookingSettings(effectiveUserId, {
        confirmMessage: confirmMessage || null,
        rescheduleMessage: rescheduleMessage || null,
        cancelMessage: cancelMessage || null,
        customDayNames: validatedDayNames,
      });

      res.json({
        success: true,
        confirmMessage: updated.confirmMessage,
        rescheduleMessage: updated.rescheduleMessage,
        cancelMessage: updated.cancelMessage,
        customDayNames: updated.customDayNames,
      });
    } catch (error: any) {
      console.error("Update booking notification settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Reschedule booking with optional notification
  app.post("/api/booking/bookings/:id/reschedule", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const bookingId = parseInt(req.params.id);
      if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid ID" });

      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (booking.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { newDate, newStartTime, newEndTime, newStaffId, newDepartmentId, sendNotification } = req.body;
      
      if (!newDate || !newStartTime || !newEndTime) {
        return res.status(400).json({ error: "New date and time are required" });
      }

      // Check if new slot is available
      const staffIdToUse = newStaffId || booking.staffId;
      const departmentIdToUse = newDepartmentId || booking.departmentId;
      const isAvailable = await storage.checkSlotAvailability(staffIdToUse, newDate, newStartTime);
      
      if (!isAvailable) {
        return res.status(400).json({ error: "The selected time slot is not available" });
      }

      // Store old booking info for notification
      const oldDate = booking.slotDate;
      const oldTime = booking.startTime;

      // Update booking with new date/time (and department if changed)
      const updated = await storage.updateBooking(bookingId, {
        slotDate: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        staffId: staffIdToUse,
        departmentId: departmentIdToUse,
      });

      // Send notification if requested
      if (sendNotification) {
        try {
          const channels = await storage.getChannelsForUser(effectiveUserId);
          const activeChannel = channels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
          
          if (activeChannel?.whapiChannelToken) {
            const staff = await storage.getBookingStaff(staffIdToUse);
            const dept = await storage.getBookingDepartment(departmentIdToUse);
            
            // Get customizable message from per-user settings or use default
            const userSettings = await storage.getUserBookingSettings(effectiveUserId);
            let message = userSettings?.rescheduleMessage || `Your booking has been rescheduled.\n\nOld: {{oldDate}} at {{oldTime}}\nNew: {{date}} at {{time}}\nDepartment: {{department}}\nStaff: {{staff}}\n\nWe look forward to seeing you!`;
            
            // Replace template variables
            message = message
              .replace(/\{\{customerName\}\}/g, booking.customerName || '')
              .replace(/\{\{date\}\}/g, newDate)
              .replace(/\{\{time\}\}/g, newStartTime)
              .replace(/\{\{oldDate\}\}/g, oldDate)
              .replace(/\{\{oldTime\}\}/g, oldTime)
              .replace(/\{\{department\}\}/g, dept?.name || '')
              .replace(/\{\{staff\}\}/g, staff?.name || '');
            
            await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
              to: booking.customerPhone,
              body: message,
            });
          }
        } catch (notifyErr) {
          console.error("Failed to send reschedule notification:", notifyErr);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Reschedule booking error:", error);
      res.status(500).json({ error: "Failed to reschedule booking" });
    }
  });

  // Get available slots for a staff member on a specific date (for reschedule UI)
  app.get("/api/booking/staff/:staffId/available-slots", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const staffId = parseInt(req.params.staffId);
      const { date } = req.query;
      
      if (isNaN(staffId) || !date) {
        return res.status(400).json({ error: "Staff ID and date are required" });
      }

      const effectiveUserId = getEffectiveUserId(req);
      const staff = await storage.getBookingStaff(staffId);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff not found" });
      }

      // Verify ownership - staff must belong to the requesting user (or admin)
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized to view this staff's slots" });
      }

      // Get the day of week for the requested date
      const requestedDate = new Date(date as string);
      const dayOfWeek = requestedDate.getDay();

      // Get all slots for this staff on this day of week
      const allSlots = await storage.getBookingStaffSlots(staffId);
      const daySlots = allSlots.filter((s: any) => s.dayOfWeek === dayOfWeek && s.isActive);

      // For each slot template, generate individual time slots
      const availableSlots: { startTime: string; endTime: string }[] = [];
      
      for (const slotTemplate of daySlots) {
        // Generate individual slots based on duration
        let currentTime = slotTemplate.startTime;
        
        while (currentTime < slotTemplate.endTime) {
          // Calculate end time for this slot
          const [hours, mins] = currentTime.split(':').map(Number);
          const startMins = hours * 60 + mins;
          const endMins = startMins + slotTemplate.slotDuration;
          const endHours = Math.floor(endMins / 60);
          const endMinutes = endMins % 60;
          const endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
          
          if (endTimeStr <= slotTemplate.endTime) {
            // Check if this slot is available (not already booked)
            const isAvailable = await storage.checkSlotAvailability(staffId, date as string, currentTime);
            
            if (isAvailable) {
              availableSlots.push({
                startTime: currentTime,
                endTime: endTimeStr,
              });
            }
          }
          
          // Move to next slot
          currentTime = endTimeStr;
        }
      }

      res.json(availableSlots);
    } catch (error: any) {
      console.error("Get available slots error:", error);
      res.status(500).json({ error: "Failed to get available slots" });
    }
  });

  // Bulk delete bookings (must be before :id route to avoid matching "bulk" as an id)
  app.delete("/api/booking/bookings/bulk", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No booking IDs provided" });
      }

      const effectiveUserId = getEffectiveUserId(req);
      let deletedCount = 0;

      for (const id of ids) {
        const booking = await storage.getBooking(id);
        if (booking && (booking.userId === effectiveUserId || req.user?.role === "admin")) {
          await storage.deleteBooking(id);
          deletedCount++;
        }
      }

      res.json({ success: true, deleted: deletedCount });
    } catch (error: any) {
      console.error("Bulk delete bookings error:", error);
      res.status(500).json({ error: "Failed to delete bookings" });
    }
  });

  app.delete("/api/booking/bookings/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const bookingId = parseInt(req.params.id);
      if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid ID" });

      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (booking.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.deleteBooking(bookingId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete booking error:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Check slot availability (for UI preview)
  app.get("/api/booking/availability", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { staffId, slotDate, startTime } = req.query;

      if (!staffId || !slotDate || !startTime) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const result = await storage.checkSlotAvailability(
        parseInt(staffId as string),
        slotDate as string,
        startTime as string
      );
      res.json(result);
    } catch (error: any) {
      console.error("Check availability error:", error);
      res.status(500).json({ error: "Failed to check availability" });
    }
  });

  // Get available time slots for a specific date and staff (for chatbot)
  app.get("/api/booking/available-slots", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { staffId, date } = req.query;

      if (!staffId || !date) {
        return res.status(400).json({ error: "staffId and date are required" });
      }

      const staff = await storage.getBookingStaff(parseInt(staffId as string));
      if (!staff) return res.status(404).json({ error: "Staff not found" });

      const effectiveUserId = getEffectiveUserId(req);
      if (staff.userId !== effectiveUserId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get day of week from date
      const dateObj = new Date(date as string);
      const dayOfWeek = dateObj.getDay();

      // Get staff slots for this day
      const allSlots = await storage.getBookingStaffSlots(staff.id);
      const daySlots = allSlots.filter(s => s.dayOfWeek === dayOfWeek && s.isActive);

      // For each slot, generate time intervals and check availability
      const availableSlots: Array<{ startTime: string; endTime: string; available: boolean; remainingCapacity: number }> = [];

      for (const slot of daySlots) {
        // Generate time slots within this availability window
        const [startHour, startMin] = slot.startTime.split(':').map(Number);
        const [endHour, endMin] = slot.endTime.split(':').map(Number);
        const slotDuration = slot.slotDuration;

        let currentMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        while (currentMinutes + slotDuration <= endMinutes) {
          const slotStartTime = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`;
          const slotEndMinutes = currentMinutes + slotDuration;
          const slotEndTime = `${String(Math.floor(slotEndMinutes / 60)).padStart(2, '0')}:${String(slotEndMinutes % 60).padStart(2, '0')}`;

          const availability = await storage.checkSlotAvailability(staff.id, date as string, slotStartTime);

          availableSlots.push({
            startTime: slotStartTime,
            endTime: slotEndTime,
            available: availability.available,
            remainingCapacity: availability.capacity - availability.existingCount,
          });

          currentMinutes += slotDuration;
        }
      }

      res.json(availableSlots);
    } catch (error: any) {
      console.error("Get available slots error:", error);
      res.status(500).json({ error: "Failed to get available slots" });
    }
  });

  // ============================================================================
  // WORKFLOWS
  // ============================================================================

  // Get workflows
  app.get("/api/workflows", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflows = await storage.getWorkflowsForUser(effectiveUserId);
      res.json(workflows);
    } catch (error: any) {
      console.error("Get workflows error:", error);
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });

  // Create workflow
  app.post("/api/workflows", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      // Validate request body
      const validationResult = insertWorkflowSchema.extend({ userId: z.number() }).safeParse({
        ...req.body,
        userId: effectiveUserId,
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
        definitionJson: definitionJson || {},
      });

      res.json(workflow);
    } catch (error: any) {
      console.error("Create workflow error:", error);
      res.status(500).json({ error: "Failed to create workflow" });
    }
  });

  // Update workflow
  app.put("/api/workflows/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow || workflow.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      // Validate request body
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        definitionJson: z.record(z.any()).optional(),
        entryNodeId: z.string().optional().nullable(),
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
        entryNodeId,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Update workflow error:", error);
      res.status(500).json({ error: "Failed to update workflow" });
    }
  });

  // Delete workflow
  app.delete("/api/workflows/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow || workflow.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      await storage.deleteWorkflow(workflowId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete workflow error:", error);
      res.status(500).json({ error: "Failed to delete workflow" });
    }
  });

  // Toggle workflow active status
  app.patch("/api/workflows/:id/toggle-active", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow || workflow.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }

      const updated = await storage.updateWorkflow(workflowId, { isActive });
      res.json(updated);
    } catch (error: any) {
      console.error("Toggle workflow active error:", error);
      res.status(500).json({ error: "Failed to toggle workflow status" });
    }
  });

  // Update workflow label management settings
  app.patch("/api/workflows/:id/label-settings", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow || workflow.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const { labelManagementEnabled } = req.body;
      if (typeof labelManagementEnabled !== 'boolean') {
        return res.status(400).json({ error: "labelManagementEnabled must be a boolean" });
      }
      
      // Check if label management is enabled at plan level
      const subscription = await storage.getActiveSubscriptionForUser(effectiveUserId);
      if (subscription) {
        const plan = await storage.getPlan(subscription.planId);
        if (!plan || !(plan as any).labelManagementEnabled) {
          return res.status(403).json({ error: "Label management feature is not available in your current plan." });
        }
      } else {
        return res.status(403).json({ error: "Active subscription required to enable label management." });
      }
      
      // Check if admin has allowed label management for this user
      const user = await storage.getUser(effectiveUserId);
      if (!user?.labelManagementAllowed) {
        return res.status(403).json({ error: "Label management is not allowed for your account. Contact your administrator." });
      }
      
      // Auto-sync labels if enabling and labels not yet configured
      if (labelManagementEnabled && (!user.chatbotLabelId || !user.inquiryLabelId)) {
        // Get an active channel with token for this user
        const userChannels = await storage.getChannelsForUser(effectiveUserId);
        const activeChannel = userChannels.find(c => c.whapiChannelToken && c.authStatus === 'AUTHORIZED');
        
        if (activeChannel?.whapiChannelToken) {
          console.log(`[Label Management] Auto-syncing labels for user ${effectiveUserId}`);
          const { initializeUserLabels } = await import("./whapi");
          const { chatbotLabelId, inquiryLabelId } = await initializeUserLabels(
            activeChannel.whapiChannelToken,
            user.chatbotLabelName || "Chatbot",
            user.inquiryLabelName || "Inquiries",
            { userId: effectiveUserId, channelId: activeChannel.id }
          );
          
          // Save the label IDs to user
          await storage.updateUser(effectiveUserId, {
            chatbotLabelId,
            inquiryLabelId,
          });
          console.log(`[Label Management] Auto-synced labels - Chatbot: ${chatbotLabelId}, Inquiries: ${inquiryLabelId}`);
        }
      }

      const updated = await storage.updateWorkflow(workflowId, { labelManagementEnabled });
      res.json(updated);
    } catch (error: any) {
      console.error("Update workflow label settings error:", error);
      res.status(500).json({ error: "Failed to update workflow label settings" });
    }
  });

  // Test send workflow node message
  app.post("/api/workflows/test-message", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { nodeType, config, phone, channelId } = req.body;

      if (!phone || !nodeType || !config || !channelId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get the specified channel
      const effectiveUserId = getEffectiveUserId(req);
      const channel = await storage.getChannel(channelId);

      if (!channel || channel.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      if (channel.status !== 'ACTIVE' || channel.authStatus !== 'AUTHORIZED') {
        return res.status(400).json({ error: "Channel must be active and authorized to send messages" });
      }

      // Build and send WHAPI interactive message based on node type
      const result = await whapi.buildAndSendNodeMessage(channel, phone, nodeType, config);

      res.json({ success: true, messageId: result.messageId });
    } catch (error: any) {
      console.error("Test message error:", error);
      res.status(500).json({ error: error.message || "Failed to send test message" });
    }
  });

  // Get workflow execution logs
  app.get("/api/workflow-logs", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      // Get user's workflows
      const userWorkflows = await storage.getWorkflowsForUser(effectiveUserId);
      const workflowIds = userWorkflows.map(w => w.id);

      if (workflowIds.length === 0) {
        return res.json([]);
      }

      // Fetch execution logs for user's workflows, ordered by most recent first
      const logs = await db
        .select({
          id: workflowExecutions.id,
          workflowId: workflowExecutions.workflowId,
          workflowName: workflows.name,
          phone: workflowExecutions.phone,
          messageType: workflowExecutions.messageType,
          triggerData: workflowExecutions.triggerData,
          responsesSent: workflowExecutions.responsesSent,
          status: workflowExecutions.status,
          errorMessage: workflowExecutions.errorMessage,
          executedAt: workflowExecutions.executedAt,
        })
        .from(workflowExecutions)
        .leftJoin(workflows, eq(workflowExecutions.workflowId, workflows.id))
        .where(inArray(workflowExecutions.workflowId, workflowIds))
        .orderBy(desc(workflowExecutions.executedAt))
        .limit(100); // Limit to last 100 logs for performance

      res.json(logs);
    } catch (error: any) {
      console.error("Get workflow logs error:", error);
      res.status(500).json({ error: "Failed to fetch workflow logs" });
    }
  });

  // Get all jobs for current user
  app.get("/api/jobs", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobs = await storage.getJobsForUser(effectiveUserId);
      res.json(jobs);
    } catch (error: any) {
      console.error("Get jobs error:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get job details with messages
  app.get("/api/jobs/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);

      if (!job || job.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Job not found" });
      }

      const messages = await storage.getMessagesForJob(jobId);
      
      // Recalculate job statistics from actual message statuses
      let queued = 0, pending = 0, sent = 0, delivered = 0, read = 0, failed = 0, replied = 0;
      
      for (const message of messages) {
        switch (message.status) {
          case "QUEUED": queued++; break;
          case "PENDING": pending++; break;
          case "SENT": sent++; break;
          case "DELIVERED": delivered++; break;
          case "READ": read++; break;
          case "FAILED": failed++; break;
          case "REPLIED": replied++; break;
        }
      }
      
      // Calculate overall job status
      // CRITICAL: PAUSED status should be preserved - never overwrite PAUSED with PROCESSING
      let jobStatus: "QUEUED" | "PENDING" | "PROCESSING" | "PAUSED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "PARTIAL" = "QUEUED";
      const total = messages.length;
      
      // IMPORTANT: If job is already PAUSED, keep it PAUSED regardless of message states
      if (job.status === "PAUSED") {
        jobStatus = "PAUSED";
      } else if (queued > 0 || pending > 0) {
        // If there are still QUEUED or PENDING messages and job is not paused, it's running
        jobStatus = "PROCESSING";
      } else if (failed === total) {
        jobStatus = "FAILED";
      } else if (failed > 0 && (delivered + read + replied + failed) === total) {
        jobStatus = "PARTIAL";
      } else if (read === total || replied > 0) {
        jobStatus = "READ";
      } else if (delivered === total) {
        jobStatus = "DELIVERED";
      } else if (sent > 0 || delivered > 0 || read > 0) {
        jobStatus = "SENT";
      }
      
      // Update job statistics if they differ from database (but only update counts, not status if PAUSED)
      const statsChanged = job.queued !== queued || job.pending !== pending || job.sent !== sent || 
          job.delivered !== delivered || job.read !== read || job.failed !== failed || 
          job.replied !== replied;
      const statusChanged = job.status !== jobStatus && job.status !== "PAUSED";
      
      if (statsChanged || statusChanged) {
        const updateData: any = {
          queued,
          pending,
          sent,
          delivered,
          read,
          failed,
          replied,
        };
        // Only update status if job is not PAUSED
        if (job.status !== "PAUSED") {
          updateData.status = jobStatus;
        }
        await storage.updateJob(jobId, updateData);
      }
      
      console.log(`[Job ${jobId}] Recalculated statistics:`, {
        queued, pending, sent, delivered, read, failed, replied, status: jobStatus
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
        messages,
      };

      res.json(response);
    } catch (error: any) {
      console.error("Get job error:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Stop (pause) a running bulk job
  app.patch("/api/jobs/:id/stop", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);

      if (!job || job.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.type !== "BULK") {
        return res.status(400).json({ error: "Only bulk jobs can be stopped" });
      }

      // Check if job is actually running by looking at messages, not just status field
      // This fixes race condition where status field hasn't been updated yet
      const messages = await storage.getMessagesForJob(jobId);
      const hasQueuedOrPending = messages.some(m => m.status === "QUEUED" || m.status === "PENDING");
      const isRunningStatus = job.status === "PROCESSING" || job.status === "QUEUED" || job.status === "PENDING";
      
      if (!hasQueuedOrPending && !isRunningStatus) {
        return res.status(400).json({ error: "Job is not running - all messages have been processed" });
      }

      await storage.updateJob(jobId, { status: "PAUSED" });
      
      console.log(`[Job ${jobId}] Paused by user ${effectiveUserId}`);
      
      res.json({ success: true, message: "Job paused successfully" });
    } catch (error: any) {
      console.error("Stop job error:", error);
      res.status(500).json({ error: "Failed to stop job" });
    }
  });

  // Resume a paused bulk job
  app.patch("/api/jobs/:id/resume", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);

      if (!job || job.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.type !== "BULK") {
        return res.status(400).json({ error: "Only bulk jobs can be resumed" });
      }

      if (job.status !== "PAUSED") {
        return res.status(400).json({ error: "Job is not paused" });
      }

      // Check for other running jobs
      const existingJobs = await storage.getJobsForUser(effectiveUserId);
      const runningJob = existingJobs.find(j => 
        j.id !== jobId &&
        j.type === "BULK" && 
        (j.status === "PROCESSING" || j.status === "QUEUED" || j.status === "PENDING")
      );
      if (runningJob) {
        return res.status(409).json({ 
          error: "You already have another running bulk campaign. Please stop it first.",
          runningJobId: runningJob.id
        });
      }

      // Get the channel for this job
      const channel = await storage.getChannel(job.channelId!);
      if (!channel || channel.status !== "ACTIVE" || !channel.whapiChannelToken) {
        return res.status(400).json({ error: "Channel is not available" });
      }

      // Update status and restart processing
      await storage.updateJob(jobId, { status: "PROCESSING" });
      
      console.log(`[Job ${jobId}] Resumed by user ${effectiveUserId}`);
      
      // Start background processing again
      processBulkJob(jobId, channel).catch(err => {
        console.error(`Bulk job ${jobId} resume processing error:`, err);
      });
      
      res.json({ success: true, message: "Job resumed successfully" });
    } catch (error: any) {
      console.error("Resume job error:", error);
      res.status(500).json({ error: "Failed to resume job" });
    }
  });

  // Delete a job (only if paused, completed, or failed)
  app.delete("/api/jobs/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);

      if (!job || job.userId !== effectiveUserId) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Don't allow deleting running jobs
      if (job.status === "PROCESSING" || job.status === "PENDING") {
        return res.status(400).json({ error: "Cannot delete a running job. Please stop it first." });
      }

      // Delete the job (messages will cascade delete)
      await storage.deleteJob(jobId);
      
      console.log(`[Job ${jobId}] Deleted by user ${effectiveUserId}`);
      
      res.json({ success: true, message: "Job deleted successfully" });
    } catch (error: any) {
      console.error("Delete job error:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================

  // Get main admin balance (admin only)
  app.get("/api/admin/balance", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const balance = await storage.getMainDaysBalance();
      res.json({ balance });
    } catch (error: any) {
      console.error("Get main balance error:", error);
      res.status(500).json({ error: "Failed to fetch main balance" });
    }
  });

  // Top up main admin balance (admin only)
  app.post("/api/admin/balance/topup", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { days, note } = req.body;

      if (!days || days < 1) {
        return res.status(400).json({ error: "Days must be at least 1" });
      }

      // Update main balance
      const newBalance = await storage.updateMainDaysBalance(days);

      // Log transaction
      await storage.createBalanceTransaction({
        type: "topup",
        days,
        channelId: null,
        userId: req.userId!,
        note: note || `Admin top-up by ${req.userId}`,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "TOPUP_BALANCE",
        meta: {
          days,
          newBalance,
          adminId: req.userId
        },
      });

      res.json({ success: true, balance: newBalance });
    } catch (error: any) {
      console.error("Top up balance error:", error);
      res.status(500).json({ error: "Failed to top up balance" });
    }
  });

  // Get balance transactions (admin only)
  app.get("/api/admin/balance/transactions", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const transactions = await storage.getBalanceTransactions(limit);

      // Enrich with user and channel data
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
            channel,
          };
        })
      );

      res.json(enrichedTransactions);
    } catch (error: any) {
      console.error("Get transactions error:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Delete balance transaction (admin only)
  app.delete("/api/admin/balance/transactions/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const transactionId = parseInt(req.params.id);
      
      if (isNaN(transactionId)) {
        return res.status(400).json({ error: "Invalid transaction ID" });
      }

      // Get the transaction before deleting to reverse its effect
      const transaction = await storage.getBalanceTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Calculate the reverse adjustment
      // TOPUP and REFUND added days to balance, so we subtract when deleting
      // ALLOCATE and ADJUSTMENT removed days from balance, so we add back when deleting
      let balanceAdjustment = 0;
      if (transaction.type === "topup" || transaction.type === "refund") {
        balanceAdjustment = -transaction.days; // Subtract the added days
      } else if (transaction.type === "allocate" || transaction.type === "adjustment") {
        balanceAdjustment = transaction.days; // Add back the removed days
      }

      // Check if adjustment would result in negative balance
      const currentBalance = await storage.getMainDaysBalance();
      if (currentBalance + balanceAdjustment < 0) {
        return res.status(400).json({ 
          error: `Cannot delete transaction: would result in negative balance (${currentBalance + balanceAdjustment})` 
        });
      }

      // Delete the transaction
      await storage.deleteBalanceTransaction(transactionId);

      // Adjust the main balance if needed
      if (balanceAdjustment !== 0) {
        await storage.updateMainDaysBalance(balanceAdjustment);
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "DELETE_TRANSACTION",
        meta: {
          transactionId,
          transactionType: transaction.type,
          days: transaction.days,
          balanceAdjustment,
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete transaction error:", error);
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  });

  // Adjust main admin balance (admin only) - supports both add and remove
  app.post("/api/admin/balance/adjust", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { days, note } = req.body;

      if (!days || days === 0) {
        return res.status(400).json({ error: "Days must be non-zero" });
      }

      // Get current balance to check if removal is valid
      const currentBalance = await storage.getMainDaysBalance();
      const newBalance = currentBalance + days;

      if (newBalance < 0) {
        return res.status(400).json({ error: "Insufficient balance to remove days" });
      }

      // Update main balance
      const updatedBalance = await storage.updateMainDaysBalance(days);

      // Log transaction with appropriate type
      const transactionType = days > 0 ? "topup" : "adjustment";
      await storage.createBalanceTransaction({
        type: transactionType,
        days: Math.abs(days),
        channelId: null,
        userId: req.userId!,
        note: note || `Admin ${days > 0 ? 'added' : 'removed'} ${Math.abs(days)} days`,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: days > 0 ? "ADD_BALANCE" : "REMOVE_BALANCE",
        meta: {
          days,
          newBalance: updatedBalance,
          adminId: req.userId
        },
      });

      res.json({ success: true, balance: updatedBalance });
    } catch (error: any) {
      console.error("Adjust balance error:", error);
      res.status(500).json({ error: "Failed to adjust balance" });
    }
  });

  // Get all users (admin only)
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const users = await storage.getAllUsers();

      // Enrich with subscription and channel data
      const enrichedUsers = await Promise.all(
        users.map(async (user) => {
          const subscription = await storage.getActiveSubscriptionForUser(user.id);
          let currentPlan = null;
          if (subscription) {
            currentPlan = await storage.getPlan(subscription.planId);
          }
          const channels = await storage.getChannelsForUser(user.id);

          // Calculate total days remaining across all channels
          let totalChannelDays = 0;
          for (const channel of channels) {
            const daysRemaining = await storage.calculateChannelDaysRemaining(channel.id);
            totalChannelDays += daysRemaining;
          }

          // Calculate user status - only derive expired/active, respect manual status overrides
          let calculatedStatus = user.status;
          if (user.status === "active" || user.status === "expired") {
            // Only override active/expired status based on channels
            const hasActiveChannels = channels.some(c => c.status === "ACTIVE");
            calculatedStatus = hasActiveChannels ? "active" : "expired";
          }
          // Preserve banned, disabled, pending, and other manual statuses as-is

          const { passwordHash: _, ...userWithoutPassword } = user;
          return {
            ...userWithoutPassword,
            daysBalance: totalChannelDays, // Override deprecated field with calculated channel days
            status: calculatedStatus, // Override active/expired based on channels, preserve manual overrides
            currentPlan,
            activeSubscription: subscription, // Include subscription for page access overrides
            channelsUsed: channels.length,
            channelsLimit: currentPlan?.channelsLimit || 0,
          };
        })
      );

      res.json(enrichedUsers);
    } catch (error: any) {
      console.error("Get users error:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Add days to user balance (admin only) - NOTE: This is for user balance pool only, NOT channel activation
  // For channel activation with WHAPI integration, use /api/admin/users/:userId/channels/:channelId/activate
  app.post("/api/admin/users/:id/add-days", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
        status: "active",
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "ADD_DAYS",
        meta: {
          entity: "user",
          entityId: userId,
          days,
          adminId: req.userId
        },
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Add days error:", error);
      res.status(500).json({ error: "Failed to add days" });
    }
  });

  // Remove days from user balance (admin only) - NOTE: This is for user balance pool only
  app.post("/api/admin/users/:id/remove-days", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
        status: newBalance <= 0 ? "expired" : user.status,
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "REMOVE_DAYS",
        meta: {
          entity: "user",
          entityId: userId,
          days,
          adminId: req.userId
        },
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Remove days error:", error);
      res.status(500).json({ error: "Failed to remove days" });
    }
  });

  // Get user channels (admin only)
  app.get("/api/admin/users/:userId/channels", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const channels = await storage.getChannelsForUser(userId);
      res.json(channels);
    } catch (error: any) {
      console.error("Get user channels error:", error);
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  // Add days to channel (admin only) - activates/extends channel with days from main admin balance
  app.post("/api/admin/users/:userId/channels/:channelId/activate", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const channelId = parseInt(req.params.channelId);
      const { days } = req.body;

      if (!days || days < 1) {
        return res.status(400).json({ error: "Days must be at least 1" });
      }

      // Check main admin balance
      const mainBalance = await storage.getMainDaysBalance();
      if (mainBalance < days) {
        return res.status(400).json({ 
          error: "Insufficient main balance", 
          details: `Main balance has ${mainBalance} days available. Top up in Admin → Balances.` 
        });
      }

      // Get channel and verify ownership
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) {
        return res.status(404).json({ error: "Channel not found" });
      }

      // Get user for audit log
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Deduct from main balance first
      const newMainBalance = await storage.updateMainDaysBalance(-days);

      // Create balance transaction
      const balanceTransaction = await storage.createBalanceTransaction({
        type: "allocate",
        days,
        channelId,
        userId,
        note: `Admin allocated ${days} days to ${user.email}'s channel`,
      });

      // Call WHAPI API - create for PENDING channels, extend for existing ones
      let whapiResponse = null;
      try {
        if (!channel.whapiChannelId && channel.status === "PENDING") {
          // PENDING channel - create new WHAPI channel
          console.log("Creating new WHAPI channel for", channel.label);
          whapiResponse = await whapi.createWhapiChannel(channel.label, channel.phone);
          
          // Store WHAPI metadata
          await storage.updateChannel(channelId, {
            whapiChannelId: whapiResponse.id,
            whapiChannelToken: whapiResponse.token,
            phone: whapiResponse.phone || channel.phone,
            whapiStatus: whapiResponse.status,
            stopped: whapiResponse.stopped || false,
            creationTS: whapiResponse.creationTS ? new Date(whapiResponse.creationTS) : null,
            activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null,
          });
        } else if (channel.whapiChannelId) {
          // Existing channel - extend days
          console.log("Extending WHAPI channel", channel.whapiChannelId);
          whapiResponse = await whapi.extendWhapiChannel(channel.whapiChannelId, days, `Admin add days for ${user.email}`);
        }
      } catch (whapiError: any) {
        console.error("WHAPI API failed:", whapiError.message);
        
        // Rollback: refund to main balance and delete the balance transaction
        await storage.updateMainDaysBalance(days);
        await storage.deleteBalanceTransaction(balanceTransaction.id);
        
        // Check if Partner account has insufficient days (402 error)
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

      // Add days to channel (this automatically activates/extends the channel)
      const { updatedChannel } = await storage.addDaysToChannel({
        channelId,
        days,
        source: "ADMIN_MANUAL",
        balanceTransactionId: balanceTransaction.id,
        metadata: {
          adminId: req.userId,
          targetUserEmail: user.email,
        },
      });

      // Update WHAPI status if we got a response
      if (whapiResponse) {
        await storage.updateChannel(channelId, {
          whapiStatus: whapiResponse.status,
          activeTill: whapiResponse.activeTill ? new Date(whapiResponse.activeTill) : null,
        });
      }

      // Update user status to "active" if they have any active channels
      const userChannels = await storage.getChannelsForUser(userId);
      const hasActiveChannels = userChannels.some(c => c.status === "ACTIVE");
      if (hasActiveChannels && user.status === "expired") {
        await storage.updateUser(userId, { status: "active" });
        console.log(`Updated user ${user.email} status from expired to active`);
      }

      // Create audit log
      await storage.createAuditLog({
        actorUserId: req.userId!,
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
          userStatusUpdated: hasActiveChannels && user.status === "expired",
        },
      });

      res.json({ 
        success: true, 
        channel: await storage.getChannel(channelId), 
        mainBalance: newMainBalance 
      });
    } catch (error: any) {
      console.error("Add days to channel error:", error);
      res.status(500).json({ error: "Failed to add days to channel" });
    }
  });

  // Ban user (admin only)
  app.post("/api/admin/users/:id/ban", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
        actorUserId: req.userId!,
        targetType: "user",
        targetId: userId,
        action: "BAN_USER",
        reason: reason || null,
        meta: { email: user.email, adminId: req.userId },
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Ban user error:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  });

  // Unban user (admin only)
  app.post("/api/admin/users/:id/unban", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine new status based on active subscription
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      const newStatus = subscription ? "active" : "expired";
      const updated = await storage.updateUser(userId, { status: newStatus });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "user",
        targetId: userId,
        action: "UNBAN_USER",
        meta: { email: user.email, newStatus, hasActiveSubscription: !!subscription, adminId: req.userId },
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Unban user error:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  });

  // Impersonate user (admin only)
  app.post("/api/admin/impersonate/:userId", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = parseInt(req.params.userId);
      
      // Prevent impersonating yourself
      if (targetUserId === req.userId) {
        return res.status(400).json({ error: "You cannot impersonate yourself" });
      }

      // Get target user
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Don't allow impersonating other admins
      if (targetUser.role === "admin") {
        return res.status(403).json({ error: "Cannot impersonate other administrators" });
      }

      // Create audit log
      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "user",
        targetId: targetUserId,
        action: "IMPERSONATE_USER",
        meta: { 
          targetUserEmail: targetUser.email,
          targetUserName: targetUser.name,
          adminId: req.userId 
        },
      });

      // Generate new token with impersonation
      const token = generateToken(req.userId!, targetUserId);
      
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({ 
        success: true, 
        impersonatedUser: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
        }
      });
    } catch (error: any) {
      console.error("Impersonate user error:", error);
      res.status(500).json({ error: "Failed to impersonate user" });
    }
  });

  // Exit impersonation (return to admin account)
  app.post("/api/admin/exit-impersonation", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Only works if currently impersonating
      if (!req.isImpersonating || !req.impersonatedUser) {
        return res.status(400).json({ error: "Not currently impersonating" });
      }

      // Create audit log
      await storage.createAuditLog({
        actorUserId: req.userId!, // req.userId is the admin ID during impersonation
        targetType: "user",
        targetId: req.impersonatedUser.id, // The user that was being impersonated
        action: "EXIT_IMPERSONATION",
        meta: { adminId: req.userId },
      });

      // Generate new token without impersonation (just admin)
      const token = generateToken(req.userId!);
      
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Exit impersonation error:", error);
      res.status(500).json({ error: "Failed to exit impersonation" });
    }
  });

  // Update user subscription overrides (admin only)
  app.patch("/api/admin/users/:id/overrides", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { 
        dailyMessagesLimit, bulkMessagesLimit, channelsLimit, chatbotsLimit, 
        phonebookLimit, captureSequenceLimit, pageAccess,
        autoExtendEnabled, skipFriday, skipSaturday,
        labelManagementAllowed
      } = req.body;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get active subscription
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      // Build overrides object for subscription
      const overrides: any = {};
      if (dailyMessagesLimit !== undefined) overrides.dailyMessagesLimit = dailyMessagesLimit;
      if (bulkMessagesLimit !== undefined) overrides.bulkMessagesLimit = bulkMessagesLimit;
      if (channelsLimit !== undefined) overrides.channelsLimit = channelsLimit;
      if (chatbotsLimit !== undefined) overrides.chatbotsLimit = chatbotsLimit;
      if (phonebookLimit !== undefined) overrides.phonebookLimit = phonebookLimit;
      if (captureSequenceLimit !== undefined) overrides.captureSequenceLimit = captureSequenceLimit;
      if (pageAccess !== undefined) overrides.pageAccess = pageAccess;
      if (autoExtendEnabled !== undefined) overrides.autoExtendEnabled = autoExtendEnabled;
      if (skipFriday !== undefined) overrides.skipFriday = skipFriday;
      if (skipSaturday !== undefined) overrides.skipSaturday = skipSaturday;

      console.log(`[/api/admin/users/:id/overrides] Saving pageAccess for user ${userId}:`, JSON.stringify(pageAccess));
      console.log(`[/api/admin/users/:id/overrides] Full overrides object:`, JSON.stringify(overrides));

      // Update subscription with overrides
      await storage.updateSubscription(subscription.id, overrides);
      
      // Update user-level settings (labelManagementAllowed is on users table)
      if (labelManagementAllowed !== undefined) {
        await storage.updateUser(userId, { labelManagementAllowed });
        console.log(`[/api/admin/users/:id/overrides] Updated labelManagementAllowed to ${labelManagementAllowed} for user ${userId}`);
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "subscription",
        targetId: subscription.id,
        action: "UPDATE_OVERRIDES",
        meta: { userId, email: user.email, overrides, adminId: req.userId },
      });

      res.json({ success: true, subscription: await storage.getActiveSubscriptionForUser(userId) });
    } catch (error: any) {
      console.error("Update overrides error:", error);
      res.status(500).json({ error: "Failed to update overrides" });
    }
  });

  // Delete channel via WHAPI (admin only)
  app.delete("/api/admin/channels/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const channelId = parseInt(req.params.id);

      const channel = await storage.getChannel(channelId);
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }

      const user = await storage.getUser(channel.userId);

      // Step 1: Try to delete from WHAPI
      let whapiDeleteSuccess = false;
      let whapiError = null;
      
      if (channel.whapiChannelId) {
        try {
          await whapi.deleteWhapiChannel(channel.whapiChannelId);
          whapiDeleteSuccess = true;
        } catch (error: any) {
          whapiError = error.message;
          // 404 means already deleted, treat as success
          if (error.message?.includes("404") || error.message?.includes("not found")) {
            whapiDeleteSuccess = true;
          } else {
            // Network/auth errors - do not proceed with local deletion
            return res.status(500).json({ 
              error: "Failed to delete channel from provider",
              details: whapiError
            });
          }
        }
      } else {
        // No WHAPI channel ID, just delete locally
        whapiDeleteSuccess = true;
      }

      // Step 2: Calculate days to return
      const daysToReturn = channel.daysRemaining || 0;

      // Step 3: Return days to admin balance
      if (daysToReturn > 0) {
        await storage.updateMainDaysBalance(daysToReturn);
        
        await storage.createBalanceTransaction({
          type: "refund",
          days: daysToReturn,
          channelId: channel.id,
          userId: channel.userId,
          note: `Channel deleted by admin - ${daysToReturn} days returned to main balance`,
        });
      }

      // Step 4: Delete channel locally
      await storage.deleteChannel(channelId);

      // Step 5: Audit log
      await storage.createAuditLog({
        actorUserId: req.userId!,
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
          adminId: req.userId,
        },
      });

      res.json({ 
        success: true, 
        daysReturned: daysToReturn,
        mainBalance: await storage.getMainDaysBalance()
      });
    } catch (error: any) {
      console.error("Delete channel error:", error);
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });

  // Get effective limits for a user (admin only)
  app.get("/api/admin/users/:id/effective-limits", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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

      // Merge plan limits with subscription overrides
      const effectiveLimits = {
        dailyMessagesLimit: subscription.dailyMessagesLimit ?? plan.dailyMessagesLimit,
        bulkMessagesLimit: subscription.bulkMessagesLimit ?? plan.bulkMessagesLimit,
        channelsLimit: subscription.channelsLimit ?? plan.channelsLimit,
        chatbotsLimit: subscription.chatbotsLimit ?? plan.chatbotsLimit,
        pageAccess: {
          ...(typeof plan.pageAccess === 'object' && plan.pageAccess !== null ? plan.pageAccess : {}),
          ...(typeof subscription.pageAccess === 'object' && subscription.pageAccess !== null ? subscription.pageAccess : {})
        }
      };

      res.json(effectiveLimits);
    } catch (error: any) {
      console.error("Get effective limits error:", error);
      res.status(500).json({ error: "Failed to get effective limits" });
    }
  });

  // Get workflows for a specific user (admin only)
  app.get("/api/admin/users/:id/workflows", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const workflows = await storage.getWorkflowsForUser(userId);
      
      // Return only essential fields needed for webhook display
      const workflowData = workflows.map(w => ({
        id: w.id,
        name: w.name,
        webhookToken: w.webhookToken,
        isActive: w.isActive
      }));
      
      res.json(workflowData);
    } catch (error: any) {
      console.error("Get user workflows error:", error);
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });

  // Get offline payments (admin only)
  app.get("/api/admin/offline-payments", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const payments = await storage.getOfflinePayments();

      // Enrich with user and plan data
      const enrichedPayments = await Promise.all(
        payments.map(async (payment) => {
          const user = await storage.getUser(payment.userId);
          const plan = await storage.getPlan(payment.planId);
          return {
            ...payment,
            user: user ? { id: user.id, name: user.name, email: user.email } : null,
            plan: plan ? { id: plan.id, name: plan.name } : null,
          };
        })
      );

      res.json(enrichedPayments);
    } catch (error: any) {
      console.error("Get offline payments error:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // Approve offline payment (admin only)
  app.post("/api/admin/offline-payments/:id/approve", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const paymentId = parseInt(req.params.id);
      const payment = await storage.getOfflinePayment(paymentId);

      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      // Update payment status
      await storage.updateOfflinePayment(paymentId, { status: "APPROVED" });

      // Get plan
      const plan = await storage.getPlan(payment.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Update user status to active
      await storage.updateUser(payment.userId, { status: "active" });

      // Get coupon if one was applied
      let couponId: number | undefined;
      if (payment.couponCode) {
        const coupon = await storage.getCouponByCode(payment.couponCode);
        if (coupon) {
          couponId = coupon.id;
          // Increment coupon usage count
          await storage.updateCoupon(coupon.id, {
            usedCount: coupon.usedCount + 1,
          });
        }
      }

      // Create subscription (coupon linked for first payment period only)
      await storage.createSubscription({
        userId: payment.userId,
        planId: payment.planId,
        couponId: couponId, // Link coupon to subscription (one-time discount)
        status: "ACTIVE",
        durationType: "MONTHLY",
        provider: "OFFLINE",
        transactionId: payment.reference,
        termsVersion: payment.termsVersion,
        agreedAt: payment.createdAt, // Use payment creation time as terms agreement time
      });

      // Get payment type for audit log
      const paymentType = (payment as any).type || "OFFLINE_PAYMENT";
      
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "APPROVE_PAYMENT",
        meta: {
          entity: "offline_payment",
          entityId: paymentId,
          paymentType,
          adminId: req.userId
        },
      });

      res.json({ success: true, message: "Payment approved. Channel is now active. Admin can add days manually." });
    } catch (error: any) {
      console.error("Approve payment error:", error);
      res.status(500).json({ error: "Failed to approve payment" });
    }
  });

  // Reject offline payment (admin only)
  app.post("/api/admin/offline-payments/:id/reject", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const paymentId = parseInt(req.params.id);
      const payment = await storage.getOfflinePayment(paymentId);

      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      await storage.updateOfflinePayment(paymentId, { status: "REJECTED" });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "REJECT_PAYMENT",
        meta: {
          entity: "offline_payment",
          entityId: paymentId,
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Reject payment error:", error);
      res.status(500).json({ error: "Failed to reject payment" });
    }
  });

  // Delete offline payment (admin only)
  app.delete("/api/admin/offline-payments/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const paymentId = parseInt(req.params.id);
      const payment = await storage.getOfflinePayment(paymentId);

      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      // Permanently delete from database
      await storage.deleteOfflinePayment(paymentId);

      await storage.createAuditLog({
        actorUserId: req.userId!,
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
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete payment error:", error);
      res.status(500).json({ error: "Failed to delete payment" });
    }
  });

  // ============================================================================
  // PLAN REQUESTS (Quote/Demo)
  // ============================================================================

  // Submit plan request (public route - no auth required)
  app.post("/api/plan-requests", async (req: Request, res: Response) => {
    try {
      const data = insertPlanRequestSchema.parse(req.body);
      
      // Validate business email (not free email providers)
      const freeEmailProviders = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
        'yandex.com', 'zoho.com', 'gmx.com'
      ];
      
      const emailDomain = data.businessEmail.split('@')[1]?.toLowerCase();
      if (freeEmailProviders.includes(emailDomain)) {
        return res.status(400).json({ 
          error: "Please use a business email address (not a free email provider)" 
        });
      }

      const request = await storage.createPlanRequest(data);
      res.json(request);
    } catch (error: any) {
      console.error("Create plan request error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // Get plan requests (admin only)
  app.get("/api/admin/plan-requests", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const requests = await storage.getPlanRequests(status);

      // Enrich with plan data
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const plan = await storage.getPlan(request.planId);
          return {
            ...request,
            plan: plan ? { id: plan.id, name: plan.name, requestType: plan.requestType } : null,
          };
        })
      );

      res.json(enrichedRequests);
    } catch (error: any) {
      console.error("Get plan requests error:", error);
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Update plan request status (admin only)
  app.patch("/api/admin/plan-requests/:id/status", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
        actorUserId: req.userId!,
        action: "UPDATE_PLAN_REQUEST",
        meta: {
          entity: "plan_request",
          entityId: requestId,
          newStatus: status,
        },
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Update plan request error:", error);
      res.status(500).json({ error: "Failed to update request" });
    }
  });

  // ============================================================================
  // WHAPI SETTINGS
  // ============================================================================

  // Get WHAPI settings
  app.get("/api/whapi/settings", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const partnerToken = process.env.WHAPI_PARTNER_TOKEN || 
        (await storage.getSetting("whapi_partner_token"))?.value || "";
      const baseUrl = process.env.WHAPI_BASE || 
        (await storage.getSetting("whapi_base_url"))?.value || 
        "https://manager.whapi.cloud";
      const projectId = process.env.WHAPI_PROJECT_ID ||
        (await storage.getSetting("whapi_project_id"))?.value ||
        "";

      res.json({
        partnerToken: partnerToken ? "***" + partnerToken.slice(-4) : "", // Mask token
        baseUrl,
        projectId,
      });
    } catch (error: any) {
      console.error("Get WHAPI settings error:", error);
      res.status(500).json({ error: "Failed to get WHAPI settings" });
    }
  });

  // Update WHAPI settings
  app.put("/api/whapi/settings", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const settingsSchema = z.object({
        partnerToken: z.string().min(1).optional(),
        baseUrl: z.string().url().optional(),
        projectId: z.string().min(1).optional(),
      });

      const validationResult = settingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten(),
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
        actorUserId: req.userId!,
        action: "UPDATE_WHAPI_SETTINGS",
        meta: {
          entity: "settings",
          entityId: null,
          hasToken: !!partnerToken,
          baseUrl,
          hasProjectId: !!projectId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update WHAPI settings error:", error);
      res.status(500).json({ error: "Failed to update WHAPI settings" });
    }
  });

  // Test WHAPI connection
  app.post("/api/whapi/test", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { testWhapiConnection } = await import("./whapi");
      const result = await testWhapiConnection();
      res.json(result);
    } catch (error: any) {
      console.error("Test WHAPI connection error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============================================================================
  // ADMIN PLAN MANAGEMENT
  // ============================================================================

  // Get all plans (admin view - includes unpublished)
  app.get("/api/admin/plans", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const allPlans = await storage.getPlans();
      res.json(allPlans);
    } catch (error: any) {
      console.error("Get admin plans error:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  // Create new plan
  app.post("/api/admin/plans", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = insertPlanSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten(),
        });
      }

      const plan = await storage.createPlan(validationResult.data);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "plan",
        targetId: plan.id,
        action: "CREATE_PLAN",
        meta: { planName: plan.name },
      });

      res.json(plan);
    } catch (error: any) {
      console.error("Create plan error:", error);
      res.status(500).json({ error: "Failed to create plan" });
    }
  });

  // Update plan
  app.put("/api/admin/plans/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      
      console.log("[PlanUpdate] Received request body keys:", Object.keys(req.body));
      console.log("[PlanUpdate] isPopular in request:", req.body.isPopular);
      console.log("[PlanUpdate] enabledBillingPeriods in request:", req.body.enabledBillingPeriods);
      console.log("[PlanUpdate] Discount percentages:", {
        quarterly: req.body.quarterlyDiscountPercent,
        semiAnnual: req.body.semiAnnualDiscountPercent,
        annual: req.body.annualDiscountPercent,
      });
      
      const plan = await storage.updatePlan(planId, req.body);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      console.log("[PlanUpdate] After update, plan.isPopular:", plan.isPopular);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "plan",
        targetId: plan.id,
        action: "UPDATE_PLAN",
        meta: { planName: plan.name, changes: req.body },
      });

      res.json(plan);
    } catch (error: any) {
      console.error("Update plan error:", error);
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  // Duplicate plan
  app.post("/api/admin/plans/:id/duplicate", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      
      const original = await storage.getPlan(planId);
      if (!original) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // When duplicating, remove PayPal from payment methods since PayPal Plan ID must be unique
      // Admin will need to add PayPal and set a new PayPal Plan ID if needed
      const originalPaymentMethods = Array.isArray(original.paymentMethods) 
        ? original.paymentMethods as string[]
        : [];
      const duplicatePaymentMethods = originalPaymentMethods.filter((method: string) => method !== "paypal");
      
      const duplicated = await storage.createPlan({
        name: `${original.name} (Copy)`,
        currency: original.currency,
        price: original.price,
        displayCurrency: (original as any).displayCurrency,
        displayPrice: (original as any).displayPrice,
        billingPeriod: original.billingPeriod,
        requestType: original.requestType,
        paymentMethods: duplicatePaymentMethods as any, // Remove PayPal - admin must add with new Plan ID
        paypalPlanId: null, // Reset PayPal Plan ID for duplicates (must be unique per plan)
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
        pageAccess: original.pageAccess as any,
        features: original.features as any,
        quarterlyDiscountPercent: original.quarterlyDiscountPercent,
        semiAnnualDiscountPercent: original.semiAnnualDiscountPercent,
        annualDiscountPercent: original.annualDiscountPercent,
        enabledBillingPeriods: original.enabledBillingPeriods as any,
        isPopular: false, // Reset popular flag for duplicates
      });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "plan",
        targetId: duplicated.id,
        action: "DUPLICATE_PLAN",
        meta: { originalPlanId: planId, newPlanName: duplicated.name },
      });

      res.json(duplicated);
    } catch (error: any) {
      console.error("Duplicate plan error:", error);
      res.status(500).json({ error: "Failed to duplicate plan" });
    }
  });

  // Toggle publish status
  app.patch("/api/admin/plans/:id/publish", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      const { published } = req.body;
      
      const plan = await storage.updatePlan(planId, { published });
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "plan",
        targetId: plan.id,
        action: published ? "PUBLISH_PLAN" : "UNPUBLISH_PLAN",
        meta: { planName: plan.name },
      });

      res.json(plan);
    } catch (error: any) {
      console.error("Toggle plan publish error:", error);
      res.status(500).json({ error: "Failed to toggle plan publish status" });
    }
  });

  // Delete plan
  app.delete("/api/admin/plans/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
          actorUserId: req.userId!,
          targetType: "plan",
          targetId: planId,
          action: "DELETE_PLAN",
          meta: { planName: plan.name },
        });

        res.json({ success: true });
      } catch (deleteError: any) {
        if (deleteError.code === '23503') {
          console.log(`[DELETE Plan] Cannot delete plan ${planId} - has related records`);
          return res.status(400).json({ 
            error: "Cannot delete this plan because it has active subscriptions, offline payments, or plan requests. Please remove or reassign those first." 
          });
        }
        throw deleteError;
      }
    } catch (error: any) {
      console.error("Delete plan error:", error);
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });

  // ============================================================================
  // ADMIN COUPON MANAGEMENT
  // ============================================================================

  // Get all coupons
  app.get("/api/admin/coupons", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const coupons = await storage.getCoupons();
      res.json(coupons);
    } catch (error: any) {
      console.error("Get coupons error:", error);
      res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });

  // Create new coupon
  app.post("/api/admin/coupons", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      console.log("Creating coupon with data:", JSON.stringify(req.body, null, 2));
      const validationResult = insertCouponSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error("Coupon validation failed:", JSON.stringify(validationResult.error.flatten(), null, 2));
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten(),
        });
      }

      const coupon = await storage.createCoupon(validationResult.data);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "coupon",
        targetId: coupon.id,
        action: "CREATE_COUPON",
        meta: { code: coupon.code, discountPercent: coupon.discountPercent },
      });

      res.json(coupon);
    } catch (error: any) {
      console.error("Create coupon error:", error);
      if (error.code === "23505") {
        return res.status(400).json({ error: "Coupon code already exists" });
      }
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  // Update coupon
  app.patch("/api/admin/coupons/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
        actorUserId: req.userId!,
        targetType: "coupon",
        targetId: coupon.id,
        action: "UPDATE_COUPON",
        meta: { code: coupon.code, changes: req.body },
      });

      res.json(coupon);
    } catch (error: any) {
      console.error("Update coupon error:", error);
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  // Delete coupon
  app.delete("/api/admin/coupons/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const couponId = parseInt(req.params.id);
      
      const coupon = await storage.getCoupon(couponId);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      await storage.deleteCoupon(couponId);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "coupon",
        targetId: couponId,
        action: "DELETE_COUPON",
        meta: { code: coupon.code },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete coupon error:", error);
      res.status(500).json({ error: "Failed to delete coupon" });
    }
  });

  // Validate coupon (public endpoint for users)
  app.post("/api/validate-coupon", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { code, planId } = req.body;
      
      if (!code || !planId) {
        return res.status(400).json({ error: "Code and planId are required" });
      }

      const result = await storage.validateCoupon(code, req.userId!, planId);
      res.json(result);
    } catch (error: any) {
      console.error("Validate coupon error:", error);
      res.status(500).json({ error: "Failed to validate coupon" });
    }
  });

  // Validate coupon (alternate endpoint for frontend consistency)
  app.post("/api/coupons/validate", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { code, planId } = req.body;
      
      if (!code || !planId) {
        return res.status(400).json({ error: "Code and planId are required" });
      }

      const result = await storage.validateCoupon(code, req.userId!, planId);
      console.log("Coupon validation result:", JSON.stringify(result, null, 2));
      res.json(result);
    } catch (error: any) {
      console.error("Validate coupon error:", error);
      res.status(500).json({ error: "Failed to validate coupon" });
    }
  });

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  // Helper function to manage chat labels asynchronously (fire-and-forget)
  async function handleChatLabelAsync(
    userId: number,
    workflowId: number,
    channelToken: string,
    chatId: string,
    labelType: 'chatbot' | 'inquiry'
  ) {
    try {
      // Get user settings
      const user = await storage.getUser(userId);
      if (!user || !user.labelManagementAllowed) {
        return; // Label management disabled for this user by admin
      }
      
      // Check if label management is enabled at plan level
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      if (!subscription) {
        return; // No subscription
      }
      const plan = await storage.getPlan(subscription.planId);
      if (!plan || !(plan as any).labelManagementEnabled) {
        return; // Label management not enabled in plan
      }
      
      // Get workflow settings
      const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
      if (!workflow || !workflow.labelManagementEnabled) {
        return; // Label management not enabled for this workflow
      }
      
      // Check if labels are configured
      if (!user.chatbotLabelId && !user.inquiryLabelId) {
        return; // Labels not synced yet
      }
      
      // Call the async label manager (fire-and-forget)
      const { manageChatLabelAsync } = await import("./whapi");
      manageChatLabelAsync(
        channelToken,
        chatId,
        labelType,
        user.chatbotLabelId,
        user.inquiryLabelId,
        { 
          userId, 
          chatbotLabelName: user.chatbotLabelName || "Chatbot",
          inquiryLabelName: user.inquiryLabelName || "Inquiries"
        }
      );
    } catch (error: any) {
      console.error(`[Label Management] Error in handleChatLabelAsync: ${error.message}`);
      // Don't throw - label management should never block chatbot functionality
    }
  }

  // WHAPI incoming message webhook (user-specific)
  app.post("/webhooks/whapi/:userId/:webhookToken", async (req: Request, res: Response) => {
    try {
      const { userId, webhookToken } = req.params;
      const webhookPayload = req.body;

      // CRITICAL: Log the raw webhook payload for debugging
      console.log(`\n${"=".repeat(80)}`);
      console.log(`[WORKFLOW WEBHOOK] Received for user ${userId} at ${new Date().toISOString()}`);
      console.log(`[WORKFLOW WEBHOOK] Token: ${webhookToken.substring(0, 8)}...`);
      console.log(`[WORKFLOW WEBHOOK] Full token: ${webhookToken}`);
      console.log(`[WORKFLOW WEBHOOK] Event type: ${webhookPayload.event?.type || 'unknown'}`);
      
      // Log message details if present
      const msg = webhookPayload.messages?.[0];
      if (msg) {
        console.log(`[WORKFLOW WEBHOOK] Message type: ${msg.type}`);
        console.log(`[WORKFLOW WEBHOOK] Reply type: ${msg.reply?.type || 'none'}`);
        console.log(`[WORKFLOW WEBHOOK] From: ${msg.from}`);
        console.log(`[WORKFLOW WEBHOOK] Has context.quoted_id: ${!!msg.context?.quoted_id}`);
        if (msg.reply?.type === 'buttons_reply') {
          console.log(`[WORKFLOW WEBHOOK] CAROUSEL/BUTTON CLICK DETECTED!`);
          console.log(`[WORKFLOW WEBHOOK] Button ID: ${msg.reply.buttons_reply?.id}`);
          console.log(`[WORKFLOW WEBHOOK] Button title: ${msg.reply.buttons_reply?.title}`);
        }
        if (msg.reply?.type === 'list_reply') {
          console.log(`[WORKFLOW WEBHOOK] LIST CLICK DETECTED!`);
          console.log(`[WORKFLOW WEBHOOK] List ID: ${msg.reply.list_reply?.id}`);
          console.log(`[WORKFLOW WEBHOOK] List title: ${msg.reply.list_reply?.title}`);
        }
      }
      
      console.log(`[WORKFLOW WEBHOOK] Full payload:`, JSON.stringify(webhookPayload, null, 2));
      console.log(`${"=".repeat(80)}\n`);

      // Validate user and get workflow (active or inactive)
      const workflow = await db
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.userId, parseInt(userId)),
            eq(workflows.webhookToken, webhookToken)
          )
        )
        .limit(1);

      if (!workflow || workflow.length === 0) {
        // Log more details about why the token is invalid
        console.error(`[WORKFLOW WEBHOOK] INVALID TOKEN!`);
        console.error(`[WORKFLOW WEBHOOK] User ID: ${userId}, Token: ${webhookToken}`);
        
        // Check if user has ANY workflows to help debug
        const userWorkflows = await db
          .select({ id: workflows.id, name: workflows.name, token: workflows.webhookToken })
          .from(workflows)
          .where(eq(workflows.userId, parseInt(userId)));
        
        console.error(`[WORKFLOW WEBHOOK] User ${userId} has ${userWorkflows.length} workflows with tokens:`);
        userWorkflows.forEach((wf, idx) => {
          console.error(`  [${idx + 1}] Workflow "${wf.name}" (ID: ${wf.id}): ${wf.token?.substring(0, 8)}...${wf.token?.slice(-4)}`);
        });
        
        return res.status(401).json({ error: "Invalid webhook token" });
      }

      const workflowRecord = workflow[0];
      
      // If workflow is not active, log but don't send responses
      if (!workflowRecord.isActive) {
        console.log(`Workflow ${workflowRecord.id} is inactive. Logging message but not sending responses.`);
        
        // Log the webhook for debugging purposes
        await db.insert(workflowExecutions).values({
          workflowId: workflowRecord.id,
          phone: webhookPayload.messages?.[0]?.from || "unknown",
          messageType: "other",
          triggerData: webhookPayload,
          responsesSent: [],
          status: "SUCCESS",
          errorMessage: "Workflow inactive - message logged only",
        });
        
        return res.json({ success: true, message: "Workflow is inactive. Message logged only." });
      }

      const activeWorkflow = workflowRecord;

      // Extract message data from WHAPI webhook payload
      // WHAPI sends: { messages: [{ from, type, text: {body}, button: {id} }] }
      const incomingMessage = webhookPayload.messages?.[0];
      
      if (!incomingMessage) {
        return res.json({ success: true, message: "No message to process" });
      }

      // CRITICAL: Ignore outbound messages (from_me === true)
      // Only process inbound user messages
      if (incomingMessage.from_me === true) {
        console.log("Ignoring outbound message (from_me === true)");
        return res.json({ success: true, message: "Outbound message ignored" });
      }

      // CRITICAL BUG FIX: Ignore system events, status updates, and non-message webhooks
      // Only process genuine inbound messages with content
      const hasTextContent = incomingMessage.text?.body && incomingMessage.text.body.trim().length > 0;
      const hasButtonReply = incomingMessage.reply?.type === "buttons_reply" || 
                            incomingMessage.reply?.type === "list_reply" || 
                            incomingMessage.button?.id;
      
      // If no text content AND no button reply, this is likely a system event/status update
      if (!hasTextContent && !hasButtonReply) {
        console.log("Ignoring system event/status update (no text content or button reply):", {
          type: incomingMessage.type,
          hasText: !!incomingMessage.text,
          hasReply: !!incomingMessage.reply,
          hasButton: !!incomingMessage.button
        });
        return res.json({ success: true, message: "System event ignored" });
      }

      // Extract phone from chat_id (format: "PHONE@s.whatsapp.net")
      // Example: "97339116526@s.whatsapp.net" -> "97339116526"
      const chatId = incomingMessage.chat_id || "";
      const phone = chatId.split('@')[0]; // Extract phone number before @
      
      // CRITICAL: Detect and filter group messages
      // Private chats: xxxx@s.whatsapp.net
      // Group chats: xxxx@g.us
      const isGroupChat = chatId.endsWith('@g.us');
      
      if (isGroupChat) {
        console.log(`Ignoring group message from chat_id: ${chatId}`);
        return res.json({ success: true, message: "Group messages are not supported by workflows" });
      }
      
      // Determine message type and extract button/list ID
      let messageType: "text" | "button_reply" | "other" = "other";
      let rawButtonId = "";
      
      // Handle button replies (both new and legacy formats)
      if (incomingMessage.reply?.type === "buttons_reply") {
        messageType = "button_reply";
        // WHAPI format: reply.buttons_reply.id (note the 's' in buttons_reply)
        rawButtonId = incomingMessage.reply.buttons_reply?.id || "";
      } else if (incomingMessage.button?.id) {
        // Legacy format fallback
        messageType = "button_reply";
        rawButtonId = incomingMessage.button.id;
      } else if (incomingMessage.reply?.type === "list_reply") {
        messageType = "button_reply"; // Treat list replies like button replies for routing
        rawButtonId = incomingMessage.reply.list_reply?.id || "";
      } else if (incomingMessage.text) {
        messageType = "text";
      }
      
      // Extract the ID after the colon (e.g., "ButtonsV3:r1" -> "r1", "ListV3:r2" -> "r2")
      const buttonId = rawButtonId.includes(':') ? rawButtonId.split(':').pop() || "" : rawButtonId;
      
      const textBody = incomingMessage.text?.body || "";
      
      console.log(`Message type: ${messageType}, Raw ID: ${rawButtonId}, Extracted ID: ${buttonId}`);

      // ============================================================================
      // SUBSCRIBER TRACKING: Check if button title matches subscribe/unsubscribe keywords
      // ============================================================================
      if (messageType === "button_reply" && phone) {
        try {
          // Extract button title from various WHAPI formats
          let buttonTitle = "";
          
          if (incomingMessage.reply?.type === "buttons_reply") {
            buttonTitle = incomingMessage.reply.buttons_reply?.title || "";
          } else if (incomingMessage.reply?.type === "list_reply") {
            buttonTitle = incomingMessage.reply.list_reply?.title || "";
          } else if (incomingMessage.button?.text) {
            buttonTitle = incomingMessage.button.text;
          }
          
          // If we extracted a button title, check against keywords
          if (buttonTitle && buttonTitle.trim().length > 0) {
            const buttonTitleNormalized = buttonTitle.trim();
            
            // Load subscriber keywords from settings
            const keywordsSetting = await storage.getSetting("subscriber_keywords");
            const keywords = keywordsSetting?.value 
              ? JSON.parse(keywordsSetting.value) 
              : { subscribe: ["Subscribe"], unsubscribe: ["Unsubscribe"] };
            
            // Check if button title matches any subscribe keyword (case-insensitive)
            const matchesSubscribe = keywords.subscribe.some((kw: string) => 
              kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
            );
            
            // Check if button title matches any unsubscribe keyword (case-insensitive)
            const matchesUnsubscribe = keywords.unsubscribe.some((kw: string) => 
              kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
            );
            
            // If keyword matches, upsert subscriber
            if (matchesSubscribe || matchesUnsubscribe) {
              const status = matchesSubscribe ? 'subscribed' : 'unsubscribed';
              
              await storage.upsertSubscriber({
                userId: activeWorkflow.userId,
                phone: phone,
                name: "", // Default empty name, can be edited later
                status: status
              });
              
              console.log(`[Subscriber] ${phone} ${status} via button: "${buttonTitle}"`);
            }
          }
        } catch (subscriberError: any) {
          // Log error but don't fail the webhook - subscriber tracking is non-critical
          console.error(`[Subscriber] Error processing subscriber: ${subscriberError.message}`);
        }
      }

      // ============================================================================
      // BOOKING FLOW HANDLER: Process booking step responses
      // ============================================================================
      if (messageType === "button_reply" && buttonId.startsWith("booking_")) {
        try {
          console.log(`[Booking] Processing booking response: ${buttonId}`);
          
          // Get current conversation state to check booking state
          const [currentState] = await db
            .select()
            .from(conversationStates)
            .where(and(
              eq(conversationStates.phone, phone),
              eq(conversationStates.workflowId, activeWorkflow.id)
            ))
            .limit(1);
          
          if (currentState?.context && (currentState.context as any).bookingState) {
            const context = currentState.context as any;
            const bookingState = context.bookingState;
            
            // Get active channel for sending messages
            const userChannels = await storage.getChannelsForUser(activeWorkflow.userId);
            const activeChannel = userChannels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
            
            if (!activeChannel?.whapiChannelToken) {
              console.error(`[Booking] No active channel for user ${activeWorkflow.userId}`);
              return res.status(200).json({ success: true });
            }
            
            if (bookingState.step === 'select_department' && buttonId.startsWith("booking_dept_")) {
              // User selected a department - show staff list
              const deptId = parseInt(buttonId.replace("booking_dept_", ""));
              
              // SECURITY: Verify department belongs to workflow owner
              const department = await storage.getBookingDepartment(deptId);
              if (!department || department.userId !== activeWorkflow.userId) {
                console.error(`[Booking] Invalid department selection: ${deptId} for user ${activeWorkflow.userId}`);
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              const staff = await storage.getBookingStaffForDepartment(deptId);
              
              if (staff.length === 0) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, no staff available for this department.',
                });
                // Reset booking state
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Send staff selection list (using correct WHAPI format)
              const staffPromptMsg = bookingState.config?.staffPromptMessage || 'Please select a staff member:';
              const listPayload = {
                to: phone,
                type: 'list',
                body: { text: staffPromptMsg },
                action: {
                  list: {
                    sections: [{
                      title: 'Staff',
                      rows: staff.map((s: any) => ({
                        id: `booking_staff_${s.id}`,
                        title: s.name,
                        description: s.specialty || '',
                      })),
                    }],
                    label: bookingState.config?.staffButtonLabel || 'Select Staff',
                  },
                },
              };
              
              await whapi.sendInteractiveMessage(activeChannel.whapiChannelToken, listPayload);
              
              // Update booking state
              await db.update(conversationStates).set({
                context: { ...context, bookingState: { ...bookingState, step: 'select_staff', departmentId: deptId } },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, currentState.id));
              
              return res.status(200).json({ success: true });
              
            } else if (bookingState.step === 'select_staff' && buttonId.startsWith("booking_staff_")) {
              // User selected staff - show available dates
              const staffId = parseInt(buttonId.replace("booking_staff_", ""));
              
              // Verify staff belongs to user (security check)
              const staffMember = await storage.getBookingStaff(staffId);
              if (!staffMember || staffMember.departmentId !== bookingState.departmentId) {
                console.error(`[Booking] Invalid staff selection: ${staffId}`);
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Check if customer already has booking (if allowMultiple is false)
              if (!bookingState.config?.allowMultiple) {
                const existingCount = await storage.countActiveBookingsForCustomer(
                  phone, activeWorkflow.userId, bookingState.nodeId
                );
                if (existingCount > 0) {
                  await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                    to: phone,
                    body: 'You already have an active appointment. Please cancel your existing booking first.',
                  });
                  await db.update(conversationStates).set({
                    context: { ...context, bookingState: undefined },
                    updatedAt: new Date(),
                  }).where(eq(conversationStates.id, currentState.id));
                  return res.status(200).json({ success: true });
                }
              }
              
              // Get staff recurring slots (dayOfWeek based)
              const staffSlots = await storage.getBookingStaffSlots(staffId);
              const activeSlots = staffSlots.filter((s: any) => s.isActive);
              
              if (activeSlots.length === 0) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: bookingState.config?.noSlotsMessage || 'Sorry, no available time slots.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Generate available date/time combinations for next N days
              const maxSlots = bookingState.config?.maxAdvanceDays || 30;
              const startToday = bookingState.config?.startToday !== false;
              const startOffset = startToday ? 0 : 1;
              const availableDateTimes: { date: string; startTime: string; endTime: string; slotId: number }[] = [];
              
              for (let i = startOffset; availableDateTimes.length < maxSlots; i++) {
                const checkDate = dayjs().tz("Asia/Bahrain").add(i, "day");
                // Prevent infinite loop - stop after 365 days
                if (i > 365) break;
                const dateStr = checkDate.format("YYYY-MM-DD");
                const dayOfWeek = checkDate.day();
                
                // Find slots for this day of week
                for (const slot of activeSlots) {
                  if (slot.dayOfWeek === dayOfWeek) {
                    // Check availability using proper method
                    const availability = await storage.checkSlotAvailability(
                      staffId, dateStr, slot.startTime
                    );
                    if (availability.available) {
                      availableDateTimes.push({
                        date: dateStr,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        slotId: slot.id,
                      });
                    }
                  }
                }
              }
              
              if (availableDateTimes.length === 0) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: bookingState.config?.noSlotsMessage || 'Sorry, no available time slots.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Build slot rows with date-time combinations
              const slotRows = availableDateTimes.map((slot, idx) => ({
                id: `booking_slot_${slot.slotId}_${slot.date}`,
                title: `${slot.date} at ${slot.startTime}`,
                description: `${slot.startTime} - ${slot.endTime}`,
              }));
              
              const slotPromptMsg = bookingState.config?.slotPromptMessage || 'Please select an available time slot:';
              const listPayload = {
                to: phone,
                type: 'list',
                body: { text: slotPromptMsg },
                action: {
                  list: {
                    sections: [{
                      title: 'Available Times',
                      rows: slotRows,
                    }],
                    label: bookingState.config?.slotButtonLabel || 'Select Time',
                  },
                },
              };
              
              await whapi.sendInteractiveMessage(activeChannel.whapiChannelToken, listPayload);
              
              // Update booking state
              await db.update(conversationStates).set({
                context: { ...context, bookingState: { ...bookingState, step: 'select_slot', staffId } },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, currentState.id));
              
              return res.status(200).json({ success: true });
              
            } else if (bookingState.step === 'select_slot' && buttonId.startsWith("booking_slot_")) {
              // User selected slot
              // Parse ID format: booking_slot_${slotId}_${date}
              const slotParts = buttonId.replace("booking_slot_", "").split("_");
              const slotId = parseInt(slotParts[0]);
              const slotDate = slotParts.slice(1).join("_"); // Handle dates with underscores
              
              // Get slot details (recurring slot configuration)
              const slot = await storage.getBookingStaffSlot(slotId);
              
              if (!slot || slot.staffId !== bookingState.staffId) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, this slot is no longer available.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Verify slot is still available for this date
              const availability = await storage.checkSlotAvailability(
                bookingState.staffId, slotDate, slot.startTime
              );
              
              if (!availability.available) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, this slot is no longer available. It may have been taken.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // If requireName is enabled, ask for customer name before creating booking
              if (bookingState.config?.requireName) {
                const namePrompt = bookingState.config?.namePromptMessage || 
                  'Please enter your full name to complete the booking:';
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: namePrompt,
                });
                
                // Update booking state to wait for name
                await db.update(conversationStates).set({
                  context: { 
                    ...context, 
                    bookingState: { 
                      ...bookingState, 
                      step: 'enter_name', 
                      selectedSlotId: slotId,
                      selectedSlotDate: slotDate,
                      selectedStartTime: slot.startTime,
                      selectedEndTime: slot.endTime,
                    } 
                  },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                
                return res.status(200).json({ success: true });
              }
              
              // Check if custom questions are enabled (without requiring name)
              const configCheck = bookingState.config || {};
              if (configCheck.customQuestion1Enabled && configCheck.customQuestion1Prompt) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: configCheck.customQuestion1Prompt,
                });
                
                await db.update(conversationStates).set({
                  context: { 
                    ...context, 
                    bookingState: { 
                      ...bookingState, 
                      step: 'enter_custom1',
                      customerName: '',
                      selectedSlotId: slotId,
                      selectedSlotDate: slotDate,
                      selectedStartTime: slot.startTime,
                      selectedEndTime: slot.endTime,
                    } 
                  },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                
                return res.status(200).json({ success: true });
              }
              
              // No name or custom questions required - create booking immediately
              try {
                const booking = await storage.createBooking({
                  userId: activeWorkflow.userId,
                  staffId: bookingState.staffId,
                  departmentId: bookingState.departmentId,
                  customerPhone: phone,
                  customerName: '',
                  slotDate: slotDate,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  status: bookingState.config?.defaultBookingStatus || 'confirmed',
                  nodeId: bookingState.nodeId,
                  bookingLabel: bookingState.bookingLabel,
                  reminderEnabled: bookingState.config?.reminderEnabled || false,
                  reminderHoursBefore: bookingState.config?.reminderHoursBefore || 24,
                  reminderMessage: bookingState.config?.reminderMessage || null,
                  reminderSent: false,
                });
                
                // Get staff and department names for success message
                const staff = await storage.getBookingStaff(bookingState.staffId);
                const dept = await storage.getBookingDepartment(bookingState.departmentId);
                
                // Use pending message if status is pending, otherwise use success message
                const bookingStatus = bookingState.config?.defaultBookingStatus || 'confirmed';
                let messageToSend: string;
                
                if (bookingStatus === 'pending') {
                  messageToSend = bookingState.config?.pendingMessage || 
                    'Your booking request has been submitted. Our team will review and confirm your appointment soon.';
                } else {
                  messageToSend = bookingState.config?.successMessage || 
                    'Your appointment has been booked for {{date}} at {{time}}.';
                }
                
                messageToSend = messageToSend
                  .replace(/\{\{date\}\}/g, slotDate)
                  .replace(/\{\{time\}\}/g, slot.startTime)
                  .replace(/\{\{department\}\}/g, dept?.name || '')
                  .replace(/\{\{staff\}\}/g, staff?.name || '');
                
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: messageToSend,
                });
                
                // Clear booking state and continue workflow on "booked" path
                const definition = activeWorkflow.definitionJson as any;
                const bookedNodeId = getNextNodeByHandle(bookingState.nodeId, 'booked', definition.edges);
                
                await db.update(conversationStates).set({
                  currentNodeId: bookedNodeId || bookingState.nodeId,
                  context: { ...context, bookingState: undefined, lastBookingId: booking.id },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                
                console.log(`[Booking] Created booking ${booking.id} for ${phone}`);
                
              } catch (bookingError: any) {
                console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, we could not book this slot. It may no longer be available.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, bookingState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
              }
              
              return res.status(200).json({ success: true });
            }
          }
          
          // Handle CHECK BOOKINGS state (reschedule/cancel flows)
          if (currentState?.context && (currentState.context as any).checkBookingsState) {
            const context = currentState.context as any;
            const checkBookingsState = context.checkBookingsState;
            
            // Get active channel for sending messages
            const userChannels = await storage.getChannelsForUser(activeWorkflow.userId);
            const activeChannel = userChannels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
            
            if (!activeChannel?.whapiChannelToken) {
              console.error(`[Booking] No active channel for check bookings flow`);
              return res.status(200).json({ success: true });
            }
            
            // Handle RESCHEDULE booking selection
            if (checkBookingsState.step === 'select_reschedule' && buttonId.startsWith("booking_reschedule_")) {
              const bookingId = parseInt(buttonId.replace("booking_reschedule_", ""));
              console.log(`[Booking] User selected booking ${bookingId} to reschedule`);
              
              // Get the booking to verify ownership
              const booking = await storage.getBooking(bookingId);
              if (!booking || booking.customerPhone !== phone || booking.userId !== activeWorkflow.userId) {
                console.error(`[Booking] Invalid booking selection for reschedule: ${bookingId}`);
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Get available slots for the same staff member
              const staffSlots = await storage.getBookingStaffSlots(booking.staffId);
              
              if (staffSlots.length === 0) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, no available slots for rescheduling at this time.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Build available date-time combinations (next 7 days)
              const availableDateTimes: { slotId: number, date: string, startTime: string, endTime: string }[] = [];
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              
              for (let i = 0; i < 7; i++) {
                const checkDate = new Date();
                checkDate.setDate(checkDate.getDate() + i);
                const dayOfWeek = checkDate.getDay();
                const dateStr = checkDate.toISOString().split('T')[0];
                
                // Find slots for this day
                const daySlots = staffSlots.filter((s: any) => s.dayOfWeek === dayOfWeek);
                
                for (const slot of daySlots) {
                  // Check availability (capacity not reached)
                  const availabilityResult = await storage.checkSlotAvailability(booking.staffId, dateStr, slot.startTime);
                  if (availabilityResult.available) {
                    availableDateTimes.push({
                      slotId: slot.id,
                      date: dateStr,
                      startTime: slot.startTime,
                      endTime: slot.endTime,
                    });
                  }
                }
              }
              
              if (availableDateTimes.length === 0) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, no available slots for rescheduling in the next 7 days.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Build slot rows
              const slotRows = availableDateTimes.slice(0, 10).map((slot) => ({
                id: `booking_newslot_${slot.slotId}_${slot.date}`,
                title: `${slot.date} at ${slot.startTime}`,
                description: `${slot.startTime} - ${slot.endTime}`,
              }));
              
              const slotPromptMsg = checkBookingsState.config?.rescheduleSlotMessage || 'Select a new time for your appointment:';
              const slotButtonLabel = checkBookingsState.config?.rescheduleSlotButtonLabel || 'Select New Time';
              
              const listPayload = {
                to: phone,
                type: 'list',
                body: { text: slotPromptMsg },
                action: {
                  list: {
                    sections: [{
                      title: 'Available Times',
                      rows: slotRows,
                    }],
                    label: slotButtonLabel,
                  },
                },
              };
              
              await whapi.sendInteractiveMessage(activeChannel.whapiChannelToken, listPayload);
              
              // Update state with selected booking
              await db.update(conversationStates).set({
                context: { 
                  ...context, 
                  checkBookingsState: { 
                    ...checkBookingsState, 
                    step: 'select_new_slot',
                    bookingId,
                    staffId: booking.staffId,
                  } 
                },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, currentState.id));
              
              return res.status(200).json({ success: true });
            }
            
            // Handle NEW SLOT selection for reschedule
            if (checkBookingsState.step === 'select_new_slot' && buttonId.startsWith("booking_newslot_")) {
              const slotParts = buttonId.replace("booking_newslot_", "").split("_");
              const slotId = parseInt(slotParts[0]);
              const newSlotDate = slotParts.slice(1).join("_");
              
              console.log(`[Booking] Rescheduling booking ${checkBookingsState.bookingId} to slot ${slotId} on ${newSlotDate}`);
              
              // Get slot details
              const slot = await storage.getBookingStaffSlot(slotId);
              if (!slot || slot.staffId !== checkBookingsState.staffId) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, this slot is no longer available.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Check availability again
              const availabilityResult = await storage.checkSlotAvailability(checkBookingsState.staffId, newSlotDate, slot.startTime, checkBookingsState.bookingId);
              if (!availabilityResult.available) {
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, this slot is no longer available. Please try again.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Update the booking with new date/time
              try {
                await storage.updateBooking(checkBookingsState.bookingId, {
                  slotDate: newSlotDate,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                });
                
                // Get staff and department for success message
                const staff = await storage.getBookingStaff(checkBookingsState.staffId);
                const dept = staff ? await storage.getBookingDepartment(staff.departmentId) : null;
                
                let successMessage = checkBookingsState.config?.rescheduleSuccessMessage || 
                  'Your appointment has been rescheduled to {{date}} at {{time}}.';
                successMessage = successMessage
                  .replace(/\{\{date\}\}/g, newSlotDate)
                  .replace(/\{\{time\}\}/g, slot.startTime)
                  .replace(/\{\{department\}\}/g, dept?.name || '')
                  .replace(/\{\{staff\}\}/g, staff?.name || '');
                
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: successMessage,
                });
                
                // Clear state and continue to booked path
                const definition = activeWorkflow.definitionJson as any;
                const bookedNodeId = getNextNodeByHandle(checkBookingsState.nodeId, 'booked', definition.edges);
                
                await db.update(conversationStates).set({
                  currentNodeId: bookedNodeId || checkBookingsState.nodeId,
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                
                console.log(`[Booking] Rescheduled booking ${checkBookingsState.bookingId} to ${newSlotDate} at ${slot.startTime}`);
                
              } catch (updateError: any) {
                console.error(`[Booking] Failed to reschedule: ${updateError.message}`);
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, we could not reschedule your appointment. Please try again.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
              }
              
              return res.status(200).json({ success: true });
            }
            
            // Handle CANCEL booking selection
            if (checkBookingsState.step === 'select_cancel' && buttonId.startsWith("booking_cancel_")) {
              const bookingId = parseInt(buttonId.replace("booking_cancel_", ""));
              console.log(`[Booking] User selected booking ${bookingId} to cancel`);
              
              // Get the booking to verify ownership
              const booking = await storage.getBooking(bookingId);
              if (!booking || booking.customerPhone !== phone || booking.userId !== activeWorkflow.userId) {
                console.error(`[Booking] Invalid booking selection for cancel: ${bookingId}`);
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                return res.status(200).json({ success: true });
              }
              
              // Cancel the booking (update status to cancelled)
              try {
                await storage.updateBooking(bookingId, { status: 'cancelled' });
                
                // Get staff and department for cancel message
                const staff = await storage.getBookingStaff(booking.staffId);
                const dept = staff ? await storage.getBookingDepartment(staff.departmentId) : null;
                
                let cancelMessage = checkBookingsState.config?.cancelSuccessMessage || 
                  'Your appointment on {{date}} at {{time}} has been cancelled.';
                cancelMessage = cancelMessage
                  .replace(/\{\{date\}\}/g, booking.slotDate)
                  .replace(/\{\{time\}\}/g, booking.startTime)
                  .replace(/\{\{department\}\}/g, dept?.name || '')
                  .replace(/\{\{staff\}\}/g, staff?.name || '');
                
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: cancelMessage,
                });
                
                // Clear state and continue to booked path
                const definition = activeWorkflow.definitionJson as any;
                const bookedNodeId = getNextNodeByHandle(checkBookingsState.nodeId, 'booked', definition.edges);
                
                await db.update(conversationStates).set({
                  currentNodeId: bookedNodeId || checkBookingsState.nodeId,
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
                
                console.log(`[Booking] Cancelled booking ${bookingId}`);
                
              } catch (cancelError: any) {
                console.error(`[Booking] Failed to cancel booking: ${cancelError.message}`);
                await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                  to: phone,
                  body: 'Sorry, we could not cancel your appointment. Please try again.',
                });
                await db.update(conversationStates).set({
                  context: { ...context, checkBookingsState: undefined },
                  updatedAt: new Date(),
                }).where(eq(conversationStates.id, currentState.id));
              }
              
              return res.status(200).json({ success: true });
            }
          }
        } catch (bookingError: any) {
          console.error(`[Booking] Error processing booking flow: ${bookingError.message}`);
        }
      }

      // Log execution start
      const executionLog = {
        workflowId: activeWorkflow.id,
        phone,
        messageType: messageType as "text" | "button_reply" | "other",
        triggerData: webhookPayload,
        responsesSent: [] as any[],
        status: "SUCCESS" as "SUCCESS" | "ERROR",
        errorMessage: null as string | null,
      };

      try {
        // Process based on message type
        if (messageType === "text") {
          // Check if we're waiting for customer name in booking flow
          const [nameCheckState] = await db
            .select()
            .from(conversationStates)
            .where(and(
              eq(conversationStates.phone, phone),
              eq(conversationStates.workflowId, activeWorkflow.id)
            ))
            .limit(1);
          
          const nameCheckContext = (nameCheckState?.context || {}) as any;
          const nameCheckBookingState = nameCheckContext.bookingState;
          
          if (nameCheckBookingState?.step === 'enter_name') {
            // Customer is providing their name
            const customerName = incomingMessage.text?.body?.trim() || '';
            
            // Get active channel for sending messages
            const userChannelsForName = await storage.getChannelsForUser(activeWorkflow.userId);
            const activeChannelForName = userChannelsForName.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
            
            if (!activeChannelForName?.whapiChannelToken) {
              console.error(`[Booking] No active channel for name step, user ${activeWorkflow.userId}`);
              return res.status(200).json({ success: true });
            }
            
            if (customerName.length < 2) {
              // Invalid name, ask again
              await whapi.sendTextMessage(activeChannelForName.whapiChannelToken, {
                to: phone,
                body: 'Please enter a valid name (at least 2 characters).',
              });
              return res.status(200).json({ success: true });
            }
            
            // Store the name and check if we need to ask custom questions
            const config = nameCheckBookingState.config || {};
            
            // Check if custom question 1 is enabled
            if (config.customQuestion1Enabled && config.customQuestion1Prompt) {
              await whapi.sendTextMessage(activeChannelForName.whapiChannelToken, {
                to: phone,
                body: config.customQuestion1Prompt,
              });
              
              await db.update(conversationStates).set({
                context: { 
                  ...nameCheckContext, 
                  bookingState: { 
                    ...nameCheckBookingState, 
                    step: 'enter_custom1',
                    customerName: customerName,
                  } 
                },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
              
              return res.status(200).json({ success: true });
            }
            
            // No custom questions - create booking with the provided name
            try {
              const bookingStatus = nameCheckBookingState.config?.defaultBookingStatus || 'confirmed';
              const booking = await storage.createBooking({
                userId: activeWorkflow.userId,
                staffId: nameCheckBookingState.staffId,
                departmentId: nameCheckBookingState.departmentId,
                customerPhone: phone,
                customerName: customerName,
                slotDate: nameCheckBookingState.selectedSlotDate,
                startTime: nameCheckBookingState.selectedStartTime,
                endTime: nameCheckBookingState.selectedEndTime,
                status: bookingStatus,
                nodeId: nameCheckBookingState.nodeId,
                bookingLabel: nameCheckBookingState.bookingLabel,
                reminderEnabled: nameCheckBookingState.config?.reminderEnabled || false,
                reminderHoursBefore: nameCheckBookingState.config?.reminderHoursBefore || 24,
                reminderMessage: nameCheckBookingState.config?.reminderMessage || null,
                reminderSent: false,
              });
              
              // Get staff and department names for success message
              const staff = await storage.getBookingStaff(nameCheckBookingState.staffId);
              const dept = await storage.getBookingDepartment(nameCheckBookingState.departmentId);
              
              // Use pending message if status is pending, otherwise use success message
              let messageToSend: string;
              if (bookingStatus === 'pending') {
                messageToSend = nameCheckBookingState.config?.pendingMessage || 
                  'Your booking request has been submitted. Our team will review and confirm your appointment soon.';
              } else {
                messageToSend = nameCheckBookingState.config?.successMessage || 
                  'Your appointment has been booked for {{date}} at {{time}}.';
              }
              
              messageToSend = messageToSend
                .replace(/\{\{date\}\}/g, nameCheckBookingState.selectedSlotDate)
                .replace(/\{\{time\}\}/g, nameCheckBookingState.selectedStartTime)
                .replace(/\{\{department\}\}/g, dept?.name || '')
                .replace(/\{\{staff\}\}/g, staff?.name || '')
                .replace(/\{\{name\}\}/g, customerName);
              
              await whapi.sendTextMessage(activeChannelForName.whapiChannelToken, {
                to: phone,
                body: messageToSend,
              });
              
              // Clear booking state and continue workflow on "booked" path
              const definition = activeWorkflow.definitionJson as any;
              const bookedNodeId = getNextNodeByHandle(nameCheckBookingState.nodeId, 'booked', definition.edges);
              
              await db.update(conversationStates).set({
                currentNodeId: bookedNodeId || nameCheckBookingState.nodeId,
                context: { ...nameCheckContext, bookingState: undefined, lastBookingId: booking.id },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
              
              console.log(`[Booking] Created booking ${booking.id} for ${phone} with name: ${customerName}`);
              
            } catch (bookingError: any) {
              console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
              await whapi.sendTextMessage(activeChannelForName.whapiChannelToken, {
                to: phone,
                body: 'Sorry, we could not book this slot. It may no longer be available.',
              });
              await db.update(conversationStates).set({
                context: { ...nameCheckContext, bookingState: undefined },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
            }
            
            return res.status(200).json({ success: true });
          }
          
          // Handle custom question 1 entry
          if (nameCheckBookingState?.step === 'enter_custom1') {
            const customValue1 = incomingMessage.text?.body?.trim() || '';
            
            const userChannelsForQ1 = await storage.getChannelsForUser(activeWorkflow.userId);
            const activeChannelForQ1 = userChannelsForQ1.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
            
            if (!activeChannelForQ1?.whapiChannelToken) {
              console.error(`[Booking] No active channel for custom question 1`);
              return res.status(200).json({ success: true });
            }
            
            const config = nameCheckBookingState.config || {};
            
            // Check if custom question 2 is enabled
            if (config.customQuestion2Enabled && config.customQuestion2Prompt) {
              await whapi.sendTextMessage(activeChannelForQ1.whapiChannelToken, {
                to: phone,
                body: config.customQuestion2Prompt,
              });
              
              await db.update(conversationStates).set({
                context: { 
                  ...nameCheckContext, 
                  bookingState: { 
                    ...nameCheckBookingState, 
                    step: 'enter_custom2',
                    customField1Value: customValue1,
                    customField1Label: config.customQuestion1Label || 'Question 1',
                  } 
                },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
              
              return res.status(200).json({ success: true });
            }
            
            // No second question - create booking
            try {
              const bookingStatus = config.defaultBookingStatus || 'confirmed';
              const booking = await storage.createBooking({
                userId: activeWorkflow.userId,
                staffId: nameCheckBookingState.staffId,
                departmentId: nameCheckBookingState.departmentId,
                customerPhone: phone,
                customerName: nameCheckBookingState.customerName || '',
                slotDate: nameCheckBookingState.selectedSlotDate,
                startTime: nameCheckBookingState.selectedStartTime,
                endTime: nameCheckBookingState.selectedEndTime,
                status: bookingStatus,
                nodeId: nameCheckBookingState.nodeId,
                bookingLabel: nameCheckBookingState.bookingLabel,
                customField1Label: config.customQuestion1Label || 'Question 1',
                customField1Value: customValue1,
                reminderEnabled: config.reminderEnabled || false,
                reminderHoursBefore: config.reminderHoursBefore || 24,
                reminderMessage: config.reminderMessage || null,
                reminderSent: false,
              });
              
              const staff = await storage.getBookingStaff(nameCheckBookingState.staffId);
              const dept = await storage.getBookingDepartment(nameCheckBookingState.departmentId);
              
              // Use pending message if status is pending, otherwise use success message
              let messageToSend: string;
              if (bookingStatus === 'pending') {
                messageToSend = config.pendingMessage || 
                  'Your booking request has been submitted. Our team will review and confirm your appointment soon.';
              } else {
                messageToSend = config.successMessage || 
                  'Your appointment has been booked for {{date}} at {{time}}.';
              }
              
              messageToSend = messageToSend
                .replace(/\{\{date\}\}/g, nameCheckBookingState.selectedSlotDate)
                .replace(/\{\{time\}\}/g, nameCheckBookingState.selectedStartTime)
                .replace(/\{\{department\}\}/g, dept?.name || '')
                .replace(/\{\{staff\}\}/g, staff?.name || '')
                .replace(/\{\{name\}\}/g, nameCheckBookingState.customerName || '');
              
              await whapi.sendTextMessage(activeChannelForQ1.whapiChannelToken, {
                to: phone,
                body: messageToSend,
              });
              
              const definition = activeWorkflow.definitionJson as any;
              const bookedNodeId = getNextNodeByHandle(nameCheckBookingState.nodeId, 'booked', definition.edges);
              
              await db.update(conversationStates).set({
                currentNodeId: bookedNodeId || nameCheckBookingState.nodeId,
                context: { ...nameCheckContext, bookingState: undefined, lastBookingId: booking.id },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
              
              console.log(`[Booking] Created booking ${booking.id} with custom field 1`);
              
            } catch (bookingError: any) {
              console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
              await whapi.sendTextMessage(activeChannelForQ1.whapiChannelToken, {
                to: phone,
                body: 'Sorry, we could not book this slot. It may no longer be available.',
              });
              await db.update(conversationStates).set({
                context: { ...nameCheckContext, bookingState: undefined },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
            }
            
            return res.status(200).json({ success: true });
          }
          
          // Handle custom question 2 entry
          if (nameCheckBookingState?.step === 'enter_custom2') {
            const customValue2 = incomingMessage.text?.body?.trim() || '';
            
            const userChannelsForQ2 = await storage.getChannelsForUser(activeWorkflow.userId);
            const activeChannelForQ2 = userChannelsForQ2.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
            
            if (!activeChannelForQ2?.whapiChannelToken) {
              console.error(`[Booking] No active channel for custom question 2`);
              return res.status(200).json({ success: true });
            }
            
            const config = nameCheckBookingState.config || {};
            
            // Create booking with both custom fields
            try {
              const bookingStatus = config.defaultBookingStatus || 'confirmed';
              const booking = await storage.createBooking({
                userId: activeWorkflow.userId,
                staffId: nameCheckBookingState.staffId,
                departmentId: nameCheckBookingState.departmentId,
                customerPhone: phone,
                customerName: nameCheckBookingState.customerName || '',
                slotDate: nameCheckBookingState.selectedSlotDate,
                startTime: nameCheckBookingState.selectedStartTime,
                endTime: nameCheckBookingState.selectedEndTime,
                status: bookingStatus,
                nodeId: nameCheckBookingState.nodeId,
                bookingLabel: nameCheckBookingState.bookingLabel,
                customField1Label: nameCheckBookingState.customField1Label || 'Question 1',
                customField1Value: nameCheckBookingState.customField1Value || '',
                customField2Label: config.customQuestion2Label || 'Question 2',
                customField2Value: customValue2,
                reminderEnabled: config.reminderEnabled || false,
                reminderHoursBefore: config.reminderHoursBefore || 24,
                reminderMessage: config.reminderMessage || null,
                reminderSent: false,
              });
              
              const staff = await storage.getBookingStaff(nameCheckBookingState.staffId);
              const dept = await storage.getBookingDepartment(nameCheckBookingState.departmentId);
              
              // Use pending message if status is pending, otherwise use success message
              let messageToSend: string;
              if (bookingStatus === 'pending') {
                messageToSend = config.pendingMessage || 
                  'Your booking request has been submitted. Our team will review and confirm your appointment soon.';
              } else {
                messageToSend = config.successMessage || 
                  'Your appointment has been booked for {{date}} at {{time}}.';
              }
              
              messageToSend = messageToSend
                .replace(/\{\{date\}\}/g, nameCheckBookingState.selectedSlotDate)
                .replace(/\{\{time\}\}/g, nameCheckBookingState.selectedStartTime)
                .replace(/\{\{department\}\}/g, dept?.name || '')
                .replace(/\{\{staff\}\}/g, staff?.name || '')
                .replace(/\{\{name\}\}/g, nameCheckBookingState.customerName || '');
              
              await whapi.sendTextMessage(activeChannelForQ2.whapiChannelToken, {
                to: phone,
                body: messageToSend,
              });
              
              const definition = activeWorkflow.definitionJson as any;
              const bookedNodeId = getNextNodeByHandle(nameCheckBookingState.nodeId, 'booked', definition.edges);
              
              await db.update(conversationStates).set({
                currentNodeId: bookedNodeId || nameCheckBookingState.nodeId,
                context: { ...nameCheckContext, bookingState: undefined, lastBookingId: booking.id },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
              
              console.log(`[Booking] Created booking ${booking.id} with both custom fields`);
              
            } catch (bookingError: any) {
              console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
              await whapi.sendTextMessage(activeChannelForQ2.whapiChannelToken, {
                to: phone,
                body: 'Sorry, we could not book this slot. It may no longer be available.',
              });
              await db.update(conversationStates).set({
                context: { ...nameCheckContext, bookingState: undefined },
                updatedAt: new Date(),
              }).where(eq(conversationStates.id, nameCheckState.id));
            }
            
            return res.status(200).json({ success: true });
          }
          
          // First-message-of-day detection using Asia/Bahrain timezone
          const msgTimestamp = dayjs.unix(incomingMessage.timestamp || Date.now() / 1000);
          const msgTimeInBahrain = msgTimestamp.tz("Asia/Bahrain");
          const dateLocal = msgTimeInBahrain.format("YYYY-MM-DD");
          
          // Try to insert into firstMessageFlags
          // If successful (no conflict), this is the first message of the day
          let isFirstMessageToday = false;
          try {
            await db.insert(firstMessageFlags).values({
              phone,
              dateLocal,
              firstMsgTs: new Date(),
            });
            isFirstMessageToday = true;
            console.log(`First message of day for ${phone} on ${dateLocal}`);
          } catch (error: any) {
            // Conflict - not first message of day
            if (error.code === '23505' || error.constraint?.includes('first_message_flags_phone_date_idx')) {
              isFirstMessageToday = false;
              console.log(`Not first message of day for ${phone} on ${dateLocal}`);
            } else {
              // Re-throw unexpected errors
              throw error;
            }
          }

          if (isFirstMessageToday) {
            // CRITICAL FIX: Trigger entry nodes for ALL active workflows with entry nodes configured
            // Find all active workflows for this user that have entry nodes
            const allActiveWorkflows = await db
              .select()
              .from(workflows)
              .where(
                and(
                  eq(workflows.userId, activeWorkflow.userId),
                  eq(workflows.isActive, true)
                )
              );
            
            const workflowsWithEntryNodes = allActiveWorkflows.filter(wf => wf.entryNodeId !== null);
            
            console.log(`[First Message of Day] Found ${workflowsWithEntryNodes.length} active workflows with entry nodes for user ${activeWorkflow.userId}`);
            
            // Send welcome message from entry node for ALL workflows that have it configured
            // Each workflow executes independently - one failure won't affect others
            for (const workflow of workflowsWithEntryNodes) {
              try {
                const definition = workflow.definitionJson as { nodes: any[], edges: any[] };
                const entryNodeId = workflow.entryNodeId;
                
                console.log(`[Workflow ${workflow.id}: ${workflow.name}] Entry node ID: ${entryNodeId}, Total nodes: ${definition.nodes?.length || 0}`);
                
                if (!entryNodeId) {
                  console.log(`[Workflow ${workflow.id}: ${workflow.name}] No entry node configured - skipping`);
                  continue;
                }
                
                const entryNode = definition.nodes?.find((n: any) => n.id === entryNodeId);
                
                if (!entryNode) {
                  console.log(`[Workflow ${workflow.id}: ${workflow.name}] Entry node ${entryNodeId} not found in workflow definition`);
                  continue;
                }
                
                console.log(`[Workflow ${workflow.id}: ${workflow.name}] Found entry node, sending message...`);
                
                try {
                  // Send the entry node's message
                  const response = await sendNodeMessage(phone, entryNode, workflow.userId, workflow.id);
                  
                  // Only add to execution log if this is the current workflow
                  if (workflow.id === activeWorkflow.id) {
                    executionLog.responsesSent.push(response);
                  }
                  
                  console.log(`[Workflow ${workflow.id}: ${workflow.name}] Sent welcome message to ${phone} from entry node ${entryNodeId}`);
                  
                  // Fire-and-forget: assign "Chatbot" label since chatbot sent a message
                  (async () => {
                    try {
                      const userChannelsForLabel = await storage.getChannelsForUser(workflow.userId);
                      const activeChannelForLabel = userChannelsForLabel.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
                      if (activeChannelForLabel?.whapiChannelToken) {
                        const chatId = `${phone}@s.whatsapp.net`;
                        await handleChatLabelAsync(
                          workflow.userId,
                          workflow.id,
                          activeChannelForLabel.whapiChannelToken,
                          chatId,
                          'chatbot'
                        );
                      }
                    } catch (e) {
                      // Ignore label errors silently
                    }
                  })();
                  
                  // Log execution for this workflow
                  await db.insert(workflowExecutions).values({
                    workflowId: workflow.id,
                    phone,
                    messageType: "text",
                    triggerData: { trigger: "first_message_of_day", phone, dateLocal },
                    responsesSent: [response],
                    status: "SUCCESS",
                    errorMessage: null,
                  });
                } catch (sendError: any) {
                  // Log the error but don't fail the whole process
                  const errorMsg = sendError.message || String(sendError);
                  console.error(`[Workflow ${workflow.id}: ${workflow.name}] Failed to send entry node message: ${errorMsg}`);
                  
                  // Log failed execution
                  await db.insert(workflowExecutions).values({
                    workflowId: workflow.id,
                    phone,
                    messageType: "text",
                    triggerData: { trigger: "first_message_of_day", phone, dateLocal },
                    responsesSent: [],
                    status: "ERROR",
                    errorMessage: `Failed to send welcome message: ${errorMsg}`,
                  });
                  
                  // Only set execution log error if this is the current workflow
                  if (workflow.id === activeWorkflow.id) {
                    executionLog.errorMessage = `Failed to send welcome message: ${errorMsg}`;
                    executionLog.status = "ERROR";
                  }
                }
                
                // Update conversation state for tracking
                const conversationState = await db
                  .select()
                  .from(conversationStates)
                  .where(
                    and(
                      eq(conversationStates.workflowId, workflow.id),
                      eq(conversationStates.phone, phone)
                    )
                  )
                  .limit(1);

                const now = new Date();
                if (conversationState.length) {
                  await db
                    .update(conversationStates)
                    .set({
                      lastMessageAt: now,
                      lastMessageDate: now,
                      currentNodeId: entryNodeId,
                      updatedAt: now,
                    })
                    .where(eq(conversationStates.id, conversationState[0].id));
                } else {
                  await db.insert(conversationStates).values({
                    workflowId: workflow.id,
                    phone,
                    lastMessageAt: now,
                    lastMessageDate: now,
                    currentNodeId: entryNodeId,
                  });
                }
              } catch (workflowError: any) {
                // Isolated error handling - one workflow's failure won't break the others
                const errorMsg = workflowError.message || String(workflowError);
                console.error(`[Workflow ${workflow.id}: ${workflow.name}] Critical error during first message processing: ${errorMsg}`);
                
                // Try to log the error, but don't let logging failures break the loop
                try {
                  await db.insert(workflowExecutions).values({
                    workflowId: workflow.id,
                    phone,
                    messageType: "text",
                    triggerData: { trigger: "first_message_of_day", phone, dateLocal },
                    responsesSent: [],
                    status: "ERROR",
                    errorMessage: `Critical workflow error: ${errorMsg}`,
                  });
                } catch (logError) {
                  console.error(`[Workflow ${workflow.id}: ${workflow.name}] Failed to log error: ${logError}`);
                }
                
                // Only set execution log error if this is the current workflow
                if (workflow.id === activeWorkflow.id) {
                  executionLog.errorMessage = `Critical workflow error: ${errorMsg}`;
                  executionLog.status = "ERROR";
                }
              }
            }
            
            if (workflowsWithEntryNodes.length === 0) {
              console.log(`[First Message of Day] No active workflows with entry nodes found for user ${activeWorkflow.userId}`);
            }
          } else {
            // Not first message of day - this is an inquiry (customer sending text without chatbot response)
            console.log("Not first message of day, marking as inquiry");
            
            // Fire-and-forget: assign "Inquiry" label since customer is sending unprompted text
            (async () => {
              try {
                const userChannelsForLabel = await storage.getChannelsForUser(activeWorkflow.userId);
                const activeChannelForLabel = userChannelsForLabel.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
                if (activeChannelForLabel?.whapiChannelToken) {
                  const chatId = `${phone}@s.whatsapp.net`;
                  await handleChatLabelAsync(
                    activeWorkflow.userId,
                    activeWorkflow.id,
                    activeChannelForLabel.whapiChannelToken,
                    chatId,
                    'inquiry'
                  );
                }
              } catch (e) {
                // Ignore label errors silently
              }
            })();
          }
        } else if (messageType === "button_reply") {
          console.log(`\n[BUTTON CLICK DEBUG] =============================================`);
          console.log(`[BUTTON CLICK DEBUG] Button click received for workflow ${activeWorkflow.id} (${activeWorkflow.name})`);
          console.log(`[BUTTON CLICK DEBUG] Raw button ID: "${rawButtonId}"`);
          console.log(`[BUTTON CLICK DEBUG] Extracted button ID: "${buttonId}"`);
          console.log(`[BUTTON CLICK DEBUG] Reply type: ${incomingMessage.reply?.type}`);
          console.log(`[BUTTON CLICK DEBUG] context.quoted_id: ${incomingMessage.context?.quoted_id || 'MISSING'}`);
          console.log(`[BUTTON CLICK DEBUG] Full context:`, JSON.stringify(incomingMessage.context, null, 2));
          
          // CRITICAL: Check if this button reply belongs to THIS workflow
          // Multiple workflows may have the same webhook registered in WHAPI, so we need to verify ownership
          const quotedId = incomingMessage.context?.quoted_id;
          
          if (quotedId) {
            console.log(`[BUTTON CLICK DEBUG] Looking up quotedId "${quotedId}" in sent_messages table...`);
            try {
              // First, check if ANY workflow owns this message
              const anyOwnership = await db
                .select()
                .from(sentMessages)
                .where(eq(sentMessages.messageId, quotedId))
                .limit(1);
              
              console.log(`[BUTTON CLICK DEBUG] sent_messages lookup result:`, JSON.stringify(anyOwnership, null, 2));
              
              if (anyOwnership && anyOwnership.length > 0) {
                // Message is tracked - check if it belongs to THIS workflow
                console.log(`[BUTTON CLICK DEBUG] Found ownership record: workflowId=${anyOwnership[0].workflowId}, messageType=${anyOwnership[0].messageType}`);
                if (anyOwnership[0].workflowId !== activeWorkflow.id) {
                  // This button click is for a DIFFERENT workflow - ignore it
                  console.log(`[Button Reply] Ignoring button click - message ${quotedId} belongs to workflow ${anyOwnership[0].workflowId}, not workflow ${activeWorkflow.id}`);
                  return res.json({ success: true, message: "Button click belongs to different workflow" });
                }
                console.log(`[Button Reply] Confirmed ownership - processing button click for workflow ${activeWorkflow.id}`);
              } else {
                // Message is NOT tracked (test message, old message before tracking was added)
                // Allow all workflows to process for backward compatibility
                console.log(`[BUTTON CLICK DEBUG] No record found in sent_messages for quotedId "${quotedId}"`);
                console.log(`[Button Reply] Message ${quotedId} not tracked in sent_messages - allowing all workflows to process (backward compatible)`);
              }
            } catch (ownershipError: any) {
              // If sent_messages table doesn't exist or query fails, allow processing (backward compatible)
              console.warn(`[Button Reply] Ownership check failed (table may not exist): ${ownershipError.message} - allowing processing for backward compatibility`);
            }
          } else {
            console.log(`[BUTTON CLICK DEBUG] No context.quoted_id in the webhook - cannot verify ownership`);
          }
          
          // Find the node linked to this button_id using workflow edges
          const definition = activeWorkflow.definitionJson as { nodes: any[], edges: any[] };
          
          console.log(`[Button Reply Debug] =============================================`);
          console.log(`[Button Reply Debug] Workflow: ${activeWorkflow.name} (ID: ${activeWorkflow.id})`);
          console.log(`[Button Reply Debug] Button ID received: "${buttonId}"`);
          console.log(`[Button Reply Debug] Raw Button ID: "${rawButtonId}"`);
          console.log(`[Button Reply Debug] Total edges: ${definition.edges?.length || 0}`);
          console.log(`[Button Reply Debug] Total nodes: ${definition.nodes?.length || 0}`);
          
          // Log all edges with their sourceHandles for debugging
          console.log(`[Button Reply Debug] All edges:`, JSON.stringify(definition.edges?.map((e: any) => ({
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })), null, 2));
          
          // Find carousel nodes and log their button IDs
          const carouselNodes = definition.nodes?.filter((n: any) => 
            (n.data?.type === 'carousel' || n.data?.nodeType === 'carousel')
          ) || [];
          
          console.log(`[Button Reply Debug] Carousel nodes found: ${carouselNodes.length}`);
          carouselNodes.forEach((node: any, idx: number) => {
            const cards = node.data?.config?.cards || [];
            console.log(`[Button Reply Debug] Carousel ${idx + 1} (${node.id}):`, JSON.stringify({
              nodeId: node.id,
              cards: cards.map((card: any) => ({
                cardId: card.id,
                buttons: (card.buttons || []).map((btn: any) => ({
                  id: btn.id,
                  title: btn.title,
                  type: btn.type,
                }))
              }))
            }, null, 2));
          });
          
          // Try to find edge by sourceHandle first (new multi-handle workflows)
          // The sourceHandle is automatically set by ReactFlow when connecting from a specific handle
          let targetEdge = definition.edges?.find((edge: any) => edge.sourceHandle === buttonId);
          
          if (targetEdge) {
            console.log(`[Button Reply Debug] Found edge by sourceHandle: ${JSON.stringify(targetEdge)}`);
          }
          
          // FALLBACK 1: For legacy workflows without sourceHandle, check node button configs
          // This maintains backward compatibility with existing workflows
          if (!targetEdge) {
            console.log(`[Button Reply Debug] No edge found by sourceHandle, trying fallback 1 (buttons/list rows)...`);
            targetEdge = definition.edges?.find((edge: any) => {
              const sourceNode = definition.nodes?.find((n: any) => n.id === edge.source);
              if (!sourceNode) return false;
              
              // Check if this node has a button with matching ID
              const buttons = sourceNode.data?.config?.buttons || [];
              const hasMatchingButton = buttons.some((btn: any) => btn.id === buttonId);
              
              // Also check list message rows
              const sections = sourceNode.data?.config?.sections || [];
              const hasMatchingRow = sections.some((section: any) => 
                section.rows?.some((row: any) => row.id === buttonId)
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
          
          // FALLBACK 2: For carousel buttons - check carousel card buttons
          if (!targetEdge) {
            console.log(`[Button Reply Debug] No edge found by fallback 1, trying fallback 2 (carousel cards)...`);
            
            // Find carousel node that has a button with matching ID
            for (const node of (definition.nodes || [])) {
              const nodeType = node.data?.type || node.data?.nodeType;
              if (nodeType !== 'carousel') continue;
              
              const cards = node.data?.config?.cards || [];
              for (const card of cards) {
                const matchingBtn = (card.buttons || []).find((btn: any) => btn.id === buttonId);
                if (matchingBtn) {
                  console.log(`[Button Reply Debug] Found matching button "${buttonId}" in carousel card "${card.id}"`);
                  
                  // Find edge that originates from this carousel node
                  // Try matching by button ID in sourceHandle first
                  targetEdge = definition.edges?.find((e: any) => 
                    e.source === node.id && e.sourceHandle === buttonId
                  );
                  
                  // If not found, try by card ID (some workflows use card ID as handle)
                  if (!targetEdge) {
                    targetEdge = definition.edges?.find((e: any) => 
                      e.source === node.id && e.sourceHandle === card.id
                    );
                    if (targetEdge) {
                      console.log(`[Button Reply Debug] Found edge by card ID handle: ${JSON.stringify(targetEdge)}`);
                    }
                  }
                  
                  // If still not found, just get any edge from this carousel node with a matching button title
                  if (!targetEdge) {
                    // Check if edge sourceHandle contains button title (some implementations use title)
                    targetEdge = definition.edges?.find((e: any) => 
                      e.source === node.id && e.sourceHandle?.includes(matchingBtn.title)
                    );
                    if (targetEdge) {
                      console.log(`[Button Reply Debug] Found edge by button title handle: ${JSON.stringify(targetEdge)}`);
                    }
                  }
                  
                  // Last resort - if there's only one edge from this carousel, use it
                  if (!targetEdge) {
                    const carouselEdges = definition.edges?.filter((e: any) => e.source === node.id) || [];
                    console.log(`[Button Reply Debug] Carousel edges from node ${node.id}: ${JSON.stringify(carouselEdges)}`);
                    
                    // If there are multiple edges, try matching based on edge order and button position
                    if (carouselEdges.length > 0) {
                      // Find button index across all cards
                      let btnIndex = 0;
                      let found = false;
                      for (const c of cards) {
                        for (const b of (c.buttons || [])) {
                          if (b.id === buttonId) {
                            found = true;
                            break;
                          }
                          if (b.type === 'quick_reply') btnIndex++;
                        }
                        if (found) break;
                      }
                      
                      // Use the button index to select the corresponding edge
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
          
          // FALLBACK 3: Last resort - find ANY edge from a node that could have sent this button
          // This handles cases where sourceHandle doesn't match exactly
          if (!targetEdge) {
            console.log(`[Button Reply Debug] No edge found by fallbacks 1 & 2, trying fallback 3 (any matching interactive node)...`);
            
            // Find all interactive nodes (carousel, quickReply, listMessage, buttons)
            const interactiveNodes = definition.nodes?.filter((n: any) => {
              const nodeType = n.data?.type || n.data?.nodeType;
              return ['carousel', 'quickReply', 'quickReplyImage', 'quickReplyVideo', 'listMessage', 'buttons'].includes(nodeType);
            }) || [];
            
            console.log(`[Button Reply Debug] Found ${interactiveNodes.length} interactive nodes`);
            
            for (const node of interactiveNodes) {
              const nodeType = node.data?.type || node.data?.nodeType;
              const config = node.data?.config || {};
              
              // Check if this node has a button/row with matching ID
              let hasMatchingButton = false;
              
              // Check carousel cards
              if (nodeType === 'carousel') {
                const cards = config.cards || [];
                for (const card of cards) {
                  if ((card.buttons || []).some((btn: any) => btn.id === buttonId)) {
                    hasMatchingButton = true;
                    console.log(`[Button Reply Debug] Fallback 3: Found button "${buttonId}" in carousel node ${node.id}`);
                    break;
                  }
                }
              }
              
              // Check quickReply/buttons
              if (['quickReply', 'quickReplyImage', 'quickReplyVideo', 'buttons'].includes(nodeType)) {
                if ((config.buttons || []).some((btn: any) => btn.id === buttonId)) {
                  hasMatchingButton = true;
                  console.log(`[Button Reply Debug] Fallback 3: Found button "${buttonId}" in ${nodeType} node ${node.id}`);
                }
              }
              
              // Check listMessage sections
              if (nodeType === 'listMessage') {
                const sections = config.sections || [];
                for (const section of sections) {
                  if ((section.rows || []).some((row: any) => row.id === buttonId)) {
                    hasMatchingButton = true;
                    console.log(`[Button Reply Debug] Fallback 3: Found row "${buttonId}" in listMessage node ${node.id}`);
                    break;
                  }
                }
              }
              
              if (hasMatchingButton) {
                // Get all edges from this node
                const nodeEdges = definition.edges?.filter((e: any) => e.source === node.id) || [];
                console.log(`[Button Reply Debug] Fallback 3: Node ${node.id} has ${nodeEdges.length} outgoing edges`);
                
                // Try to find edge with matching sourceHandle
                targetEdge = nodeEdges.find((e: any) => e.sourceHandle === buttonId);
                
                if (!targetEdge && nodeEdges.length > 0) {
                  // If no exact match, use first available edge (for simple workflows)
                  // This assumes buttons are connected in order
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
            const targetNode = definition.nodes?.find((n: any) => n.id === targetNodeId);
            
            console.log(`[Button Reply Debug] Target node ID: ${targetNodeId}`);
            console.log(`[Button Reply Debug] Target node found: ${!!targetNode}`);
            
            // Extract button title for capture and other features
            let clickedButtonTitle = "";
            if (incomingMessage.reply?.type === "buttons_reply") {
              clickedButtonTitle = incomingMessage.reply.buttons_reply?.title || "";
            } else if (incomingMessage.reply?.type === "list_reply") {
              clickedButtonTitle = incomingMessage.reply.list_reply?.title || "";
            } else if (incomingMessage.button?.text) {
              clickedButtonTitle = incomingMessage.button.text;
            }
            
            if (targetNode) {
              const nodeType = targetNode.data?.type || targetNode.data?.nodeType;
              console.log(`[Button Reply Debug] Target node type: ${nodeType}`);
              
              // Execute node chain starting from targetNode
              // HTTP nodes execute automatically and continue, message nodes stop and wait for user
              let currentNode = targetNode;
              let currentNodeId = targetNodeId;
              
              // Get or create conversation state once
              let conversationState = await db
                .select()
                .from(conversationStates)
                .where(
                  and(
                    eq(conversationStates.workflowId, activeWorkflow.id),
                    eq(conversationStates.phone, phone)
                  )
                )
                .limit(1);
              
              if (!conversationState || conversationState.length === 0) {
                const now = new Date();
                await db.insert(conversationStates).values({
                  workflowId: activeWorkflow.id,
                  phone,
                  lastMessageAt: now,
                  lastMessageDate: now,
                  currentNodeId: currentNodeId,
                  context: {},
                });
                
                conversationState = await db
                  .select()
                  .from(conversationStates)
                  .where(
                    and(
                      eq(conversationStates.workflowId, activeWorkflow.id),
                      eq(conversationStates.phone, phone)
                    )
                  )
                  .limit(1);
              }
              
              let state = conversationState[0];
              
              // DATA CAPTURE: Track button clicks if capture is active
              const stateContext = (state.context || {}) as any;
              console.log(`[Data Capture] Context check - captureActive: ${stateContext.captureActive}, clickedButtonTitle: ${clickedButtonTitle}`);
              console.log(`[Data Capture] Full context:`, JSON.stringify(stateContext));
              if (stateContext.captureActive && clickedButtonTitle) {
                // Check if this is a save action (ends capture)
                const saveKeywords = ["save", "حفظ"];
                const isSaveAction = saveKeywords.some(
                  kw => clickedButtonTitle.toLowerCase().trim() === kw.toLowerCase()
                );
                
                // Always record the click (including the save button click)
                const capturedClicks = stateContext.capturedClicks || [];
                capturedClicks.push({
                  buttonId: buttonId,
                  buttonTitle: clickedButtonTitle,
                  timestamp: new Date().toISOString(),
                  nodeId: targetEdge.source, // The node the button was on
                });
                
                console.log(`[Data Capture] Recorded click: "${clickedButtonTitle}" (total: ${capturedClicks.length})`);
                
                // Update state with new click
                stateContext.capturedClicks = capturedClicks;
                state = { ...state, context: stateContext };
                
                // If save action, save the captured data and clear capture state
                if (isSaveAction && stateContext.captureSequenceName) {
                  console.log(`[Data Capture] Save action detected - saving ${capturedClicks.length} clicks for sequence "${stateContext.captureSequenceName}"`);
                  
                  try {
                    // Check/create capture sequence for this workflow
                    let existingSequence = await db
                      .select()
                      .from(schema.captureSequences)
                      .where(
                        and(
                          eq(schema.captureSequences.workflowId, activeWorkflow.id),
                          eq(schema.captureSequences.sequenceName, stateContext.captureSequenceName)
                        )
                      )
                      .limit(1);
                    
                    let sequenceId: number;
                    if (existingSequence.length === 0) {
                      // Create new sequence
                      const [newSeq] = await db
                        .insert(schema.captureSequences)
                        .values({
                          userId: activeWorkflow.userId,
                          workflowId: activeWorkflow.id,
                          sequenceName: stateContext.captureSequenceName,
                          startNodeId: stateContext.captureStartNodeId || '',
                          endNodeId: currentNodeId || '',
                        })
                        .returning({ id: schema.captureSequences.id });
                      sequenceId = newSeq.id;
                      console.log(`[Data Capture] Created new sequence ID: ${sequenceId}`);
                    } else {
                      sequenceId = existingSequence[0].id;
                    }
                    
                    // Check if entry already exists for this phone + sequence (upsert logic)
                    const existingEntry = await db
                      .select()
                      .from(schema.capturedData)
                      .where(
                        and(
                          eq(schema.capturedData.sequenceId, sequenceId),
                          eq(schema.capturedData.phone, phone)
                        )
                      )
                      .limit(1);
                    
                    if (existingEntry.length > 0) {
                      // Update existing entry
                      await db
                        .update(schema.capturedData)
                        .set({
                          clicksJson: capturedClicks,
                          savedAt: new Date(),
                        })
                        .where(eq(schema.capturedData.id, existingEntry[0].id));
                      console.log(`[Data Capture] Updated existing entry for phone ${phone} in sequence ${sequenceId}`);
                    } else {
                      // Create new entry
                      await db.insert(schema.capturedData).values({
                        sequenceId: sequenceId,
                        userId: activeWorkflow.userId,
                        phone: phone,
                        clicksJson: capturedClicks,
                        workflowName: activeWorkflow.name,
                        sequenceName: stateContext.captureSequenceName,
                      });
                      console.log(`[Data Capture] Created new entry for phone ${phone}`);
                    }
                  } catch (captureError: any) {
                    console.error(`[Data Capture] Error saving captured data: ${captureError.message}`);
                  }
                  
                  // Clear capture state - keep other context variables intact
                  delete stateContext.captureActive;
                  delete stateContext.captureSequenceName;
                  delete stateContext.capturedClicks;
                  delete stateContext.captureStartNodeId;
                  stateContext.captureCompleted = true; // Flag for post-loop reset
                  state = { ...state, context: stateContext };
                  console.log(`[Data Capture] Capture state cleared after save, marked for reset after workflow completes`);
                }
                
                // Update conversation state with capture data (only if not save action)
                await db
                  .update(conversationStates)
                  .set({
                    context: stateContext,
                    updatedAt: new Date(),
                  })
                  .where(eq(conversationStates.id, state.id));
              }
              
              // Execute nodes in sequence until we hit a message node or end of workflow
              while (currentNode) {
                const currentNodeType = currentNode.data?.type || currentNode.data?.nodeType;
                
                // HTTP Request node - execute and continue
                if (currentNodeType === 'action.http_request') {
                  const httpResult = await executeHttpNode(
                    currentNode,
                    state,
                    incomingMessage,
                    { phone, userId: activeWorkflow.userId }
                  );
                  
                  // Update conversation state with HTTP result
                  await db
                    .update(conversationStates)
                    .set({
                      lastMessageAt: new Date(),
                      currentNodeId: currentNodeId,
                      context: httpResult.stateUpdate,
                      updatedAt: new Date(),
                    })
                    .where(eq(conversationStates.id, state.id));
                  
                  // Refresh state for next iteration
                  state = { ...state, context: httpResult.stateUpdate };
                  
                  // Log HTTP execution
                  executionLog.responsesSent.push({
                    nodeId: currentNodeId,
                    nodeType: 'action.http_request',
                    success: httpResult.success,
                    handle: httpResult.nextHandle,
                    result: httpResult.result,
                  });
                  
                  // Find next node based on success/error handle
                  const nextNodeId = getNextNodeByHandle(currentNodeId, httpResult.nextHandle, definition.edges);
                  
                  if (!nextNodeId) {
                    console.log(`HTTP node ${currentNodeId} has no ${httpResult.nextHandle} handle connected - workflow ends here`);
                    break;
                  }
                  
                  const nextNode = definition.nodes?.find((n: any) => n.id === nextNodeId);
                  if (!nextNode) {
                    console.log(`Next node ${nextNodeId} not found in workflow definition after HTTP node`);
                    break;
                  }
                  
                  // Continue to next node - UPDATE BOTH!
                  currentNode = nextNode;
                  currentNodeId = nextNodeId;
                  
                // Booking Node - handle appointment booking
                } else if (currentNodeType === 'booking.book_appointment') {
                  const config = currentNode.data?.config || {};
                  const context = (state.context || {}) as any;
                  
                  console.log(`[Booking] Processing book_appointment node: ${currentNodeId}`);
                  
                  // Check if we're in a booking flow already
                  if (!context.bookingState) {
                    // Start new booking flow - send department list
                    const departments = await storage.getBookingDepartmentsForUser(activeWorkflow.userId);
                    
                    if (departments.length === 0) {
                      // No departments configured - go to no_slots path
                      console.log(`[Booking] No departments configured for user ${activeWorkflow.userId}`);
                      
                      const noSlotsMessage = config.noSlotsMessage || 'Sorry, booking is not available at this time.';
                      
                      // Send no slots message
                      const userChannels = await storage.getChannelsForUser(activeWorkflow.userId);
                      const activeChannel = userChannels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
                      if (activeChannel?.whapiChannelToken) {
                        await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                          to: phone,
                          body: noSlotsMessage,
                        });
                      }
                      
                      // Follow no_slots path
                      const noSlotsNodeId = getNextNodeByHandle(currentNodeId, 'no_slots', definition.edges);
                      if (!noSlotsNodeId) break;
                      const noSlotsNode = definition.nodes?.find((n: any) => n.id === noSlotsNodeId);
                      if (!noSlotsNode) break;
                      currentNode = noSlotsNode;
                      currentNodeId = noSlotsNodeId;
                      continue;
                    }
                    
                    // Send department selection as list message
                    const userChannels = await storage.getChannelsForUser(activeWorkflow.userId);
                    const activeChannel = userChannels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
                    
                    if (activeChannel?.whapiChannelToken) {
                      const promptMessage = config.promptMessage || 'Please select a department for your appointment:';
                      
                      // Build list message with departments (using correct WHAPI format)
                      const listPayload = {
                        to: phone,
                        type: 'list',
                        body: { text: promptMessage },
                        action: {
                          list: {
                            sections: [{
                              title: 'Departments',
                              rows: departments.map((dept: any) => ({
                                id: `booking_dept_${dept.id}`,
                                title: dept.name,
                                description: dept.description || '',
                              })),
                            }],
                            label: config.departmentButtonLabel || 'Select Department',
                          },
                        },
                      };
                      
                      await whapi.sendInteractiveMessage(activeChannel.whapiChannelToken, listPayload);
                      
                      // Save booking state
                      const bookingState = {
                        step: 'select_department',
                        nodeId: currentNodeId,
                        bookingLabel: config.bookingLabel || 'appointment',
                        config,
                      };
                      
                      await db
                        .update(conversationStates)
                        .set({
                          lastMessageAt: new Date(),
                          currentNodeId: currentNodeId,
                          context: { ...context, bookingState },
                          updatedAt: new Date(),
                        })
                        .where(eq(conversationStates.id, state.id));
                      
                      executionLog.responsesSent.push({
                        nodeId: currentNodeId,
                        nodeType: 'booking.book_appointment',
                        step: 'select_department',
                        success: true,
                      });
                      
                      // Wait for user input - exit the loop
                      break;
                    }
                  }
                  
                  // This shouldn't happen in normal flow
                  break;
                  
                // Check Bookings Node - handle viewing customer bookings
                } else if (currentNodeType === 'booking.check_bookings') {
                  const config = currentNode.data?.config || {};
                  const checkType = config.checkType || 'my_bookings';
                  const context = (state.context || {}) as any;
                  
                  console.log(`[Booking] Processing check_bookings node: ${currentNodeId}, type: ${checkType}`);
                  
                  // Get customer bookings by phone with optional filters
                  const statusFilter = config.statusFilter || 'upcoming';
                  const maxBookings = config.maxBookings || 0;
                  
                  let allCustomerBookings = await storage.getBookingsForCustomer(phone, activeWorkflow.userId);
                  
                  // Apply status filter
                  let customerBookings = allCustomerBookings;
                  if (statusFilter === 'upcoming') {
                    // Upcoming = confirmed and date >= today
                    const today = new Date().toISOString().split('T')[0];
                    customerBookings = allCustomerBookings.filter((b: any) => 
                      b.status === 'confirmed' && b.slotDate >= today
                    );
                  } else if (statusFilter === 'confirmed') {
                    customerBookings = allCustomerBookings.filter((b: any) => b.status === 'confirmed');
                  } else if (statusFilter === 'pending') {
                    customerBookings = allCustomerBookings.filter((b: any) => b.status === 'pending');
                  } else if (statusFilter === 'completed') {
                    customerBookings = allCustomerBookings.filter((b: any) => b.status === 'completed');
                  } else if (statusFilter === 'cancelled') {
                    customerBookings = allCustomerBookings.filter((b: any) => b.status === 'cancelled');
                  }
                  // 'all' shows all statuses
                  
                  // Apply max bookings limit (sort by date desc, take last N)
                  if (maxBookings > 0 && customerBookings.length > maxBookings) {
                    // Sort by date descending and take last N
                    customerBookings = customerBookings
                      .sort((a: any, b: any) => new Date(b.slotDate).getTime() - new Date(a.slotDate).getTime())
                      .slice(0, maxBookings);
                  }
                  
                  // For reschedule/cancel, only show confirmed bookings
                  const activeBookings = customerBookings.filter((b: any) => b.status === 'confirmed');
                  
                  const userChannels = await storage.getChannelsForUser(activeWorkflow.userId);
                  const activeChannel = userChannels.find((ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED");
                  
                  if (activeChannel?.whapiChannelToken) {
                    if (checkType === 'my_bookings') {
                      // Original behavior: show text list of bookings
                      if (customerBookings.length === 0) {
                        const noBookingsMessage = config.noBookingsMessage || "You don't have any upcoming appointments.";
                        await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                          to: phone,
                          body: noBookingsMessage,
                        });
                      } else {
                        const bookingListFormat = config.bookingListFormat || '{{date}} at {{time}}\n{{department}} - {{staff}}\nStatus: {{status}}';
                        let bookingsText = 'Your appointments:\n\n';
                        
                        for (const booking of customerBookings) {
                          // Get department and staff names
                          const staff = await storage.getBookingStaff(booking.staffId);
                          const dept = staff ? await storage.getBookingDepartment(staff.departmentId) : null;
                          
                          let formatted = bookingListFormat
                            .replace(/\{\{date\}\}/g, booking.slotDate)
                            .replace(/\{\{time\}\}/g, booking.startTime)
                            .replace(/\{\{department\}\}/g, dept?.name || '')
                            .replace(/\{\{staff\}\}/g, staff?.name || '')
                            .replace(/\{\{status\}\}/g, booking.status);
                          bookingsText += formatted + '\n\n';
                        }
                        
                        await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                          to: phone,
                          body: bookingsText.trim(),
                        });
                      }
                      
                      // Continue to next node
                      const nextNodeId = getNextNodeByHandle(currentNodeId, 'booked', definition.edges);
                      if (!nextNodeId) break;
                      const nextNode = definition.nodes?.find((n: any) => n.id === nextNodeId);
                      if (!nextNode) break;
                      currentNode = nextNode;
                      currentNodeId = nextNodeId;
                      
                    } else if (checkType === 'reschedule' || checkType === 'cancel_booking') {
                      // Interactive mode: show list of bookings to select
                      if (activeBookings.length === 0) {
                        const noBookingsMessage = config.noBookingsMessage || "You don't have any upcoming appointments.";
                        await whapi.sendTextMessage(activeChannel.whapiChannelToken, {
                          to: phone,
                          body: noBookingsMessage,
                        });
                        
                        // Continue to next node (no_slots path)
                        const nextNodeId = getNextNodeByHandle(currentNodeId, 'no_slots', definition.edges);
                        if (!nextNodeId) break;
                        const nextNode = definition.nodes?.find((n: any) => n.id === nextNodeId);
                        if (!nextNode) break;
                        currentNode = nextNode;
                        currentNodeId = nextNodeId;
                      } else {
                        // Build interactive list of bookings
                        const actionType = checkType === 'reschedule' ? 'reschedule' : 'cancel';
                        const promptMessage = checkType === 'reschedule' 
                          ? (config.reschedulePromptMessage || 'Select the appointment you want to reschedule:')
                          : (config.cancelPromptMessage || 'Select the appointment you want to cancel:');
                        const buttonLabel = checkType === 'reschedule'
                          ? (config.rescheduleButtonLabel || 'Select Appointment')
                          : (config.cancelButtonLabel || 'Select Appointment');
                        
                        // Build rows with booking info
                        const bookingRows = [];
                        for (const booking of activeBookings) {
                          const staff = await storage.getBookingStaff(booking.staffId);
                          const dept = staff ? await storage.getBookingDepartment(staff.departmentId) : null;
                          bookingRows.push({
                            id: `booking_${actionType}_${booking.id}`,
                            title: `${booking.slotDate} at ${booking.startTime}`,
                            description: `${dept?.name || ''} - ${staff?.name || ''}`.trim() || 'Appointment',
                          });
                        }
                        
                        const listPayload = {
                          to: phone,
                          type: 'list',
                          body: { text: promptMessage },
                          action: {
                            list: {
                              sections: [{
                                title: 'Your Appointments',
                                rows: bookingRows,
                              }],
                              label: buttonLabel,
                            },
                          },
                        };
                        
                        await whapi.sendInteractiveMessage(activeChannel.whapiChannelToken, listPayload);
                        
                        // Save state for handling response
                        const checkBookingsState = {
                          step: `select_${actionType}`,
                          nodeId: currentNodeId,
                          checkType,
                          config,
                        };
                        
                        await db
                          .update(conversationStates)
                          .set({
                            lastMessageAt: new Date(),
                            currentNodeId: currentNodeId,
                            context: { ...context, checkBookingsState },
                            updatedAt: new Date(),
                          })
                          .where(eq(conversationStates.id, state.id));
                        
                        // Don't continue - wait for user selection
                        executionLog.responsesSent.push({
                          nodeId: currentNodeId,
                          nodeType: 'booking.check_bookings',
                          checkType,
                          bookingsCount: activeBookings.length,
                          success: true,
                        });
                        break;
                      }
                    }
                  }
                  
                  executionLog.responsesSent.push({
                    nodeId: currentNodeId,
                    nodeType: 'booking.check_bookings',
                    bookingsCount: customerBookings.length,
                    success: true,
                  });
                  
                } else if (currentNodeType && (currentNodeType.startsWith('message.') || 
                           ['quickReply', 'quickReplyImage', 'quickReplyVideo', 'listMessage', 'buttons', 'carousel'].includes(currentNodeType))) {
                  // Message node - send message
                  console.log(`[Button Reply Debug] Sending message node: ${currentNodeId}, type: ${currentNodeType}`);
                  console.log(`[Button Reply Debug] Node config: ${JSON.stringify(currentNode.data?.config)}`);
                  
                  try {
                    const response = await sendNodeMessage(phone, currentNode, activeWorkflow.userId, activeWorkflow.id);
                    console.log(`[Button Reply Debug] Message sent successfully: ${JSON.stringify(response)}`);
                    executionLog.responsesSent.push(response);
                    console.log(`[Button Reply Debug] Responses sent count: ${executionLog.responsesSent.length}`);
                  } catch (sendError: any) {
                    console.error(`[Button Reply Debug] Failed to send message: ${sendError.message}`);
                    throw sendError;
                  }
                  
                  // DATA CAPTURE: Check if this node starts a capture sequence
                  const nodeConfig = currentNode.data?.config || {};
                  if (nodeConfig.isCaptureStart && nodeConfig.captureSequenceName) {
                    console.log(`[Data Capture] Starting capture sequence: "${nodeConfig.captureSequenceName}"`);
                    const updatedContext = {
                      ...(state.context as any),
                      captureActive: true,
                      captureSequenceName: nodeConfig.captureSequenceName,
                      captureStartNodeId: currentNodeId,
                      capturedClicks: [],
                    };
                    state = { ...state, context: updatedContext };
                    
                    // Save capture start state immediately
                    await db
                      .update(conversationStates)
                      .set({
                        lastMessageAt: new Date(),
                        currentNodeId: currentNodeId,
                        context: updatedContext,
                        updatedAt: new Date(),
                      })
                      .where(eq(conversationStates.id, state.id));
                  } else {
                    // Update current node (normal case)
                    await db
                      .update(conversationStates)
                      .set({
                        lastMessageAt: new Date(),
                        currentNodeId: currentNodeId,
                        updatedAt: new Date(),
                      })
                      .where(eq(conversationStates.id, state.id));
                  }
                  
                  // Check if this message node has interactive elements (requires user input)
                  const hasInteractiveElements = ['quickReply', 'quickReplyImage', 'quickReplyVideo', 'listMessage', 'buttons', 'carousel'].includes(currentNodeType);
                  
                  if (hasInteractiveElements) {
                    // Interactive message (has buttons/lists) - stop and wait for user response
                    console.log(`[Button Reply Debug] Stopping execution - message node has interactive elements (${currentNodeType})`);
                    break;
                  }
                  
                  // Simple message (text/media only) - check if there's a next node
                  const outgoingEdges = definition.edges?.filter((e: any) => e.source === currentNodeId) || [];
                  
                  if (outgoingEdges.length === 0) {
                    // No next node - end workflow
                    console.log(`[Button Reply Debug] No outgoing edges from message node ${currentNodeId} - workflow ends here`);
                    break;
                  }
                  
                  // Continue to next node (for simple text/media messages)
                  const nextEdge = outgoingEdges[0]; // Simple messages have only one edge
                  const nextNodeId = nextEdge.target;
                  const nextNode = definition.nodes?.find((n: any) => n.id === nextNodeId);
                  
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
              
              // POST-LOOP: If capture was completed, reset conversation for next run
              const finalContext = (state.context || {}) as any;
              if (finalContext.captureCompleted) {
                console.log(`[Data Capture] Workflow completed, resetting conversation state for next run`);
                await db
                  .update(conversationStates)
                  .set({
                    currentNodeId: null,
                    context: {},
                    updatedAt: new Date(),
                  })
                  .where(eq(conversationStates.id, state.id));
              }
            } else {
              console.log(`[Button Reply Debug] Target node not found in workflow definition`);
            }
          } else {
            // No target edge found - this button doesn't belong to this workflow
            // Exit early without creating execution log to reduce DB writes for non-owning workflows
            console.log(`[Button Reply Debug] No target edge found for button_id: ${buttonId} - skipping workflow ${activeWorkflow.id}`);
            return res.json({ success: true, message: "Button not handled by this workflow" });
          }
        }

        // Log successful execution - add reason if no responses sent
        if (executionLog.responsesSent.length === 0 && !executionLog.errorMessage) {
          console.log(`[Webhook] No responses sent - adding reason to log`);
          executionLog.errorMessage = `No messages sent. Possible reasons: No target node found, node is not a message node, or button triggers native WhatsApp action (call/URL button).`;
        }
        
        await db.insert(workflowExecutions).values(executionLog);

        res.json({ success: true });
      } catch (processingError: any) {
        // Log failed execution
        executionLog.status = "ERROR";
        executionLog.errorMessage = processingError.message;
        await db.insert(workflowExecutions).values(executionLog);
        throw processingError;
      }
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed", message: error.message });
    }
  });

  // Bulk message status webhook (for delivery, read, failed, reply tracking)
  app.post("/webhooks/bulk/:userId/:bulkWebhookToken", async (req: Request, res: Response) => {
    try {
      const { userId, bulkWebhookToken } = req.params;
      const webhookPayload = req.body;

      console.log(`\n${"=".repeat(80)}`);
      console.log(`[BULK WEBHOOK] Received for user ${userId} at ${new Date().toISOString()}`);
      console.log(`[BULK WEBHOOK] Token: ${bulkWebhookToken.substring(0, 8)}...`);
      console.log(`[BULK WEBHOOK] Event type: ${webhookPayload.event?.type || 'unknown'}`);
      
      // Log message details if present
      const bulkMsg = webhookPayload.messages?.[0];
      if (bulkMsg) {
        console.log(`[BULK WEBHOOK] Message type: ${bulkMsg.type}`);
        console.log(`[BULK WEBHOOK] Reply type: ${bulkMsg.reply?.type || 'none'}`);
        console.log(`[BULK WEBHOOK] From: ${bulkMsg.from}`);
        console.log(`[BULK WEBHOOK] Has context.quoted_id: ${!!bulkMsg.context?.quoted_id}`);
        if (bulkMsg.reply?.type === 'buttons_reply') {
          console.log(`[BULK WEBHOOK] *** CAROUSEL/BUTTON CLICK DETECTED! ***`);
          console.log(`[BULK WEBHOOK] Button ID: ${bulkMsg.reply.buttons_reply?.id}`);
          console.log(`[BULK WEBHOOK] Button title: ${bulkMsg.reply.buttons_reply?.title}`);
        }
        if (bulkMsg.reply?.type === 'list_reply') {
          console.log(`[BULK WEBHOOK] *** LIST CLICK DETECTED! ***`);
          console.log(`[BULK WEBHOOK] List ID: ${bulkMsg.reply.list_reply?.id}`);
          console.log(`[BULK WEBHOOK] List title: ${bulkMsg.reply.list_reply?.title}`);
        }
      }
      
      console.log(`[BULK WEBHOOK] Full payload:`, JSON.stringify(webhookPayload, null, 2));
      console.log(`${"=".repeat(80)}\n`);

      // Validate user and bulk webhook token
      const user = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, parseInt(userId)),
            eq(users.bulkWebhookToken, bulkWebhookToken)
          )
        )
        .limit(1);

      if (!user || user.length === 0) {
        // FALLBACK: Check if this is actually a workflow webhook token
        // This can happen if WHAPI routes carousel button replies to the bulk endpoint
        console.log("[Bulk Webhook] Token doesn't match bulkWebhookToken, checking if it's a workflow token...");
        
        const workflowWithToken = await db
          .select()
          .from(workflows)
          .where(
            and(
              eq(workflows.userId, parseInt(userId)),
              eq(workflows.webhookToken, bulkWebhookToken)
            )
          )
          .limit(1);
        
        if (workflowWithToken && workflowWithToken.length > 0) {
          console.log(`[Bulk Webhook] Found workflow ${workflowWithToken[0].id} with this token - redirecting to workflow handler`);
          
          // Check if this has a button/list reply that should be processed by workflow
          const messageEvent = webhookPayload.messages?.[0];
          if (messageEvent && (messageEvent.reply?.type === 'buttons_reply' || messageEvent.reply?.type === 'list_reply')) {
            console.log(`[Bulk Webhook] Processing button/list reply through workflow logic`);
            
            // Manually invoke the workflow webhook logic inline
            // This handles carousel button clicks that were routed to bulk webhook
            const workflowRecord = workflowWithToken[0];
            
            if (!workflowRecord.isActive) {
              console.log(`[Bulk Webhook] Workflow ${workflowRecord.id} is inactive`);
              return res.json({ success: true, message: "Workflow is inactive" });
            }
            
            const incomingMessage = messageEvent;
            const chatId = incomingMessage.chat_id || "";
            const phone = chatId.split('@')[0];
            
            // Check for group chat
            if (chatId.endsWith('@g.us')) {
              console.log(`[Bulk Webhook] Ignoring group message from chat_id: ${chatId}`);
              return res.json({ success: true, message: "Group messages ignored" });
            }
            
            // Extract button ID
            let rawButtonId = "";
            if (incomingMessage.reply?.type === "buttons_reply") {
              rawButtonId = incomingMessage.reply.buttons_reply?.id || "";
            } else if (incomingMessage.reply?.type === "list_reply") {
              rawButtonId = incomingMessage.reply.list_reply?.id || "";
            }
            
            const buttonId = rawButtonId.includes(':') ? rawButtonId.split(':').pop() || "" : rawButtonId;
            console.log(`[Bulk Webhook] Processing button click: rawId="${rawButtonId}", extracted="${buttonId}"`);
            
            // Parse workflow definition
            let definition: any = {};
            try {
              const defJson = workflowRecord.definitionJson;
              definition = typeof defJson === 'string' 
                ? JSON.parse(defJson) 
                : defJson || {};
            } catch (e) {
              console.error("[Bulk Webhook] Failed to parse workflow definition:", e);
              return res.status(500).json({ error: "Invalid workflow definition" });
            }
            
            // Get channel for sending
            const userChannels = await db
              .select()
              .from(schema.channels)
              .where(
                and(
                  eq(schema.channels.userId, workflowRecord.userId),
                  eq(schema.channels.status, "ACTIVE")
                )
              )
              .limit(1);
            
            const channel = userChannels[0];
            
            if (!channel) {
              console.error("[Bulk Webhook] No active channel found for user");
              return res.status(400).json({ error: "No active channel" });
            }
            
            // Find target edge for button click (same logic as workflow webhook)
            let targetEdge: any = null;
            
            // Try exact sourceHandle match
            targetEdge = definition.edges?.find((e: any) => e.sourceHandle === buttonId);
            
            if (!targetEdge) {
              console.log(`[Bulk Webhook] No exact sourceHandle match, trying fallbacks...`);
              
              // Find all interactive nodes
              const interactiveNodes = definition.nodes?.filter((n: any) => {
                const nodeType = n.data?.type || n.data?.nodeType;
                return ['carousel', 'quickReply', 'quickReplyImage', 'quickReplyVideo', 'listMessage', 'buttons'].includes(nodeType);
              }) || [];
              
              for (const node of interactiveNodes) {
                const nodeType = node.data?.type || node.data?.nodeType;
                const config = node.data?.config || {};
                let hasMatchingButton = false;
                
                // Check carousel cards
                if (nodeType === 'carousel') {
                  const cards = config.cards || [];
                  for (const card of cards) {
                    if ((card.buttons || []).some((btn: any) => btn.id === buttonId)) {
                      hasMatchingButton = true;
                      break;
                    }
                  }
                }
                
                // Check buttons
                if (['quickReply', 'quickReplyImage', 'quickReplyVideo', 'buttons'].includes(nodeType)) {
                  if ((config.buttons || []).some((btn: any) => btn.id === buttonId)) {
                    hasMatchingButton = true;
                  }
                }
                
                // Check list message
                if (nodeType === 'listMessage') {
                  const sections = config.sections || [];
                  for (const section of sections) {
                    if ((section.rows || []).some((row: any) => row.id === buttonId)) {
                      hasMatchingButton = true;
                      break;
                    }
                  }
                }
                
                if (hasMatchingButton) {
                  const nodeEdges = definition.edges?.filter((e: any) => e.source === node.id) || [];
                  targetEdge = nodeEdges.find((e: any) => e.sourceHandle === buttonId) || nodeEdges[0];
                  if (targetEdge) {
                    console.log(`[Bulk Webhook] Found edge from ${nodeType} node: ${JSON.stringify(targetEdge)}`);
                    break;
                  }
                }
              }
            }
            
            if (!targetEdge) {
              console.log(`[Bulk Webhook] No target edge found for button "${buttonId}"`);
              return res.json({ success: true, message: "No target edge found" });
            }
            
            // Find and execute target node
            const targetNode = definition.nodes?.find((n: any) => n.id === targetEdge.target);
            if (!targetNode) {
              console.log(`[Bulk Webhook] Target node not found: ${targetEdge.target}`);
              return res.json({ success: true, message: "Target node not found" });
            }
            
            const nodeType = targetNode.data?.type || targetNode.data?.nodeType;
            const config = targetNode.data?.config || {};
            
            console.log(`[Bulk Webhook] Sending ${nodeType} message to ${phone}`);
            
            // Send the message using WHAPI
            const result = await whapi.buildAndSendNodeMessage(channel, phone, nodeType, config);
            
            if (result.success) {
              console.log(`[Bulk Webhook] Successfully sent ${nodeType} to ${phone}`);
              
              // Fire-and-forget: assign "Chatbot" label since chatbot sent a message
              if (channel?.whapiChannelToken) {
                const channelTokenForLabel = channel.whapiChannelToken;
                (async () => {
                  try {
                    const chatId = `${phone}@s.whatsapp.net`;
                    await handleChatLabelAsync(
                      workflowRecord.userId,
                      workflowRecord.id,
                      channelTokenForLabel,
                      chatId,
                      'chatbot'
                    );
                  } catch (e) {
                    // Ignore label errors silently
                  }
                })();
              }
              
              // Track sent message for ownership
              if (result.messageId) {
                try {
                  await db.insert(sentMessages).values({
                    workflowId: workflowRecord.id,
                    messageId: result.messageId,
                    phone,
                    messageType: nodeType,
                  });
                } catch (e) {
                  console.warn("[Bulk Webhook] Failed to track sent message:", e);
                }
              }
              
              // Log workflow execution
              await db.insert(workflowExecutions).values({
                workflowId: workflowRecord.id,
                phone,
                messageType: "button_reply",
                triggerData: webhookPayload,
                responsesSent: [{ nodeId: targetNode.id, nodeType, success: true }],
                status: "SUCCESS",
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

      // Extract event data from WHAPI webhook payload
      // WHAPI sends TWO types of webhooks:
      // 1. Status updates: { statuses: [{ id, status, code, timestamp }] }
      // 2. Message events (replies): { messages: [{ id, type, reply, ... }] }
      const statusEvent = webhookPayload.statuses?.[0];
      const messageEvent = webhookPayload.messages?.[0];
      const incomingEvent = statusEvent || messageEvent;
      
      if (!incomingEvent) {
        return res.json({ success: true, message: "No event to process" });
      }

      // Extract message_id (could be in different formats)
      const providerMessageId = incomingEvent.id || incomingEvent.message_id;
      
      if (!providerMessageId) {
        console.log("[Bulk Webhook] No message_id found in payload");
        return res.json({ success: true, message: "No message_id in payload" });
      }

      const eventType = statusEvent ? 'status' : 'message';
      console.log(`[Bulk Webhook] Processing ${eventType} event for message_id: ${providerMessageId}`);

      // For reply messages, use context.quoted_id to find the original message
      // because the webhook ID is for the REPLY message, not the original we sent
      let lookupMessageId = providerMessageId;
      if (messageEvent && messageEvent.context?.quoted_id) {
        lookupMessageId = messageEvent.context.quoted_id;
        console.log(`[Bulk Webhook] Using quoted_id for reply lookup: ${lookupMessageId} (reply message was: ${providerMessageId})`);
      }

      // Find the message by providerMessageId (or quoted_id for replies)
      const existingMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.providerMessageId, lookupMessageId))
        .limit(1);

      if (!existingMessages || existingMessages.length === 0) {
        console.log(`[Bulk Webhook] Message not found for provider_message_id: ${lookupMessageId}`);
        if (messageEvent && !messageEvent.context?.quoted_id) {
          console.log(`[Bulk Webhook] Warning: Reply message received without context.quoted_id`);
        }
        return res.json({ success: true, message: "Message not found (might be from workflow)" });
      }

      const message = existingMessages[0];
      const jobId = message.jobId;

      // Get the job to extract the numeric user ID (safer than parsing URL param)
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      const numericUserId = job?.userId || parseInt(userId);

      // Log webhook event received (wrapped in try-catch to prevent logging failures from breaking webhook)
      try {
        await storage.createBulkLog({
          userId: numericUserId,
          jobId,
          level: 'info',
          category: 'webhook',
          message: `Webhook received: ${eventType} event for message ${lookupMessageId}`,
          meta: { providerMessageId, lookupMessageId, eventType },
        });
      } catch (logError) {
        console.warn("[Bulk Webhook] Failed to create webhook log:", logError);
      }

      // Determine event type and update message accordingly
      let updateData: any = { updatedAt: new Date() };
      let newStatus: string | null = null;

      // Handle status updates (delivery, read, failed)
      // Status events come from webhookPayload.statuses[0] with { id, status, code, timestamp }
      if (statusEvent) {
        const status = statusEvent.status?.toLowerCase();
        const timestamp = statusEvent.timestamp ? parseInt(statusEvent.timestamp) * 1000 : Date.now();
        
        if (status === 'delivered') {
          updateData.status = 'DELIVERED';
          updateData.deliveredAt = new Date(timestamp);
          newStatus = 'DELIVERED';
          console.log(`[Bulk Webhook] Message ${providerMessageId} delivered`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: 'info',
              category: 'status',
              message: `Message delivered: ${lookupMessageId}`,
              meta: { providerMessageId, status: 'DELIVERED' },
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log delivery:", logError);
          }
        } else if (status === 'read') {
          updateData.status = 'READ';
          updateData.readAt = new Date(timestamp);
          newStatus = 'READ';
          console.log(`[Bulk Webhook] Message ${providerMessageId} read`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: 'info',
              category: 'status',
              message: `Message read: ${lookupMessageId}`,
              meta: { providerMessageId, status: 'READ' },
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log read status:", logError);
          }
        } else if (status === 'failed' || status === 'error') {
          updateData.status = 'FAILED';
          updateData.error = statusEvent.error || 'Delivery failed';
          newStatus = 'FAILED';
          console.log(`[Bulk Webhook] Message ${providerMessageId} failed`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: 'error',
              category: 'status',
              message: `Message failed: ${lookupMessageId}`,
              meta: { providerMessageId, status: 'FAILED', error: updateData.error },
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log failure:", logError);
          }
        }
      }
      // Handle reply events (text, buttons_reply, list_reply)
      // Message events come from webhookPayload.messages[0] with { id, type, reply, ... }
      else if (messageEvent && (messageEvent.type === 'reply' || messageEvent.text || messageEvent.reply)) {
        updateData.status = 'REPLIED';
        updateData.repliedAt = new Date(messageEvent.timestamp * 1000 || Date.now());
        newStatus = 'REPLIED';

        // Determine reply type and extract content
        if (messageEvent.reply?.type === 'buttons_reply') {
          const buttonReply = messageEvent.reply.buttons_reply;
          updateData.lastReplyType = 'buttons_reply';
          updateData.lastReply = buttonReply?.title || buttonReply?.id || 'Button clicked';
          updateData.lastReplyPayload = messageEvent;
          console.log(`[Bulk Webhook] Button reply: ${updateData.lastReply}`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: 'info',
              category: 'reply',
              message: `Button reply received: "${updateData.lastReply}" for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: 'buttons_reply', replyTitle: updateData.lastReply },
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log button reply:", logError);
          }
        } else if (messageEvent.reply?.type === 'list_reply') {
          const listReply = messageEvent.reply.list_reply;
          updateData.lastReplyType = 'list_reply';
          updateData.lastReply = listReply?.title || listReply?.id || 'List item selected';
          updateData.lastReplyPayload = messageEvent;
          console.log(`[Bulk Webhook] List reply: ${updateData.lastReply}`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: 'info',
              category: 'reply',
              message: `List reply received: "${updateData.lastReply}" for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: 'list_reply', replyTitle: updateData.lastReply },
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log list reply:", logError);
          }
        } else if (messageEvent.text?.body) {
          updateData.lastReplyType = 'text';
          updateData.lastReply = messageEvent.text.body;
          updateData.lastReplyPayload = messageEvent;
          console.log(`[Bulk Webhook] Text reply: ${updateData.lastReply}`);
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: 'info',
              category: 'reply',
              message: `Text reply received for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: 'text', replyText: updateData.lastReply.substring(0, 100) },
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log text reply:", logError);
          }
        } else {
          updateData.lastReplyType = 'other';
          updateData.lastReply = 'Reply received';
          updateData.lastReplyPayload = messageEvent;
          try {
            await storage.createBulkLog({
              userId: numericUserId,
              jobId,
              level: 'info',
              category: 'reply',
              message: `Other reply received for message ${lookupMessageId}`,
              meta: { providerMessageId, replyType: 'other' },
            });
          } catch (logError) {
            console.warn("[Bulk Webhook] Failed to log other reply:", logError);
          }
        }

        // ============================================================================
        // SUBSCRIBER TRACKING: Check if button/list title matches subscribe/unsubscribe keywords
        // ============================================================================
        if ((messageEvent.reply?.type === 'buttons_reply' || messageEvent.reply?.type === 'list_reply') && messageEvent.chat_id) {
          try {
            // Extract button/list title
            let buttonTitle = "";
            if (messageEvent.reply?.type === 'buttons_reply') {
              buttonTitle = messageEvent.reply.buttons_reply?.title || "";
            } else if (messageEvent.reply?.type === 'list_reply') {
              buttonTitle = messageEvent.reply.list_reply?.title || "";
            }
            
            // Extract phone from chat_id (format: "PHONE@s.whatsapp.net")
            const chatId = messageEvent.chat_id || "";
            const phone = chatId.split('@')[0];
            
            // If we have both button title and phone, check against keywords
            if (buttonTitle && buttonTitle.trim().length > 0 && phone) {
              const buttonTitleNormalized = buttonTitle.trim();
              
              // Load subscriber keywords from settings
              const keywordsSetting = await storage.getSetting("subscriber_keywords");
              const keywords = keywordsSetting?.value 
                ? JSON.parse(keywordsSetting.value) 
                : { subscribe: ["Subscribe"], unsubscribe: ["Unsubscribe"] };
              
              // Check if button title matches any subscribe keyword (case-insensitive)
              const matchesSubscribe = keywords.subscribe.some((kw: string) => 
                kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
              );
              
              // Check if button title matches any unsubscribe keyword (case-insensitive)
              const matchesUnsubscribe = keywords.unsubscribe.some((kw: string) => 
                kw.toLowerCase() === buttonTitleNormalized.toLowerCase()
              );
              
              // If keyword matches, upsert subscriber
              if (matchesSubscribe || matchesUnsubscribe) {
                const status = matchesSubscribe ? 'subscribed' : 'unsubscribed';
                
                await storage.upsertSubscriber({
                  userId: numericUserId,
                  phone: phone,
                  name: "", // Default empty name, can be edited later
                  status: status
                });
                
                console.log(`[Subscriber] ${phone} ${status} via button: "${buttonTitle}"`);
              }
            }
          } catch (subscriberError: any) {
            // Log error but don't fail the webhook - subscriber tracking is non-critical
            console.error(`[Subscriber] Error processing subscriber: ${subscriberError.message}`);
          }
        }
      }

      // Update the message record
      if (Object.keys(updateData).length > 1) { // More than just updatedAt
        await db
          .update(messages)
          .set(updateData)
          .where(eq(messages.id, message.id));
        
        console.log(`[Bulk Webhook] Updated message ${message.id} with status: ${newStatus || 'REPLIED'}`);

        // Recompute job statistics
        const allMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.jobId, jobId));

        const jobStats = {
          queued: allMessages.filter(m => m.status === 'QUEUED').length,
          pending: allMessages.filter(m => m.status === 'PENDING').length,
          sent: allMessages.filter(m => m.status === 'SENT').length,
          delivered: allMessages.filter(m => m.status === 'DELIVERED').length,
          read: allMessages.filter(m => m.status === 'READ').length,
          failed: allMessages.filter(m => m.status === 'FAILED').length,
          replied: allMessages.filter(m => m.status === 'REPLIED').length,
          updatedAt: new Date(),
        };

        // Update job with new statistics
        await db
          .update(jobs)
          .set(jobStats)
          .where(eq(jobs.id, jobId));

        console.log(`[Bulk Webhook] Updated job ${jobId} stats:`, jobStats);

        // TODO: Send real-time update via WebSocket/SSE
        // This will be implemented in the next task
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Bulk Webhook] Error:", error);
      
      // Log webhook error (best effort - don't fail if logging fails)
      try {
        const userIdNum = parseInt(req.params.userId);
        if (!isNaN(userIdNum)) {
          await storage.createBulkLog({
            userId: userIdNum,
            jobId: null as any,
            level: 'error',
            category: 'error',
            message: `Webhook processing error: ${error.message}`,
            meta: { error: error.message, stack: error.stack?.substring(0, 500) },
          });
        }
      } catch (logError) {
        console.warn("[Bulk Webhook] Failed to log error:", logError);
      }
      
      res.status(500).json({ error: "Webhook processing failed", message: error.message });
    }
  });

  // Bulk message logs (for debugging bulk send operations)
  app.get("/api/bulk-logs", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const level = req.query.level as string | undefined;
      const category = req.query.category as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      const logs = await storage.getBulkLogs({
        userId,
        level,
        category,
        limit,
      });

      res.json(logs);
    } catch (error: any) {
      console.error("Get bulk logs error:", error);
      res.status(500).json({ error: "Failed to fetch bulk logs" });
    }
  });

  // Helper function to track sent interactive messages
  async function trackSentMessage(workflowId: number | undefined, messageId: string, phone: string, messageType: string) {
    if (!workflowId || !messageId) return;
    
    try {
      await db.insert(sentMessages).values({
        workflowId,
        messageId,
        phone,
        messageType,
      });
      console.log(`[Message Tracking] Recorded ${messageType} message ${messageId} for workflow ${workflowId}`);
    } catch (trackError) {
      console.error(`[Message Tracking] Failed to track message: ${trackError}`);
      // Don't fail the send if tracking fails
    }
  }

  // Helper function to send node message via WHAPI
  async function sendNodeMessage(phone: string, node: any, workflowUserId: number, workflowId?: number): Promise<any> {
    const nodeType = node.data?.type || node.data?.nodeType;
    const config = node.data?.config || {};

    // Get user's first active and authorized channel
    const userChannels = await storage.getChannelsForUser(workflowUserId);
    const activeChannel = userChannels.find(
      (ch: any) => ch.status === "ACTIVE" && ch.authStatus === "AUTHORIZED" && ch.whapiChannelToken
    );

    if (!activeChannel || !activeChannel.whapiChannelToken) {
      throw new Error("No active authorized channel found for user");
    }

    const channelToken = activeChannel.whapiChannelToken;

    // Build and send message based on node type
    const { sendInteractiveMessage, sendCarouselMessage, sendTextMessage, sendMediaMessage, sendLocationMessage } = await import("./whapi");

    // Simple Text Message
    if (nodeType === 'message.text') {
      return await sendTextMessage(channelToken, {
        to: phone,
        body: config.text || 'No message',
      });
    }

    // Media Message (image/video/audio/document)
    else if (nodeType === 'message.media') {
      return await sendMediaMessage(channelToken, {
        to: phone,
        media: config.mediaUrl || '',
        caption: config.caption,
        mediaType: config.mediaType || 'Document',
      });
    }

    // Location Message
    else if (nodeType === 'message.location') {
      return await sendLocationMessage(channelToken, {
        to: phone,
        latitude: parseFloat(config.latitude) || 0,
        longitude: parseFloat(config.longitude) || 0,
        name: config.name,
        address: config.address,
      });
    }

    // Quick Reply Buttons
    else if (nodeType === 'quickReply') {
      const payload: any = {
        to: phone,
        type: 'button',
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      const buttons = (config.buttons || [])
        .filter((btn: any) => btn.title && btn.id)
        .map((btn: any) => ({
          type: 'quick_reply',
          title: btn.title,
          id: btn.id,
        }));
      
      payload.action = { buttons };
      const response = await sendInteractiveMessage(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, 'quickReply');
      return response;
    }

    // Quick Reply with Image
    else if (nodeType === 'quickReplyImage') {
      const payload: any = {
        to: phone,
        type: 'button',
        media: config.mediaUrl,
      };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      const buttons = (config.buttons || [])
        .filter((btn: any) => btn.title && btn.id)
        .map((btn: any) => ({
          type: 'quick_reply',
          title: btn.title,
          id: btn.id,
        }));
      
      payload.action = { buttons };
      const response = await sendInteractiveMessage(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, 'quickReplyImage');
      return response;
    }

    // Quick Reply with Video
    else if (nodeType === 'quickReplyVideo') {
      const payload: any = {
        to: phone,
        type: 'button',
        media: config.mediaUrl,
        no_encode: true,
      };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      const buttons = (config.buttons || [])
        .filter((btn: any) => btn.title && btn.id)
        .map((btn: any) => ({
          type: 'quick_reply',
          title: btn.title,
          id: btn.id,
        }));
      
      payload.action = { buttons };
      const response = await sendInteractiveMessage(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, 'quickReplyVideo');
      return response;
    }

    // List Message
    else if (nodeType === 'listMessage') {
      const sections = (config.sections || []).map((section: any) => ({
        title: section.title || 'Options',
        rows: (section.rows || [])
          .filter((row: any) => row.title && row.id)
          .map((row: any) => ({
            id: row.id,
            title: row.title,
            description: row.description || '',
          })),
      }));
      
      const payload: any = {
        to: phone,
        type: 'list',
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      payload.action = {
        list: {
          sections,
          label: config.buttonLabel || 'Choose option',
        },
      };
      const response = await sendInteractiveMessage(channelToken, payload);
      await trackSentMessage(workflowId, response?.id, phone, 'listMessage');
      return response;
    }

    // Buttons (Call/URL/Copy mixed buttons - up to 3)
    else if (nodeType === 'buttons') {
      const payload: any = {
        to: phone,
        type: 'button',
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      // Map all buttons with their respective types
      // Handle both old format (kind/value) and new format (type/phone_number/url)
      const buttons = (config.buttons || [])
        .filter((btn: any) => btn.title && btn.id)
        .map((btn: any) => {
          // Normalize button type (handle both "kind" and "type" fields)
          let buttonType = btn.type || btn.kind;
          
          // Map old "kind" values to WHAPI "type" values
          if (buttonType === 'phone_number') buttonType = 'call';
          
          const button: any = {
            type: buttonType, // 'call', 'url', or 'copy'
            title: btn.title,
            id: btn.id,
          };
          
          // Add type-specific properties
          // Handle both old format (value) and new format (phone_number/url/copy_code)
          if (buttonType === 'call') {
            button.phone_number = btn.phone_number || btn.value;
          } else if (buttonType === 'url') {
            button.url = btn.url || btn.value;
          } else if (buttonType === 'copy') {
            button.copy_code = btn.copy_code || btn.value;
          }
          
          return button;
        });
      
      payload.action = { buttons };
      return await sendInteractiveMessage(channelToken, payload);
    }

    // Call Button
    else if (nodeType === 'callButton') {
      const payload: any = {
        to: phone,
        type: 'button',
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      payload.action = {
        buttons: [{
          type: 'call',
          title: config.buttonTitle || 'Call us',
          id: config.buttonId || 'call_btn',
          phone_number: config.phoneNumber,
        }],
      };
      return await sendInteractiveMessage(channelToken, payload);
    }

    // URL Button
    else if (nodeType === 'urlButton') {
      const payload: any = {
        to: phone,
        type: 'button',
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      payload.action = {
        buttons: [{
          type: 'url',
          title: config.buttonTitle || 'Visit Website',
          id: config.buttonId || 'url_btn',
          url: config.url,
        }],
      };
      return await sendInteractiveMessage(channelToken, payload);
    }

    // Copy/OTP Button
    else if (nodeType === 'copyButton') {
      const payload: any = {
        to: phone,
        type: 'button',
      };
      if (config.headerText) payload.header = { text: config.headerText };
      payload.body = { text: config.bodyText || 'No message' };
      if (config.footerText) payload.footer = { text: config.footerText };
      
      payload.action = {
        buttons: [{
          type: 'copy',
          title: config.buttonTitle || 'Copy OTP',
          id: config.buttonId || 'copy_btn',
          copy_code: config.copyCode,
        }],
      };
      return await sendInteractiveMessage(channelToken, payload);
    }

    // Carousel
    else if (nodeType === 'carousel') {
      console.log(`[CAROUSEL DEBUG] Sending carousel to ${phone} for workflow ${workflowId}`);
      
      const response = await sendCarouselMessage(channelToken, {
        to: phone,
        body: { text: config.bodyText || 'Check out our offerings!' },
        cards: (config.cards || []).map((card: any) => ({
          id: card.id,
          media: { media: card.media },
          text: card.text,
          buttons: (card.buttons || []).map((btn: any) => {
            if (btn.type === 'url') {
              return {
                type: 'url',
                title: btn.title,
                id: btn.id,
                url: btn.url,
              };
            }
            return {
              type: 'quick_reply',
              title: btn.title,
              id: btn.id,
            };
          }),
        })),
      });
      
      // DEBUG: Log the full WHAPI response to see what ID field is available
      console.log(`[CAROUSEL DEBUG] WHAPI response:`, JSON.stringify(response, null, 2));
      console.log(`[CAROUSEL DEBUG] response.id = ${response?.id}`);
      console.log(`[CAROUSEL DEBUG] response.message_id = ${(response as any)?.message_id}`);
      console.log(`[CAROUSEL DEBUG] response.sent?.id = ${(response as any)?.sent?.id}`);
      
      // Track sent message for button click routing
      // Try multiple possible ID fields from WHAPI response
      const messageId = response?.id || (response as any)?.message_id || (response as any)?.sent?.id || (response as any)?.sent?.message_id;
      console.log(`[CAROUSEL DEBUG] Final messageId to track: ${messageId}`);
      
      if (messageId) {
        await trackSentMessage(workflowId, messageId, phone, 'carousel');
        console.log(`[CAROUSEL DEBUG] Tracked carousel message ${messageId} for workflow ${workflowId}`);
      } else {
        console.error(`[CAROUSEL DEBUG] WARNING: No message ID found in WHAPI response - button clicks won't be routed!`);
      }
      
      return response;
    }

    console.log(`Unsupported node type: ${nodeType}`);
    return { success: false, message: "Unsupported node type" };
  }

  // Test HTTP Request Node
  app.post("/api/workflows/test-http-request", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { config, testContext } = req.body;

      if (!config || !config.url) {
        return res.status(400).json({ error: "HTTP request configuration with URL is required" });
      }

      // Build minimal execution context for testing
      const executionContext = testContext || {};

      // Use the HTTP executor to perform the request
      const { performHttpRequest } = await import("./workflows/httpExecutor");
      const result = await performHttpRequest(config, executionContext);

      // Return test results
      res.json({
        success: result.success,
        status: result.status,
        statusText: result.statusText,
        data: result.data,
        mappedVariables: result.mappedVariables,
        error: result.error,
      });
    } catch (error: any) {
      console.error("Test HTTP request error:", error);
      res.status(500).json({ 
        success: false,
        error: error.message || "Failed to test HTTP request" 
      });
    }
  });

  // ============================================================================
  // ADMIN SETTINGS ROUTES
  // ============================================================================

  // Get bulk send speed settings
  app.get("/api/admin/settings/bulk-speed", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const minDelay = await storage.getSetting("bulk_send_min_delay");
      const maxDelay = await storage.getSetting("bulk_send_max_delay");
      
      res.json({
        minDelay: minDelay?.value || "10",
        maxDelay: maxDelay?.value || "20",
      });
    } catch (error: any) {
      console.error("Get bulk speed settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update bulk send speed settings
  app.put("/api/admin/settings/bulk-speed", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { minDelay, maxDelay } = req.body;
      
      if (minDelay) await storage.setSetting("bulk_send_min_delay", minDelay.toString());
      if (maxDelay) await storage.setSetting("bulk_send_max_delay", maxDelay.toString());

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "settings",
          updates: Object.keys(req.body),
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get HTTP allowlist settings
  app.get("/api/admin/settings/http-allowlist", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const setting = await storage.getSetting("http_allowed_domains");
      const allowedDomains = setting?.value ? JSON.parse(setting.value) : [];
      
      res.json({ allowedDomains });
    } catch (error: any) {
      console.error("Get HTTP allowlist settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update HTTP allowlist settings
  app.put("/api/admin/settings/http-allowlist", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { allowedDomains } = req.body;
      
      if (!Array.isArray(allowedDomains)) {
        return res.status(400).json({ error: "allowedDomains must be an array" });
      }

      // Validate all domains
      const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
      for (const domain of allowedDomains) {
        if (typeof domain !== 'string' || !domainPattern.test(domain.toLowerCase().trim())) {
          return res.status(400).json({ error: `Invalid domain: ${domain}` });
        }
      }

      await storage.setSetting("http_allowed_domains", JSON.stringify(allowedDomains));

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "http_allowlist",
          domainCount: allowedDomains.length,
          adminId: req.userId
        },
      });

      res.json({ success: true, allowedDomains });
    } catch (error: any) {
      console.error("Update HTTP allowlist settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get auth settings (public - needed for home page)
  app.get("/api/settings/auth", async (req: Request, res: Response) => {
    try {
      const enableSignin = await storage.getSetting("enable_signin");
      const enableSignup = await storage.getSetting("enable_signup");
      const signupButtonText = await storage.getSetting("signup_button_text");
      
      res.json({
        enableSignin: enableSignin?.value !== "false", // Default true
        enableSignup: enableSignup?.value !== "false", // Default true
        signupButtonText: signupButtonText?.value || "Start Free Trial", // Default text
      });
    } catch (error: any) {
      console.error("Get auth settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update auth settings (admin only)
  app.put("/api/admin/settings/auth", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
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
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "auth_settings",
          updates: { enableSignin, enableSignup, signupButtonText },
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update auth settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get default page access settings
  app.get("/api/admin/settings/default-page-access", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const pageAccessSetting = await storage.getSetting("default_page_access");
      
      // Default page access for new users
      const defaultPageAccess = {
        dashboard: true,
        channels: false,
        send: false,
        templates: false,
        workflows: false,
        outbox: false,
        logs: false,
        bulkLogs: false,
        captureList: false,
        pricing: true,
        settings: false,
        balances: false,
        whapiSettings: false,
      };
      
      const pageAccess = pageAccessSetting?.value 
        ? JSON.parse(pageAccessSetting.value) 
        : defaultPageAccess;
      
      res.json({ pageAccess });
    } catch (error: any) {
      console.error("Get default page access error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update default page access settings (admin only)
  app.put("/api/admin/settings/default-page-access", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { pageAccess } = req.body;
      
      if (pageAccess && typeof pageAccess === "object") {
        await storage.setSetting("default_page_access", JSON.stringify(pageAccess));
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "default_page_access",
          updates: pageAccess,
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update default page access error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get default theme setting
  app.get("/api/admin/settings/default-theme", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const themeSetting = await storage.getSetting("default_theme");
      const defaultTheme = themeSetting?.value || "dark"; // Default to dark
      
      res.json({ defaultTheme });
    } catch (error: any) {
      console.error("Get default theme error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update default theme setting (admin only)
  app.put("/api/admin/settings/default-theme", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { defaultTheme } = req.body;
      
      if (defaultTheme && (defaultTheme === "light" || defaultTheme === "dark")) {
        await storage.setSetting("default_theme", defaultTheme);
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "default_theme",
          defaultTheme,
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update default theme error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get default theme (public endpoint for initial app load)
  app.get("/api/settings/default-theme", async (req: Request, res: Response) => {
    try {
      const themeSetting = await storage.getSetting("default_theme");
      const defaultTheme = themeSetting?.value || "dark"; // Default to dark
      
      res.json({ defaultTheme });
    } catch (error: any) {
      console.error("Get default theme error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Get chat widget location setting
  app.get("/api/admin/settings/chat-widget-location", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const widgetLocationSetting = await storage.getSetting("chat_widget_location");
      const chatWidgetLocation = widgetLocationSetting?.value || "all-pages"; // Default to all pages
      
      res.json({ chatWidgetLocation });
    } catch (error: any) {
      console.error("Get chat widget location error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update chat widget location setting (admin only)
  app.put("/api/admin/settings/chat-widget-location", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { chatWidgetLocation } = req.body;
      
      if (chatWidgetLocation && (chatWidgetLocation === "homepage-only" || chatWidgetLocation === "all-pages")) {
        await storage.setSetting("chat_widget_location", chatWidgetLocation);
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "chat_widget_location",
          chatWidgetLocation,
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update chat widget location error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get chat widget location (public endpoint for widget loading)
  app.get("/api/settings/chat-widget-location", async (req: Request, res: Response) => {
    try {
      const widgetLocationSetting = await storage.getSetting("chat_widget_location");
      const chatWidgetLocation = widgetLocationSetting?.value || "all-pages"; // Default to all pages
      
      res.json({ chatWidgetLocation });
    } catch (error: any) {
      console.error("Get chat widget location error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Get subscriber keywords setting (admin only)
  app.get("/api/admin/settings/subscriber-keywords", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const keywordsSetting = await storage.getSetting("subscriber_keywords");
      
      // Default keywords
      const defaultKeywords = {
        subscribe: ["Subscribe"],
        unsubscribe: ["Unsubscribe"]
      };
      
      const keywords = keywordsSetting?.value 
        ? JSON.parse(keywordsSetting.value) 
        : defaultKeywords;
      
      res.json(keywords);
    } catch (error: any) {
      console.error("Get subscriber keywords error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update subscriber keywords setting (admin only)
  app.put("/api/admin/settings/subscriber-keywords", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { subscribe, unsubscribe } = req.body;
      
      // Validate that both are arrays of non-empty strings
      if (!Array.isArray(subscribe) || !Array.isArray(unsubscribe)) {
        return res.status(400).json({ error: "Subscribe and unsubscribe must be arrays" });
      }
      
      // Filter out empty strings, trim, and ensure uniqueness (case-insensitive)
      const subscribeKeywords = Array.from(new Set(
        subscribe
          .filter((k: any) => typeof k === 'string' && k.trim().length > 0)
          .map((k: string) => k.trim())
      ));
      
      const unsubscribeKeywords = Array.from(new Set(
        unsubscribe
          .filter((k: any) => typeof k === 'string' && k.trim().length > 0)
          .map((k: string) => k.trim())
      ));
      
      // Ensure at least one keyword per type
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
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "subscriber_keywords",
          keywords: keywordsData,
          adminId: req.userId
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update subscriber keywords error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ============================================================================
  // USE CASES ROUTES
  // ============================================================================

  // Admin: Upload use case image
  app.post("/api/admin/use-cases/upload-image", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { file } = req.body;

      if (!file) {
        return res.status(400).json({ error: "File data is required" });
      }

      // Parse base64 file
      const base64Data = file.split(',')[1] || file;
      const buffer = Buffer.from(base64Data, 'base64');
      const fileSizeMB = buffer.length / (1024 * 1024);

      // Check max 5MB for use case images
      if (fileSizeMB > 5) {
        return res.status(400).json({ 
          error: `File size (${fileSizeMB.toFixed(2)}MB) exceeds 5MB limit` 
        });
      }

      // Determine file extension from MIME type
      const mimeMatch = file.match(/^data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      
      const extensionMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };

      const extension = extensionMap[mimeType] || 'jpg';
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const timestamp = Date.now();
      const fileName = `${timestamp}-${uniqueId}.${extension}`;
      
      // Create use-cases subdirectory
      const useCasesDir = path.join(process.cwd(), 'uploads', 'use-cases');
      if (!fs.existsSync(useCasesDir)) {
        fs.mkdirSync(useCasesDir, { recursive: true });
      }

      const filePath = path.join(useCasesDir, fileName);
      fs.writeFileSync(filePath, buffer);

      console.log(`[Use Case Upload] Saved ${fileName} (${fileSizeMB.toFixed(2)}MB)`);

      // Return relative URL path for storage in database
      const relativeUrl = `/uploads/use-cases/${fileName}`;
      res.json({ 
        path: relativeUrl,
        fileName: fileName,
        fileSizeMB: fileSizeMB.toFixed(2)
      });
    } catch (error: any) {
      console.error("Use case image upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload image" });
    }
  });

  // Public: Get all published use cases
  app.get("/api/use-cases", async (req: Request, res: Response) => {
    try {
      const cases = await db.select().from(schema.useCases).where(eq(schema.useCases.published, true)).orderBy(schema.useCases.sortOrder, schema.useCases.id);
      res.json(cases);
    } catch (error: any) {
      console.error("Get use cases error:", error);
      res.status(500).json({ error: "Failed to fetch use cases" });
    }
  });

  // Admin: Get all use cases (including unpublished)
  app.get("/api/admin/use-cases", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const cases = await db.select().from(schema.useCases).orderBy(schema.useCases.sortOrder, schema.useCases.id);
      res.json(cases);
    } catch (error: any) {
      console.error("Get all use cases error:", error);
      res.status(500).json({ error: "Failed to fetch use cases" });
    }
  });

  // Admin: Create use case
  app.post("/api/admin/use-cases", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const [useCase] = await db.insert(schema.useCases).values(req.body).returning();
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CREATE",
        meta: { entity: "use_case", useCaseId: useCase.id, adminId: req.userId },
      });
      res.json(useCase);
    } catch (error: any) {
      console.error("Create use case error:", error);
      res.status(500).json({ error: "Failed to create use case" });
    }
  });

  // Admin: Update use case
  app.put("/api/admin/use-cases/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(schema.useCases).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.useCases.id, id)).returning();
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE",
        meta: { entity: "use_case", useCaseId: id, adminId: req.userId },
      });
      res.json(updated);
    } catch (error: any) {
      console.error("Update use case error:", error);
      res.status(500).json({ error: "Failed to update use case" });
    }
  });

  // Admin: Delete use case
  app.delete("/api/admin/use-cases/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(schema.useCases).where(eq(schema.useCases.id, id));
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "DELETE",
        meta: { entity: "use_case", useCaseId: id, adminId: req.userId },
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete use case error:", error);
      res.status(500).json({ error: "Failed to delete use case" });
    }
  });

  // ============================================================================
  // HOMEPAGE FEATURES ROUTES
  // ============================================================================

  // Public: Get all published homepage features
  app.get("/api/homepage-features", async (req: Request, res: Response) => {
    try {
      const features = await db.select().from(schema.homepageFeatures).where(eq(schema.homepageFeatures.published, true)).orderBy(schema.homepageFeatures.sortOrder, schema.homepageFeatures.id);
      res.json(features);
    } catch (error: any) {
      console.error("Get homepage features error:", error);
      res.status(500).json({ error: "Failed to fetch homepage features" });
    }
  });

  // Admin: Get all homepage features (including unpublished)
  app.get("/api/admin/homepage-features", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const features = await db.select().from(schema.homepageFeatures).orderBy(schema.homepageFeatures.sortOrder, schema.homepageFeatures.id);
      res.json(features);
    } catch (error: any) {
      console.error("Get all homepage features error:", error);
      res.status(500).json({ error: "Failed to fetch homepage features" });
    }
  });

  // Admin: Create homepage feature
  app.post("/api/admin/homepage-features", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const [feature] = await db.insert(schema.homepageFeatures).values(req.body).returning();
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CREATE",
        meta: { entity: "homepage_feature", featureId: feature.id, adminId: req.userId },
      });
      res.json(feature);
    } catch (error: any) {
      console.error("Create homepage feature error:", error);
      res.status(500).json({ error: "Failed to create homepage feature" });
    }
  });

  // Admin: Update homepage feature
  app.put("/api/admin/homepage-features/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(schema.homepageFeatures).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.homepageFeatures.id, id)).returning();
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE",
        meta: { entity: "homepage_feature", featureId: id, adminId: req.userId },
      });
      res.json(updated);
    } catch (error: any) {
      console.error("Update homepage feature error:", error);
      res.status(500).json({ error: "Failed to update homepage feature" });
    }
  });

  // Admin: Delete homepage feature
  app.delete("/api/admin/homepage-features/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(schema.homepageFeatures).where(eq(schema.homepageFeatures.id, id));
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "DELETE",
        meta: { entity: "homepage_feature", featureId: id, adminId: req.userId },
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete homepage feature error:", error);
      res.status(500).json({ error: "Failed to delete homepage feature" });
    }
  });

  // ============================================================================
  // TERMS & CONDITIONS ROUTES
  // ============================================================================

  // Public: Get all active terms documents
  app.get("/api/terms", async (req: Request, res: Response) => {
    try {
      const terms = await storage.getActiveTermsDocuments();
      res.json(terms);
    } catch (error: any) {
      console.error("Get terms error:", error);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  });

  // Public: Get active terms document by type
  app.get("/api/terms/:type", async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const terms = await storage.getTermsDocumentByType(type);
      
      if (!terms) {
        return res.status(404).json({ error: "Terms document not found" });
      }

      res.json(terms);
    } catch (error: any) {
      console.error("Get terms by type error:", error);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  });

  // Admin: Get all terms documents (including inactive)
  app.get("/api/admin/terms", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const terms = await db.select().from(schema.termsDocuments).orderBy(desc(schema.termsDocuments.createdAt));
      res.json(terms);
    } catch (error: any) {
      console.error("Get all terms error:", error);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  });

  // Admin: Create new terms document
  app.post("/api/admin/terms", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const validation = schema.insertTermsDocumentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const document = await storage.createTermsDocument(validation.data);

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CREATE_TERMS",
        meta: {
          entity: "terms_documents",
          documentId: document.id,
          type: document.type,
          version: document.version,
        },
      });

      res.json(document);
    } catch (error: any) {
      console.error("Create terms error:", error);
      res.status(500).json({ error: "Failed to create terms document" });
    }
  });

  // Admin: Update terms document (only editable fields)
  app.put("/api/admin/terms/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      const updateSchema = z.object({
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        version: z.string().min(1).optional(),
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
        actorUserId: req.userId!,
        action: "UPDATE_TERMS",
        meta: {
          entity: "terms_documents",
          documentId: id,
          updates: Object.keys(validation.data),
        },
      });

      res.json(document);
    } catch (error: any) {
      console.error("Update terms error:", error);
      res.status(500).json({ error: "Failed to update terms document" });
    }
  });

  // Admin: Set active terms document (deactivates others of same type)
  app.post("/api/admin/terms/:id/activate", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.setActiveTermsDocument(id);

      if (!document) {
        return res.status(404).json({ error: "Terms document not found" });
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "ACTIVATE_TERMS",
        meta: {
          entity: "terms_documents",
          documentId: id,
          type: document.type,
          version: document.version,
        },
      });

      res.json(document);
    } catch (error: any) {
      console.error("Activate terms error:", error);
      res.status(500).json({ error: "Failed to activate terms document" });
    }
  });

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT ROUTES
  // ============================================================================

  // Admin: Cancel user subscription
  app.post("/api/admin/users/:id/cancel-subscription", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      await storage.updateSubscription(subscription.id, { status: "CANCELLED" });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CANCEL_USER_SUBSCRIPTION",
        meta: {
          entity: "subscription",
          entityId: subscription.id,
          userId,
          planId: subscription.planId,
        },
      });

      res.json({ message: "Subscription cancelled successfully" });
    } catch (error: any) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // Admin: Delete user account (with all related data)
  app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Prevent self-deletion
      if (userId === req.userId) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create audit log before deletion
      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "DELETE_USER",
        meta: {
          entity: "user",
          userId,
          email: user.email,
          name: user.name,
        },
      });

      // Delete user (cascade will handle related data)
      await storage.deleteUser(userId);

      res.json({ message: "User account deleted successfully" });
    } catch (error: any) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Failed to delete user account" });
    }
  });

  // User: Cancel own subscription
  app.post("/api/me/cancel-subscription", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      const subscription = await storage.getActiveSubscriptionForUser(effectiveUserId);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      await storage.updateSubscription(subscription.id, { status: "CANCELLED" });

      await storage.createAuditLog({
        actorUserId: req.userId!, // Real admin ID for accountability
        action: "CANCEL_OWN_SUBSCRIPTION",
        meta: {
          entity: "subscription",
          entityId: subscription.id,
          planId: subscription.planId,
          targetUserId: effectiveUserId, // Track which user was affected
          impersonated: req.impersonatedUser ? true : false,
        },
      });

      res.json({ message: "Subscription cancelled successfully" });
    } catch (error: any) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // User: Reset password
  app.post("/api/me/reset-password", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const effectiveUserId = getEffectiveUserId(req);
      
      const validation = z.object({
        newPassword: z.string().min(6, "Password must be at least 6 characters"),
      }).safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }

      const { newPassword } = validation.data;
      const passwordHash = await hashPassword(newPassword);

      await storage.updateUser(effectiveUserId, { passwordHash });

      await storage.createAuditLog({
        actorUserId: req.userId!, // Real admin ID for accountability
        action: "RESET_PASSWORD",
        meta: {
          entity: "user",
          targetUserId: effectiveUserId, // Track which user's password was reset
          impersonated: req.impersonatedUser ? true : false,
        },
      });

      res.json({ message: "Password reset successfully" });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
}
