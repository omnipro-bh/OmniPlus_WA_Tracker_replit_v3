import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { workflows, conversationStates, workflowExecutions } from "@shared/schema";
import { hashPassword, comparePassword, generateToken, requireAuth, requireAdmin, type AuthRequest } from "./auth";
import { z } from "zod";
import type { InsertUser, InsertChannel, InsertTemplate, InsertJob, InsertMessage, InsertWorkflow, InsertOfflinePayment } from "@shared/schema";
import { 
  insertChannelSchema, 
  insertTemplateSchema, 
  insertJobSchema, 
  insertMessageSchema, 
  insertWorkflowSchema,
  insertOfflinePaymentSchema 
} from "@shared/schema";
import { createPaypalOrder, capturePaypalOrder, loadPaypalDefault, verifyPayPalOrder } from "./paypal";
import * as whapi from "./whapi";

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
      if (subscription) {
        currentPlan = await storage.getPlan(subscription.planId);
      }

      // Get channels count
      const channels = await storage.getChannelsForUser(user.id);
      const channelsUsed = channels.length;
      const channelsLimit = currentPlan?.channelsLimit || 0;

      // Calculate total days remaining from all channels
      const totalDaysRemaining = channels.reduce((sum, channel) => {
        return sum + (channel.daysRemaining || 0);
      }, 0);

      // Calculate messages sent today (simplified)
      const messagesSentToday = 0; // This would be computed from jobs/messages table in reality

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({
        ...userWithoutPassword,
        daysBalance: totalDaysRemaining, // Override deprecated field with channel aggregate
        currentSubscription: subscription,
        currentPlan,
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
      let days = plan.durationDays;
      if (durationType === "SEMI_ANNUAL") {
        days = plan.durationDays * 6;
      } else if (durationType === "ANNUAL") {
        days = plan.durationDays * 12;
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
        userId: req.userId!,
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
      }).safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten() 
        });
      }

      const { planId, durationType, orderId } = validationResult.data;

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
      let days = plan.durationDays;
      
      if (durationType === "SEMI_ANNUAL") {
        durationMultiplier = 6;
        discountMultiplier = 0.95; // 5% discount
        days = plan.durationDays * 6;
      } else if (durationType === "ANNUAL") {
        durationMultiplier = 12;
        discountMultiplier = 0.9; // 10% discount
        days = plan.durationDays * 12;
      }

      // Verify payment amount matches expected price for duration (with discount)
      const expectedAmount = ((plan.price * durationMultiplier * discountMultiplier) / 100).toFixed(2); // Convert cents to dollars
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
        userId: req.userId!,
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

  // Submit offline payment
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

      const { planId, amount, currency, reference } = validationResult.data;

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const payment = await storage.createOfflinePayment({
        userId: req.userId!,
        planId,
        amount,
        currency: currency || "USD",
        reference,
        status: "PENDING",
      });

      await storage.createAuditLog({
        userId: req.userId!,
        action: "OFFLINE_PAYMENT_SUBMIT",
        meta: {
          entity: "offline_payment",
          entityId: payment.id,
          planId,
          amount,
          currency
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
            userId: req.userId!,
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
          error: "Failed to create WHAPI channel", 
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
        userId: req.userId!,
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
        return res.status(400).json({ error: "WHAPI channel token not available" });
      }

      // Fetch QR code from WHAPI using channel token
      try {
        const qrData = await whapi.getChannelQRCode(channel.whapiChannelToken);
        res.json(qrData);
      } catch (whapiError: any) {
        console.error("Failed to fetch QR code from WHAPI:", whapiError.message);
        // Return the actual WHAPI error message for accurate troubleshooting
        res.status(500).json({ error: whapiError.message || "Failed to fetch QR code from WHAPI" });
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
        userId: req.userId!,
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
        userId: req.userId!,
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
        userId: req.userId!,
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
        userId: req.userId!,
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
      const { channelId, to, header, body, footer, buttons } = req.body;

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
      });

      // Call WHAPI to send the message
      try {
        const whapiPayload = {
          to,
          type: "button",
          ...(header && { header: { text: header } }),
          body: { text: body },
          ...(footer && { footer: { text: footer } }),
          action: {
            buttons: (buttons || []).map((btn: any, idx: number) => ({
              type: "quick_reply",
              title: btn.title || btn,
              id: btn.id || `btn${idx + 1}`
            }))
          }
        };

        const whapiResponse = await whapi.sendInteractiveMessage(
          channel.whapiChannelToken!,
          whapiPayload
        );

        // Extract provider message ID from WHAPI response
        // Response structure: { sent: true, message: { id: "..." } }
        const providerMessageId = whapiResponse.message?.id || whapiResponse.id || whapiResponse.message_id;
        
        console.log(`[Send] WHAPI response:`, {
          sent: whapiResponse.sent,
          messageId: providerMessageId,
          fullResponse: JSON.stringify(whapiResponse).substring(0, 200)
        });

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
          userId: req.userId!,
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
        console.error("WHAPI send error:", whapiError);
        
        // Update message status to failed
        await storage.updateMessage(message.id, {
          status: "FAILED",
          error: whapiError.message || "Failed to send via WHAPI"
        });

        // Update job counters
        await storage.updateJob(job.id, {
          pending: 0,
          failed: 1,
        });

        return res.status(500).json({ 
          error: "Failed to send message via WHAPI",
          details: whapiError.message 
        });
      }

    } catch (error: any) {
      console.error("Send message error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Send bulk messages
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

      // Create messages
      for (const row of rows) {
        await storage.createMessage({
          jobId: job.id,
          to: row.phone,
          name: row.name || "",
          body: row.message,
          status: "QUEUED",
        });
      }

      await storage.createAuditLog({
        userId: req.userId!,
        action: "SEND_BULK",
        meta: {
          entity: "job",
          entityId: job.id,
          type: "BULK",
          count: rows.length
        },
      });

      res.json(job);
    } catch (error: any) {
      console.error("Bulk send error:", error);
      res.status(500).json({ error: "Failed to send bulk messages" });
    }
  });

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
        userId: req.userId!,
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
        userId: req.userId!,
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
        userId: req.userId!,
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
        .limit(500); // Limit to last 500 logs

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
        userId: req.userId!,
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
        userId: req.userId!,
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
        userId: req.userId!,
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

          const { passwordHash: _, ...userWithoutPassword } = user;
          return {
            ...userWithoutPassword,
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

  // Add days to user (admin only)
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
        userId: req.userId!,
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

  // Remove days from user (admin only)
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
        userId: req.userId!,
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
        
        // Check if WHAPI Partner account has insufficient days (402 error)
        if (whapiError.message && whapiError.message.includes("402")) {
          return res.status(503).json({ 
            error: "WHAPI Partner account has insufficient days", 
            details: "The WHAPI Partner account needs to be topped up with days to activate channels. Please contact the administrator."
          });
        }
        
        return res.status(500).json({ 
          error: "Failed to create/extend WHAPI channel", 
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
        userId: req.userId!,
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

  // Get offline payments (admin only)
  app.get("/api/admin/offline-payments", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const payments = await storage.getOfflinePayments("PENDING");

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

      const days = plan.durationDays;

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

      // Create subscription
      await storage.createSubscription({
        userId: payment.userId,
        planId: payment.planId,
        status: "ACTIVE",
        durationType: "MONTHLY",
        provider: "OFFLINE",
        transactionId: payment.reference,
      });

      await storage.createAuditLog({
        userId: req.userId!,
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
        userId: req.userId!,
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
        userId: req.userId!,
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
          // Check if this is the first message of the day from this phone
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
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const isFirstMessageToday = 
            !conversationState.length ||
            new Date(conversationState[0].lastMessageDate) < todayStart;

          if (isFirstMessageToday) {
            // Send welcome message
            const definition = activeWorkflow.definitionJson as { nodes: any[], edges: any[] };
            const entryNodeId = activeWorkflow.entryNodeId;
            
            if (entryNodeId) {
              const entryNode = definition.nodes?.find((n: any) => n.id === entryNodeId);
              
              if (entryNode) {
                // Send the entry node's message
                const response = await sendNodeMessage(phone, entryNode, activeWorkflow.userId);
                executionLog.responsesSent.push(response);
              }
            }

            // Update or create conversation state
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
    const { sendInteractiveMessage, sendCarouselMessage } = await import("./whapi");

    // Quick Reply Buttons
    if (nodeType === 'quickReply') {
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
}
