# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a production-ready SaaS platform designed for comprehensive WhatsApp automation. It enables businesses to manage multiple WhatsApp channels, send bulk and individual messages using templates, develop interactive chatbots with workflow automation, and integrate with WHAPI Partner for billing. The platform's primary goal is to enhance customer engagement and operational efficiency through streamlined WhatsApp communication solutions, offering significant market potential for businesses leveraging WhatsApp.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform is built with a React TypeScript frontend utilizing Vite, Wouter, TanStack Query, Tailwind CSS, and shadcn/ui. The backend is an Express.js application with TypeScript, Drizzle ORM, and PostgreSQL. A days-based billing system charges for active channels, managed by a daily cron job, with messaging limits enforced by the user's plan. Channel management is integrated with WHAPI for authentication and lifecycle events.

**Core Features:**
- **Authentication:** JWT-based with httpOnly cookies, supporting registration, login, and role-based access (user/admin).
- **Dashboard:** Provides metrics, subscription status, and an activity feed.
- **Channel Management:** Admin-controlled activation workflow including user creation, admin activation (consuming days and calling WHAPI), and user QR code authorization. QR polling checks for HTTP 409 status code every 2 seconds.
- **Messaging (Send Page):** Interactive message sending via WHAPI Gate API, supporting channel selection, recipient, message content (header, body, footer), and up to 3 buttons. Plan limits enforce daily message quotas.
- **Templates:** CRUD operations for message templates with preview functionality.
- **Workflows:** Visual drag-and-drop chatbot/automation builder using ReactFlow (@xyflow/react) with a full-screen canvas, horizontal auto-layout, multi-output handles for interactive messages, and node deletion functionality.
    - **Message Node Types:** Supports 10 WHAPI message types via webhook automation:
        - **Interactive Messages:** Quick Reply Buttons, Buttons with Image/Video, List Message, Call Button, URL Button, Copy/OTP Button, Carousel
        - **Terminal Messages:** Text (message.text), Media (message.media), Location (message.location)
    - **Node Configuration:** WHAPI-compliant message structure editors for header, body, footer, and action fields. Terminal nodes (text/media/location) end conversations with no further routing.
    - **Testing & Live Toggle:** Each node includes a test button for sending messages to specified phone numbers. Workflows can be toggled between Live (process webhooks, send responses) and Stopped (log only) states, with optimistic UI updates.
    - **Automated Message Routing:** Incoming WHAPI webhook messages are routed based on:
        - **First Message of Day Trigger:** Timezone-aware detection (Asia/Bahrain) triggers the workflow's entry node message on the first text message of each calendar day.
        - **Button/List Replies:** Extracts IDs from WHAPI replies to route to specific workflow edges or node button configurations.
    - **Webhook Endpoints:** Each workflow has a unique, user-specific webhook URL.
    - **Entry Node Configuration:** Ability to set a welcome message for first-time contacts.
    - **Inactive Workflow Handling:** Webhook handler logs all messages but only sends automated responses for Live workflows.
- **Outbox:** Displays message sending job statuses (queued, pending, sent, delivered, read, failed, replied) with detailed message information, provider message IDs, button/list reply tracking, and error details. Auto-refreshes every 3 seconds for near-real-time updates.
- **Bulk Message Status Tracking (Nov 1):** Real-time webhook-based status tracking for bulk messages:
    - **Message ID Capture:** Every sent message captures the WHAPI provider message ID (`providerMessageId`) for tracking.
    - **Bulk Webhook Endpoint:** Each user has a unique webhook URL (`/webhooks/bulk/:userId/:bulkWebhookToken`) for receiving delivery, read, failed, and reply events from WHAPI.
    - **Reply Tracking:** Captures button clicks (Confirm/Reschedule/Cancel), list selections, and text replies with full payload storage.
    - **Job Statistics:** Real-time recalculation of job counters (delivered, read, replied, failed) when webhook events are received.
    - **Admin Monitoring:** Webhook URLs are visible only to admins in User Details page for configuration and monitoring.
    - **⚠️ CRITICAL SETUP:** The bulk webhook URL must be configured in WHAPI channel settings to receive status updates. Without this, statuses will remain "SENT" and won't update to delivered/read/replied.
