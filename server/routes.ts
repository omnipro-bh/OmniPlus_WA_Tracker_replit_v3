import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, inArray, desc, gte, sql } from "drizzle-orm";
import { workflows, conversationStates, workflowExecutions, firstMessageFlags, users, messages, jobs, termsDocuments } from "@shared/schema";
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
  insertCouponSchema
} from "@shared/schema";
import { createPaypalOrder, capturePaypalOrder, loadPaypalDefault, verifyPayPalOrder } from "./paypal";
import { verifyWebhookSignature } from "./paypal-webhooks";
import * as whapi from "./whapi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Helper function to calculate days from billing period
function getDaysFromBillingPeriod(billingPeriod: "MONTHLY" | "SEMI_ANNUAL" | "ANNUAL"): number {
  switch (billingPeriod) {
    case "MONTHLY":
      return 30;
    case "SEMI_ANNUAL":
      return 180;
    case "ANNUAL":
      return 365;
  }
}

export function registerRoutes(app: Express) {
  // ============================================================================
  // PAYPAL INTEGRATION
  // ============================================================================

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
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get current subscription and plan
      const subscription = await storage.getActiveSubscriptionForUser(user.id);
      let currentPlan = null;
      let effectivePageAccess = null;
      
      if (subscription) {
        currentPlan = await storage.getPlan(subscription.planId);
        
        // Calculate effective page access (plan + subscription overrides)
        if (currentPlan) {
          effectivePageAccess = {
            ...(typeof currentPlan.pageAccess === 'object' && currentPlan.pageAccess !== null ? currentPlan.pageAccess : {}),
            ...(typeof subscription.pageAccess === 'object' && subscription.pageAccess !== null ? subscription.pageAccess : {})
          };
        }
      } else {
        // Default page access for users without a subscription - get from settings
        const pageAccessSetting = await storage.getSetting("default_page_access");
        effectivePageAccess = pageAccessSetting?.value 
          ? JSON.parse(pageAccessSetting.value)
          : {
              dashboard: true,
              channels: false,
              send: false,
              bulk: false,
              templates: false,
              workflows: false,
              outbox: false,
              logs: false,
              bulkLogs: false,
              pricing: true,
              settings: false,
              balances: false,
              whapiSettings: false,
            };
      }

      // Get channels count
      const channels = await storage.getChannelsForUser(user.id);
      const channelsUsed = channels.length;
      const channelsLimit = currentPlan?.channelsLimit || 0;

      // Calculate total days remaining from all channels
      const totalDaysRemaining = channels.reduce((sum, channel) => {
        return sum + (channel.daysRemaining || 0);
      }, 0);

      // Calculate messages sent today
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
      res.json({
        ...userWithoutPassword,
        daysBalance: totalDaysRemaining, // Override deprecated field with channel aggregate
        currentSubscription: subscription,
        currentPlan,
        effectivePageAccess,
        channelsUsed,
        channelsLimit,
        messagesSentToday,
      });
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
      if (durationType === "SEMI_ANNUAL") {
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
        durationType: z.enum(["MONTHLY", "SEMI_ANNUAL", "ANNUAL"]),
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
      
      if (durationType === "SEMI_ANNUAL") {
        durationMultiplier = 6;
        discountMultiplier = 0.95; // 5% discount
        days = getDaysFromBillingPeriod(plan.billingPeriod) * 6;
      } else if (durationType === "ANNUAL") {
        durationMultiplier = 12;
        discountMultiplier = 0.9; // 10% discount
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
          days, 
          provider: "PAYPAL", 
          orderId, 
          verified: true,
          amount: verification.amount,
          currency: verification.currency,
          payerEmail: verification.payerEmail 
        },
      });

      res.json({ subscription, daysAdded: days });
    } catch (error: any) {
      console.error("PayPal subscription error:", error);
      res.status(500).json({ error: "PayPal subscription failed" });
    }
  });

  // Submit offline payment (including quote requests and demo bookings)
  app.post("/api/subscribe/offline", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const validationResult = insertOfflinePaymentSchema.extend({ userId: z.number() }).safeParse({
        ...req.body,
        userId: req.userId!,
        status: "PENDING"
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten() 
        });
      }

      const { planId, amount, currency, reference, proofUrl, requestType, metadata, termsVersion, couponCode, durationType: submittedDurationType } = validationResult.data;

      // Validate terms acceptance
      if (!termsVersion) {
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

      // Calculate expected amount based on duration type (matching frontend logic)
      const durationType = submittedDurationType || "MONTHLY";
      const basePlanPrice = plan.price || 0;
      let expectedBasePrice = basePlanPrice;
      
      // Apply duration-based pricing (matching frontend getDiscountedPrice function)
      if (durationType === "SEMI_ANNUAL") {
        expectedBasePrice = basePlanPrice * 6 * 0.95; // 6 months with 5% discount
      } else if (durationType === "ANNUAL") {
        expectedBasePrice = basePlanPrice * 12 * 0.9; // 12 months with 10% discount
      }
      // MONTHLY uses base price as-is

      // Validate coupon if provided and verify amount calculation
      if (couponCode) {
        const couponValidation = await storage.validateCoupon(couponCode, req.userId!, planId);
        if (!couponValidation.valid) {
          return res.status(400).json({ error: couponValidation.message });
        }

        // Calculate expected amount with coupon discount applied to duration-adjusted price
        const discountPercent = couponValidation.coupon?.discountPercent || 0;
        const expectedAmount = Math.round(expectedBasePrice * (100 - discountPercent) / 100);

        // Verify the submitted amount matches the expected discounted amount
        // Allow for small rounding differences (within 1 cent)
        if (Math.abs(amount - expectedAmount) > 1) {
          return res.status(400).json({ 
            error: "Amount mismatch",
            details: `Expected ${expectedAmount} cents (${durationType} with ${discountPercent}% coupon), received ${amount} cents`
          });
        }
      } else {
        // No coupon - verify amount matches duration-adjusted plan price
        const expectedAmount = Math.round(expectedBasePrice);
        if (Math.abs(amount - expectedAmount) > 1) {
          return res.status(400).json({ 
            error: "Amount mismatch",
            details: `Expected ${expectedAmount} cents (${durationType}), received ${amount} cents`
          });
        }
      }

      const payment = await storage.createOfflinePayment({
        userId: req.userId!,
        planId,
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
      const channels = await storage.getChannelsForUser(req.userId!);
      
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
      // Validate request body
      const validationResult = insertChannelSchema.extend({ userId: z.number() }).safeParse({
        ...req.body,
        userId: req.userId!
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten() 
        });
      }

      const { label, phone } = validationResult.data;

      // Check subscription and limits
      const user = await storage.getUser(req.userId!);
      const subscription = await storage.getActiveSubscriptionForUser(req.userId!);

      if (!subscription) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      const plan = await storage.getPlan(subscription.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const existingChannels = await storage.getChannelsForUser(req.userId!);
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
        userId: req.userId!,
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

      if (!channel || channel.userId !== req.userId!) {
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

      if (!channel || channel.userId !== req.userId!) {
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

      if (!channel || channel.userId !== req.userId!) {
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

      if (!channel || channel.userId !== req.userId!) {
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

      if (!channel || channel.userId !== req.userId!) {
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

      // Verify channel belongs to user and is active
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId!) {
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

      // Check daily message limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaysJobs = await storage.getJobsForUser(req.userId!);
      const todaysMessages = todaysJobs
        .filter(job => new Date(job.createdAt) >= today)
        .reduce((sum, job) => sum + job.total, 0);

      if (todaysMessages >= plan.dailyMessagesLimit) {
        return res.status(400).json({ 
          error: `Daily message limit reached (${plan.dailyMessagesLimit}). Upgrade plan to send more.`,
          limitReached: true
        });
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
            media: mediaUrl || "",
            caption: body,
            mediaType: "Image",
          });
          
        } else if (currentMessageType === "image_buttons") {
          // Image with buttons
          const imageButtonPayload = {
            to,
            type: "button",
            ...(mediaUrl && { header: { type: "image", image: { link: mediaUrl } } }),
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
          console.log(`[Single Send] image_buttons payload:`, JSON.stringify(imageButtonPayload, null, 2));
          console.log(`[Single Send] mediaUrl value:`, mediaUrl);
          whapiResponse = await whapi.sendInteractiveMessage(channel.whapiChannelToken!, imageButtonPayload);
          
        } else if (currentMessageType === "video_buttons") {
          // Video with buttons
          const videoButtonPayload = {
            to,
            type: "button",
            ...(mediaUrl && { header: { type: "video", video: { link: mediaUrl } } }),
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
          console.log(`[Single Send] video_buttons payload:`, JSON.stringify(videoButtonPayload, null, 2));
          console.log(`[Single Send] mediaUrl value:`, mediaUrl);
          whapiResponse = await whapi.sendInteractiveMessage(channel.whapiChannelToken!, videoButtonPayload);
          
        } else if (currentMessageType === "document") {
          // Document (no buttons)
          whapiResponse = await whapi.sendMediaMessage(channel.whapiChannelToken!, {
            to,
            media: mediaUrl || "",
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

        // Update job counters
        await storage.updateJob(job.id, {
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
        
        // Update message status to failed
        await storage.updateMessage(message.id, {
          status: "FAILED",
          error: whapiError.message || "Failed to send message"
        });

        // Update job counters
        await storage.updateJob(job.id, {
          pending: 0,
          failed: 1,
        });

        return res.status(500).json({ 
          error: "Failed to send message. Please try again later.",
          details: whapiError.message 
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

      // Check channel
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId! || channel.status !== "ACTIVE") {
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

      // Check bulk message limit
      if (rows.length > plan.bulkMessagesLimit) {
        return res.status(403).json({ 
          error: `Bulk message limit is ${plan.bulkMessagesLimit} messages per batch` 
        });
      }

      // Count messages sent today (including this batch)
      const jobs = await storage.getJobsForUser(req.userId!);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const messagesToday = jobs
        .filter(j => new Date(j.createdAt) >= today)
        .reduce((sum, j) => sum + j.total, 0);

      if (messagesToday + rows.length > plan.dailyMessagesLimit) {
        return res.status(403).json({ 
          error: `Daily message limit would be exceeded. Today: ${messagesToday}/${plan.dailyMessagesLimit}` 
        });
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
          buttons: buttons,
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

      // Process messages one by one with random delays
      for (const message of queuedMessages) {
        try {
          // Update message to pending
          await storage.updateMessage(message.id, { status: "PENDING" });
          const queued = messages.filter(m => m.status === "QUEUED").length - 1;
          const pending = messages.filter(m => m.status === "PENDING").length + 1;
          await storage.updateJob(jobId, { queued, pending });

          // Get message type and buttons
          const messageType = message.messageType || "text_buttons";
          const buttons = Array.isArray(message.buttons) ? message.buttons : [];

          // Send message via WHAPI based on message type
          let result;
          
          switch (messageType) {
            case "image":
              // Send image without buttons
              result = await whapi.sendMediaMessage(channel.whapiChannelToken, {
                to: message.to,
                media: message.mediaUrl || "",
                caption: message.body || "",
                mediaType: "Image",
              });
              break;
              
            case "image_buttons": {
              // Send image with buttons (interactive)
              const imgPayload = {
                to: message.to,
                type: "button",
                ...(message.mediaUrl && { 
                  header: { type: "image", image: { link: message.mediaUrl } } 
                }),
                body: { text: message.body || "No message" },
                footer: message.footer ? { text: message.footer } : undefined,
                action: { buttons },
              };
              console.log(`[Bulk Send] image_buttons payload for ${message.to}:`, JSON.stringify(imgPayload, null, 2));
              console.log(`[Bulk Send] mediaUrl value:`, message.mediaUrl);
              result = await whapi.sendInteractiveMessage(channel.whapiChannelToken, imgPayload);
              break;
            }
              
            case "video_buttons": {
              // Send video with buttons (interactive)
              const vidPayload = {
                to: message.to,
                type: "button",
                ...(message.mediaUrl && { 
                  header: { type: "video", video: { link: message.mediaUrl } } 
                }),
                body: { text: message.body || "No message" },
                footer: message.footer ? { text: message.footer } : undefined,
                action: { buttons },
              };
              console.log(`[Bulk Send] video_buttons payload for ${message.to}:`, JSON.stringify(vidPayload, null, 2));
              console.log(`[Bulk Send] mediaUrl value:`, message.mediaUrl);
              result = await whapi.sendInteractiveMessage(channel.whapiChannelToken, vidPayload);
              break;
            }
              
            case "document":
              // Send document file
              result = await whapi.sendMediaMessage(channel.whapiChannelToken, {
                to: message.to,
                media: message.mediaUrl || "",
                caption: message.body || "",
                mediaType: "Document",
              });
              break;
              
            case "text_buttons":
            default:
              // Send text with buttons or simple text
              if (buttons.length > 0) {
                // Send interactive message with buttons
                result = await whapi.sendInteractiveMessage(channel.whapiChannelToken, {
                  to: message.to,
                  type: "button",
                  header: message.header ? { text: message.header } : undefined,
                  body: { text: message.body || "No message" },
                  footer: message.footer ? { text: message.footer } : undefined,
                  action: { buttons },
                });
              } else {
                // Send simple text message
                result = await whapi.sendTextMessage(channel.whapiChannelToken, {
                  to: message.to,
                  body: message.body || "No message",
                });
              }
              break;
          }

          if (result && result.sent) {
            // Extract provider message ID from WHAPI response
            // WHAPI can return different structures:
            // - Bulk/Interactive: { sent: true, messages: [{ id: "..." }] }
            // - Simple text: { sent: true, message: { id: "..." } }
            // - Legacy: { sent: true, id: "..." }
            const providerMessageId = result.messages?.[0]?.id || result.message?.id || result.id || result.message_id;
            
            console.log(`[Bulk Send] Message ${message.id} to ${message.to}:`);
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
            const newPending = messages.filter(m => m.status === "PENDING").length;
            const sent = messages.filter(m => m.status === "SENT").length + 1;
            await storage.updateJob(jobId, { pending: newPending, sent });
          } else {
            throw new Error(result?.message || "Failed to send");
          }

          // Random delay before next message (unless it's the last one)
          if (message.id !== queuedMessages[queuedMessages.length - 1].id) {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (msgError: any) {
          console.error(`Failed to send message ${message.id}:`, msgError);
          await storage.updateMessage(message.id, { 
            status: "FAILED",
            error: msgError.message || "Unknown error",
          });
          const newPending = messages.filter(m => m.status === "PENDING").length;
          const failed = messages.filter(m => m.status === "FAILED").length + 1;
          await storage.updateJob(jobId, { pending: newPending, failed });
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
      const jobs = await storage.getJobsForUser(req.userId!);
      res.json(jobs);
    } catch (error: any) {
      console.error("Get jobs error:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });


  // ============================================================================
  // TEMPLATES
  // ============================================================================

  // Get templates
  app.get("/api/templates", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const templates = await storage.getTemplatesForUser(req.userId!);
      res.json(templates);
    } catch (error: any) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Create template
  app.post("/api/templates", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const validationResult = insertTemplateSchema.extend({ userId: z.number() }).safeParse({
        ...req.body,
        userId: req.userId!
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten() 
        });
      }

      const { title, header, body, footer, buttons } = validationResult.data;

      const template = await storage.createTemplate({
        userId: req.userId!,
        title,
        header,
        body,
        footer,
        buttons: buttons || [],
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

      res.json(template);
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

      const { title, header, body, footer, buttons } = req.body;
      const updated = await storage.updateTemplate(templateId, {
        title,
        header,
        body,
        footer,
        buttons,
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

      res.json(updated);
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
      const phonebooks = await storage.getPhonebooksForUser(req.userId!);
      
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
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);

      if (!phonebook || phonebook.userId !== req.userId!) {
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
      const { name, description } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Phonebook name is required" });
      }

      const phonebook = await storage.createPhonebook({
        userId: req.userId!,
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
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);

      if (!phonebook || phonebook.userId !== req.userId!) {
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
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);

      if (!phonebook || phonebook.userId !== req.userId!) {
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
      const phonebookId = parseInt(req.params.id);
      const phonebook = await storage.getPhonebook(phonebookId);

      if (!phonebook || phonebook.userId !== req.userId!) {
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

  // Upload media using channel token
  app.post("/api/media/upload", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { file, fileType, channelId } = req.body;

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

      // Get channel - if channelId provided, use it; otherwise use first available authorized channel
      let channel;
      if (channelId) {
        channel = await storage.getChannel(parseInt(channelId));
        if (!channel || channel.userId !== req.userId!) {
          return res.status(403).json({ error: "Channel not found or access denied" });
        }
      } else {
        // Find first active, authorized channel for this user
        const userChannels = await storage.getChannelsForUser(req.userId!);
        channel = userChannels.find(c => 
          c.status === "ACTIVE" && 
          c.authStatus === "AUTHORIZED" && 
          c.whapiChannelToken
        );
        
        if (!channel) {
          return res.status(400).json({ error: "No authorized channel available. Please authorize a channel first." });
        }
      }

      if (!channel.whapiChannelToken) {
        return res.status(400).json({ error: "Channel not authorized" });
      }

      // Upload to Gate API using channel token
      const authToken = channel.whapiChannelToken.startsWith("Bearer ") 
        ? channel.whapiChannelToken 
        : `Bearer ${channel.whapiChannelToken}`;

      const uploadResponse = await fetch("https://gate.whapi.cloud/media", {
        method: "POST",
        headers: {
          "Authorization": authToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          media: file // Send the data URL directly
        })
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Media upload failed:", errorText);
        throw new Error(`Upload failed: ${uploadResponse.status === 401 ? 'Unauthorized' : 'Server error'}`);
      }

      const uploadData = await uploadResponse.json();
      console.log("WHAPI upload response:", JSON.stringify(uploadData, null, 2));
      
      const mediaId = uploadData.media?.[0]?.id;

      if (!mediaId) {
        throw new Error("No media ID returned from upload service");
      }

      // Step 2: Retrieve the media link via GET request
      const getMediaResponse = await fetch("https://gate.whapi.cloud/media", {
        method: "GET",
        headers: {
          "Authorization": authToken,
          "Content-Type": "application/json"
        }
      });

      if (!getMediaResponse.ok) {
        const errorText = await getMediaResponse.text();
        console.error("Failed to retrieve media details:", errorText);
        throw new Error("Failed to retrieve media link");
      }

      const mediaListData = await getMediaResponse.json();
      console.log("WHAPI media list response:", JSON.stringify(mediaListData, null, 2));
      
      // Find the uploaded file in the response
      const uploadedFile = mediaListData.files?.find((f: any) => f.id === mediaId);
      
      if (!uploadedFile || !uploadedFile.link) {
        console.error("Media file not found in list or missing link", { mediaId, uploadedFile });
        throw new Error("Failed to retrieve media link from service");
      }

      const mediaLink = uploadedFile.link;

      // Store upload record
      await storage.createMediaUpload({
        userId: req.userId!,
        whapiMediaId: mediaId,
        fileName: req.body.fileName || null,
        fileType: fileType,
        fileSizeMB: Math.round(fileSizeMB),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      res.json({ 
        mediaId: mediaId,
        url: mediaLink, // Use the link retrieved from GET /media
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
      const phonebookId = parseInt(req.params.id);
      const { channelId } = req.body;

      if (!channelId) {
        return res.status(400).json({ error: "Channel ID is required" });
      }

      // Verify phonebook ownership
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== req.userId!) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      // Verify channel ownership
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId!) {
        return res.status(403).json({ error: "Channel not found or access denied" });
      }

      // Get all contacts
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      if (contacts.length === 0) {
        return res.status(400).json({ error: "Phonebook has no contacts" });
      }

      // Create job
      const job = await storage.createJob({
        userId: req.userId!,
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
          buttons: buttons,
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
      const phonebookId = parseInt(req.params.id);
      const { channelId, header, body, footer, buttons, messageType, mediaUrl } = req.body;

      if (!channelId || !body) {
        return res.status(400).json({ error: "Channel ID and message body are required" });
      }

      // Verify phonebook ownership
      const phonebook = await storage.getPhonebook(phonebookId);
      if (!phonebook || phonebook.userId !== req.userId!) {
        return res.status(404).json({ error: "Phonebook not found" });
      }

      // Verify channel ownership
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== req.userId!) {
        return res.status(403).json({ error: "Channel not found or access denied" });
      }

      // Get all contacts
      const contacts = await storage.getContactsForPhonebook(phonebookId);
      if (contacts.length === 0) {
        return res.status(400).json({ error: "Phonebook has no contacts" });
      }

      // Create job
      const job = await storage.createJob({
        userId: req.userId!,
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
          buttons: buttons || [],
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
          // Validate phone has country code (starts with +)
          if (!phone.startsWith('+')) {
            errors.push("Phone number must include country code (e.g., +973...)");
          } else if (phone.length < 8) {
            errors.push("Phone number is too short");
          }
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

      // Insert valid contacts
      let insertedCount = 0;
      for (const contact of validContacts) {
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
        },
        invalidRows: invalidRows.length > 0 ? invalidRows : undefined,
      });
    } catch (error: any) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: error.message || "Failed to import CSV" });
    }
  });

  // ============================================================================
  // WORKFLOWS
  // ============================================================================

  // Get workflows
  app.get("/api/workflows", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const workflows = await storage.getWorkflowsForUser(req.userId!);
      res.json(workflows);
    } catch (error: any) {
      console.error("Get workflows error:", error);
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });

  // Create workflow
  app.post("/api/workflows", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const validationResult = insertWorkflowSchema.extend({ userId: z.number() }).safeParse({
        ...req.body,
        userId: req.userId!,
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten() 
        });
      }

      const { name, definitionJson } = validationResult.data;

      const workflow = await storage.createWorkflow({
        userId: req.userId!,
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
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow || workflow.userId !== req.userId!) {
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
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow || workflow.userId !== req.userId!) {
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
      const workflowId = parseInt(req.params.id);
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow || workflow.userId !== req.userId!) {
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

  // Test send workflow node message
  app.post("/api/workflows/test-message", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { nodeType, config, phone, channelId } = req.body;

      if (!phone || !nodeType || !config || !channelId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get the specified channel
      const channel = await storage.getChannel(channelId);

      if (!channel || channel.userId !== req.userId!) {
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
      // Get user's workflows
      const userWorkflows = await storage.getWorkflowsForUser(req.userId!);
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
      const jobs = await storage.getJobsForUser(req.userId!);
      res.json(jobs);
    } catch (error: any) {
      console.error("Get jobs error:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get job details with messages
  app.get("/api/jobs/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);

      if (!job || job.userId !== req.userId!) {
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
      let jobStatus: "QUEUED" | "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "PARTIAL" = "QUEUED";
      const total = messages.length;
      if (failed === total) {
        jobStatus = "FAILED";
      } else if (failed > 0 && (delivered + read + replied + failed) === total) {
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
      
      // Update job statistics if they differ from database
      if (job.queued !== queued || job.pending !== pending || job.sent !== sent || 
          job.delivered !== delivered || job.read !== read || job.failed !== failed || 
          job.replied !== replied || job.status !== jobStatus) {
        await storage.updateJob(jobId, {
          queued,
          pending,
          sent,
          delivered,
          read,
          failed,
          replied,
          status: jobStatus,
        });
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

  // Update user subscription overrides (admin only)
  app.patch("/api/admin/users/:id/overrides", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { dailyMessagesLimit, bulkMessagesLimit, channelsLimit, chatbotsLimit, pageAccess } = req.body;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get active subscription
      const subscription = await storage.getActiveSubscriptionForUser(userId);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      // Build overrides object
      const overrides: any = {};
      if (dailyMessagesLimit !== undefined) overrides.dailyMessagesLimit = dailyMessagesLimit;
      if (bulkMessagesLimit !== undefined) overrides.bulkMessagesLimit = bulkMessagesLimit;
      if (channelsLimit !== undefined) overrides.channelsLimit = channelsLimit;
      if (chatbotsLimit !== undefined) overrides.chatbotsLimit = chatbotsLimit;
      if (pageAccess !== undefined) overrides.pageAccess = pageAccess;

      // Update subscription with overrides
      await storage.updateSubscription(subscription.id, overrides);

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

      // Get plan and calculate days
      const plan = await storage.getPlan(payment.planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const days = getDaysFromBillingPeriod(plan.billingPeriod);

      // Add days to main balance pool
      await storage.updateMainDaysBalance(days);
      
      // Create balance transaction for audit trail
      await storage.createBalanceTransaction({
        type: "topup",
        days,
        channelId: null,
        userId: payment.userId,
        note: `Offline payment approved for ${plan.name} (${days} days)`,
      });

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

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "APPROVE_PAYMENT",
        meta: {
          entity: "offline_payment",
          entityId: paymentId,
          days,
          adminId: req.userId
        },
      });

      res.json({ success: true, daysAdded: days });
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
      
      const plan = await storage.updatePlan(planId, req.body);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

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
        billingPeriod: original.billingPeriod,
        requestType: original.requestType,
        paymentMethods: duplicatePaymentMethods as any, // Remove PayPal - admin must add with new Plan ID
        paypalPlanId: null, // Reset PayPal Plan ID for duplicates (must be unique per plan)
        published: false,
        sortOrder: original.sortOrder + 1,
        dailyMessagesLimit: original.dailyMessagesLimit,
        bulkMessagesLimit: original.bulkMessagesLimit,
        channelsLimit: original.channelsLimit,
        chatbotsLimit: original.chatbotsLimit,
        pageAccess: original.pageAccess as any,
        features: original.features as any,
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

  // Archive/delete plan (soft delete by unpublishing)
  app.delete("/api/admin/plans/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const planId = parseInt(req.params.id);
      
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      await storage.updatePlan(planId, { published: false });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        targetType: "plan",
        targetId: planId,
        action: "ARCHIVE_PLAN",
        meta: { planName: plan.name },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Archive plan error:", error);
      res.status(500).json({ error: "Failed to archive plan" });
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

  // WHAPI incoming message webhook (user-specific)
  app.post("/webhooks/whapi/:userId/:webhookToken", async (req: Request, res: Response) => {
    try {
      const { userId, webhookToken } = req.params;
      const webhookPayload = req.body;

      console.log(`Webhook received for user ${userId}:`, webhookPayload);

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
        console.error("Invalid webhook token");
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

      // Extract phone from chat_id (format: "PHONE@s.whatsapp.net")
      // Example: "97339116526@s.whatsapp.net" -> "97339116526"
      const chatId = incomingMessage.chat_id || "";
      const phone = chatId.split('@')[0]; // Extract phone number before @
      
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
            // Send welcome message from entry node (if configured)
            const definition = activeWorkflow.definitionJson as { nodes: any[], edges: any[] };
            const entryNodeId = activeWorkflow.entryNodeId;
            
            console.log(`Entry node ID: ${entryNodeId}, Total nodes: ${definition.nodes?.length || 0}`);
            
            if (entryNodeId) {
              const entryNode = definition.nodes?.find((n: any) => n.id === entryNodeId);
              
              if (entryNode) {
                console.log(`Found entry node, sending message...`);
                try {
                  // Send the entry node's message
                  const response = await sendNodeMessage(phone, entryNode, activeWorkflow.userId);
                  executionLog.responsesSent.push(response);
                  console.log(`Sent welcome message to ${phone} from entry node ${entryNodeId}`);
                } catch (sendError: any) {
                  // Log the error but don't fail the whole workflow execution
                  const errorMsg = sendError.message || String(sendError);
                  console.error(`Failed to send entry node message: ${errorMsg}`);
                  executionLog.errorMessage = `Failed to send welcome message: ${errorMsg}`;
                  executionLog.status = "ERROR";
                }
              } else {
                console.log(`Entry node ${entryNodeId} not found in workflow definition`);
                executionLog.errorMessage = `Entry node ${entryNodeId} not found in workflow definition`;
              }
            } else {
              // No entry node configured - workflow will only respond to button/list interactions
              console.log(`No entry node configured for workflow ${activeWorkflow.id} - skipping welcome message`);
            }

            // Update conversation state for tracking
            const conversationState = await db
              .select()
              .from(conversationStates)
              .where(
                and(
                  eq(conversationStates.workflowId, activeWorkflow.id),
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
                workflowId: activeWorkflow.id,
                phone,
                lastMessageAt: now,
                lastMessageDate: now,
                currentNodeId: entryNodeId,
              });
            }
          } else {
            // Not first message of day - do nothing (as per spec)
            console.log("Not first message of day, no action taken");
          }
        } else if (messageType === "button_reply") {
          // Find the node linked to this button_id using workflow edges
          const definition = activeWorkflow.definitionJson as { nodes: any[], edges: any[] };
          
          // Try to find edge by sourceHandle first (new multi-handle workflows)
          // The sourceHandle is automatically set by ReactFlow when connecting from a specific handle
          let targetEdge = definition.edges?.find((edge: any) => edge.sourceHandle === buttonId);
          
          // FALLBACK: For legacy workflows without sourceHandle, check node button configs
          // This maintains backward compatibility with existing workflows
          if (!targetEdge) {
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
              
              return hasMatchingButton || hasMatchingRow;
            });
          }

          if (targetEdge) {
            const targetNodeId = targetEdge.target;
            const targetNode = definition.nodes?.find((n: any) => n.id === targetNodeId);
            
            if (targetNode) {
              // Send the target node's message
              const response = await sendNodeMessage(phone, targetNode, activeWorkflow.userId);
              executionLog.responsesSent.push(response);

              // Update conversation state
              await db
                .update(conversationStates)
                .set({
                  lastMessageAt: new Date(),
                  currentNodeId: targetNodeId,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(conversationStates.workflowId, activeWorkflow.id),
                    eq(conversationStates.phone, phone)
                  )
                );
            }
          } else {
            console.log(`No target node found for button_id: ${buttonId}`);
          }
        }

        // Log successful execution
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

      console.log(`[Bulk Webhook] Received for user ${userId}:`, JSON.stringify(webhookPayload));

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

  // Helper function to send node message via WHAPI
  async function sendNodeMessage(phone: string, node: any, workflowUserId: number): Promise<any> {
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
      return await sendInteractiveMessage(channelToken, payload);
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
      return await sendInteractiveMessage(channelToken, payload);
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
      return await sendInteractiveMessage(channelToken, payload);
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
      return await sendCarouselMessage(channelToken, {
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
    }

    console.log(`Unsupported node type: ${nodeType}`);
    return { success: false, message: "Unsupported node type" };
  }

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

  // Get auth settings (public - needed for home page)
  app.get("/api/settings/auth", async (req: Request, res: Response) => {
    try {
      const enableSignin = await storage.getSetting("enable_signin");
      const enableSignup = await storage.getSetting("enable_signup");
      
      res.json({
        enableSignin: enableSignin?.value !== "false", // Default true
        enableSignup: enableSignup?.value !== "false", // Default true
      });
    } catch (error: any) {
      console.error("Get auth settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update auth settings (admin only)
  app.put("/api/admin/settings/auth", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { enableSignin, enableSignup } = req.body;
      
      if (typeof enableSignin === "boolean") {
        await storage.setSetting("enable_signin", enableSignin.toString());
      }
      if (typeof enableSignup === "boolean") {
        await storage.setSetting("enable_signup", enableSignup.toString());
      }

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "UPDATE_SETTINGS",
        meta: {
          entity: "auth_settings",
          updates: { enableSignin, enableSignup },
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
        bulk: false,
        templates: false,
        workflows: false,
        outbox: false,
        logs: false,
        bulkLogs: false,
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

  // ============================================================================
  // USE CASES ROUTES
  // ============================================================================

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
      const subscription = await storage.getActiveSubscriptionForUser(req.userId!);
      if (!subscription) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      await storage.updateSubscription(subscription.id, { status: "CANCELLED" });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "CANCEL_OWN_SUBSCRIPTION",
        meta: {
          entity: "subscription",
          entityId: subscription.id,
          planId: subscription.planId,
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
      const validation = z.object({
        newPassword: z.string().min(6, "Password must be at least 6 characters"),
      }).safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }

      const { newPassword } = validation.data;
      const passwordHash = await hashPassword(newPassword);

      await storage.updateUser(req.userId!, { passwordHash });

      await storage.createAuditLog({
        actorUserId: req.userId!,
        action: "RESET_PASSWORD",
        meta: {
          entity: "user",
          userId: req.userId!,
        },
      });

      res.json({ message: "Password reset successfully" });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
}