- **Pricing:** Displays plans with duration toggles, integrating PayPal for subscriptions and supporting offline payments.
- **Admin Dashboard:** User management, billing adjustments, offline payment approval, and channel activation controls.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.

**Design System:**
- **Color Palette:** Dark mode primary with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter for primary text, JetBrains Mono for code/numbers.
- **Components:** shadcn/ui with custom elements for badges, progress bars, and cards.
- **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Includes entities for Users, Plans (with `billingPeriod` enum, `requestType`, `published`, `publishedOnHomepage`, `pageAccess`, `chatbotsLimit`), Subscriptions (with per-user overrides: `dailyMessagesLimit`, `bulkMessagesLimit`, `channelsLimit`, `chatbotsLimit`), Channels, Templates, Jobs, Messages (with delivery tracking and unique `providerMessageId`), Workflows (with `webhookToken`, `isActive`, `entryNodeId`, `definitionJson`), ConversationStates, FirstMessageFlags (for idempotent first-message detection), WorkflowExecutions, OfflinePayments (with `requestType`), AuditLogs (with `actorUserId` for tracking action performers), Settings, and BalanceTransactions.

**Recent Schema Changes (Oct 30-31, Nov 1, 2025):**
- **Plans Table**: Migrated from `durationDays` to `billingPeriod` enum (MONTHLY/SEMI_ANNUAL/ANNUAL), added `requestType` enum (PAID/REQUEST_QUOTE/BOOK_DEMO), `published` boolean (visible to authenticated users), `publishedOnHomepage` boolean (visible on landing page), `pageAccess` JSONB for feature access control (includes Dashboard, Pricing, Channels, Send, Templates, Workflows, Outbox, Logs), and `chatbotsLimit` for workflow restrictions.
- **Subscriptions Table**: Added per-user override fields (`dailyMessagesLimit`, `bulkMessagesLimit`, `channelsLimit`, `chatbotsLimit`, `pageAccess`) to allow custom limits beyond plan defaults.
- **OfflinePayments Table**: Added `requestType` field to track payment request types.
- **AuditLogs Table**: Uses `actorUserId` (mapped to `user_id` column) to track which admin/user performed each action.
- **PlanRequests Table (Oct 31)**: New table for REQUEST_QUOTE and BOOK_DEMO submissions with fields: id, planId, name, phone, businessEmail, message, requestedDate (nullable for demos), status enum (PENDING/REVIEWED/CONTACTED/CONVERTED/REJECTED), createdAt. Business email validation rejects free email providers (gmail, yahoo, hotmail, outlook, aol, icloud, etc.).
- **Bulk Message Tracking (Nov 1)**: 
  - **Users Table**: Added `bulkWebhookToken` (UUID, auto-generated) for secure bulk webhook authentication.
  - **Messages Table**: Added `lastReplyType` enum (text, buttons_reply, list_reply, other), `lastReplyPayload` JSONB for storing full webhook reply data.
  - **New Enum**: `lastReplyTypeEnum` for categorizing reply types.
  - **Webhook Endpoint**: `/webhooks/bulk/:userId/:bulkWebhookToken` processes delivery, read, failed, and reply events, updates message statuses, and recalculates job statistics.
  - **⚠️ CRITICAL BUG FIX (Nov 1)**: Button/list reply capture now correctly uses `context.quoted_id` from webhook payload to lookup original sent message. WHAPI sends reply messages with a NEW message ID in the `id` field, while the original message ID is in `context.quoted_id`.
- **Bulk Logs System (Nov 1)**: 
  - **BulkLogs Table**: New table for comprehensive lifecycle logging with fields: id, userId, jobId, level (info/warning/error), category (webhook/status/reply/send/error), message, meta (JSONB), createdAt.
  - **Storage Methods**: `createBulkLog()` for creating logs, `getBulkLogs()` for querying with filters (level, category, limit).
  - **API Endpoint**: GET `/api/bulk-logs?level=error&category=reply&limit=50` for filtering and viewing logs.
  - **Webhook Lifecycle Logging**: All bulk webhook events logged at key points (webhook received, status updates, reply capture, errors).
  - **⚠️ CRITICAL SAFETY**: All logging calls wrapped in try-catch blocks to prevent logging failures from blocking webhook processing. User ID extracted from job context instead of URL params to avoid NaN foreign key violations.
- **Helper Function**: `getDaysFromBillingPeriod(period)` converts billing period enums to days (30/180/365).
- **Default Page Access (Oct 31)**: New user signups now receive default access to Dashboard, Channels, and Pricing pages until they subscribe to a plan. The `/api/me` endpoint returns `effectivePageAccess` which merges plan + subscription overrides for subscribed users, or default access for non-subscribed users.
- **UI Changes**: 
  - Removed redundant Chatbot page (now all functionality is consolidated in Workflows page).
  - Added dual publishing controls: `published` (for authenticated users' pricing page) and `publishedOnHomepage` (for public landing page).
  - Landing page now conditionally hides pricing section and navigation links when no plans are published to homepage.
  - Added "Logs" checkbox to Page Access Overrides in Admin → User Details & Overrides and Plan creation/editing forms.
  - Admin Dashboard queries now use `refetchOnMount` and `refetchOnWindowFocus` to ensure fresh data display.
  - **REQUEST_QUOTE/BOOK_DEMO Plans (Oct 31)**: Plans can be configured as quote requests or demo bookings instead of paid subscriptions. Pricing page shows "Custom Pricing"/"Contact Us" labels and "Request Quote"/"Book Demo" CTAs instead of prices. Quote/demo forms collect name, business email, phone, and message (+ preferred date for demos). Admin dashboard includes "Plan Requests" tab with status filtering (PENDING/REVIEWED/CONTACTED/CONVERTED/REJECTED) and status update controls.

## Backend API Routes

**Admin Routes (require admin role):**
- **Plans Management**: GET/POST/PUT/DELETE `/api/admin/plans`, duplicate, toggle publish
- **User Management**: 
  - GET `/api/admin/users` - List all users with enriched data
  - POST `/api/admin/users/:id/add-days` - Add days to user balance
  - POST `/api/admin/users/:id/remove-days` - Remove days from user balance
  - POST `/api/admin/users/:id/ban` - Ban user (blocks login and API access)
  - POST `/api/admin/users/:id/unban` - Unban user
  - PATCH `/api/admin/users/:id/overrides` - Update per-user subscription overrides (limits, page access)
  - GET `/api/admin/users/:id/effective-limits` - Get computed effective limits (plan + overrides)
- **Channels Management**:
  - GET `/api/admin/users/:userId/channels` - List user channels
  - POST `/api/admin/users/:userId/channels/:channelId/activate` - Activate/extend channel
  - DELETE `/api/admin/channels/:id` - Delete channel via WHAPI, return days to admin balance
- **Offline Payments**: GET `/api/admin/offline-payments`, approve/reject
- **Plan Requests**:
  - GET `/api/admin/plan-requests` - List all quote/demo requests with enriched plan data
  - PATCH `/api/admin/plan-requests/:id/status` - Update request status
- **Balance Management**: GET/POST balance, transactions, adjust

**Public Routes (no auth required):**
- POST `/api/plan-requests` - Submit quote request or demo booking with business email validation

## External Dependencies
- **WHAPI Partner API (https://manager.whapi.cloud):** For channel management (creation, extension, deletion).
- **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation and sending all message types:
  - Text messages: `/messages/text`
  - Media messages: `/messages/media` (image/video/audio/document)
  - Location messages: `/messages/location`
  - Interactive messages: `/messages/interactive`
  - Carousel messages: `/messages/carousel`
- **PayPal Web SDK:** For subscription payments.
- **PostgreSQL (Neon):** Primary database, managed by Drizzle ORM.
- **node-cron:** For scheduling daily tasks.