# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform designed for WhatsApp automation. Its primary purpose is to empower businesses with tools for managing multiple WhatsApp channels, facilitating bulk and individual messaging, and developing interactive chatbots with workflow automation. The platform integrates with WHAPI Partner for billing and aims to enhance customer engagement and operational efficiency through streamlined WhatsApp communication, presenting significant market potential.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform utilizes a modern tech stack with a React TypeScript frontend (Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript, Drizzle ORM, PostgreSQL). It operates on a days-based billing system, enforced by daily cron jobs and plan-specific messaging limits. Channel management is tightly integrated with WHAPI for authentication and lifecycle events.

**Core Features:**
- **Authentication:** JWT-based with user and admin roles.
- **Dashboard:** Metrics, subscription status, and activity feeds.
- **Channel Management:** Admin-controlled activation, user QR authorization.
- **Messaging:** Interactive message sending via WHAPI Gate API, supporting various content types, including 5 message types (text_buttons, image, image_buttons, video_buttons, document) with configurable buttons and plan limit enforcement.
- **Templates:** CRUD for message templates with preview.
- **Workflows:** A visual drag-and-drop chatbot/automation builder using ReactFlow, supporting WHAPI message types, configurable nodes, testing, and automated message routing.
- **Outbox:** Tracks message sending job statuses and details with auto-refreshing updates.
- **Bulk Message Status Tracking:** Real-time webhook-based status tracking.
- **Pricing:** Displays plans with duration toggles, integrating PayPal and supporting offline payments with coupons.
- **Admin Dashboard:** Management for users, billing, offline payments, channel activation, and dynamic homepage content.
- **Admin Settings:** Global configuration for authentication, bulk sending speed, default page access, and theme.
- **Homepage Content Management:** Admin tabs for managing dynamic 'Use Cases' and 'Homepage Features'.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.
- **Phonebook Management:** CRUD operations for phonebooks and contacts. Contacts support comprehensive message configurations (message type, media URL, buttons). CSV import with validation for contacts is supported.
- **Bulk Sending:** Supports sending personalized messages based on phonebook data or a uniform message to all contacts within a phonebook.

**Design System:**
- **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter (primary), JetBrains Mono (code/numbers).
- **Components:** shadcn/ui with custom elements.
- **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Key entities include Users, Plans (with billing periods, payment methods, PayPal Plan ID, publication status, page access, limits, file size limits), Subscriptions, Coupons, TermsDocuments, Channels, Templates, Jobs, Messages (with delivery tracking, `providerMessageId`, `messageType`, `mediaUrl`), Workflows (`webhookToken`, `isActive`, `entryNodeId`, `definitionJson`), Phonebooks, PhonebookContacts (with message type, media URL, and button configuration), MediaUploads, ConversationStates, FirstMessageFlags, WorkflowExecutions, OfflinePayments, AuditLogs, Settings, BalanceTransactions, PlanRequests, UseCases, and HomepageFeatures.

**Plans Payment System:**
- **Payment Methods:** Supports PayPal and offline payments, stored as a JSONB array.
- **PayPal Integration:** Requires a unique `paypalPlanId` field when enabled.
- **Plan Limits:** Defines daily single messages, daily bulk messages, channels, workflows, and media file sizes (image, video, document).

## External Dependencies
- **WHAPI Partner API (https://manager.whapi.cloud):** For channel management.
- **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation and sending messages.
- **PayPal Web SDK:** For subscription payments.
- **PostgreSQL (Neon):** Primary database.
- **node-cron:** For scheduling daily tasks.

## Recent Changes (November 7, 2025)

- **Comprehensive Pricing Controls System (Complete):**
  - **Purpose:** Full admin control over pricing page configuration including quarterly billing, configurable discounts, popular plan badges, and per-plan billing period enforcement
  - **Features Implemented:**
    - **QUARTERLY Billing Period:** Added 90-day billing period throughout entire stack (schema, backend routes, frontend UI, PayPal integration)
    - **Database-Driven Discount Percentages:** Three new fields per plan (quarterlyDiscountPercent, semiAnnualDiscountPercent, annualDiscountPercent) with 0-100% range, replacing hardcoded 5%/10% values
    - **Popular Plan Badge Control:** `isPopular` boolean field enables admins to mark any plan with "POPULAR" badge on pricing page
    - **Enabled Billing Periods:** `enabledBillingPeriods` JSONB array allows per-plan control of which billing periods are available for purchase
    - **Dynamic Pricing Page:** Billing period toggles automatically show/hide based on union of all plans' enabled periods
    - **Per-Plan Billing Enforcement:** Purchase buttons only shown for billing periods each plan supports; shows "Not available for [period] billing" message when unavailable
  - **Critical Bugs Fixed:**
    - **Discount Parsing:** Changed from `parseInt(...) || 5/10` to `Number.isNaN()` check with 0-100 clamping - now preserves explicit 0% discounts instead of forcing them to legacy defaults
    - **Billing Period Enforcement:** Added validation to prevent users from purchasing plans in unsupported billing periods
  - **Admin Panel Updates:**
    - New "Pricing Controls" section with discount percentage inputs (0-100%) for each billing period
    - Billing period checkboxes (Monthly, Quarterly, Semi-Annual, Annual) to control availability per plan
    - Popular Plan toggle switch to enable/disable POPULAR badge
  - **Database Schema Changes:**
    - Added `QUARTERLY` to billingPeriodEnum
    - Added `quarterlyDiscountPercent` (integer, default 0)
    - Added `semiAnnualDiscountPercent` (integer, default 5)
    - Added `annualDiscountPercent` (integer, default 10)
    - Added `enabledBillingPeriods` (JSONB, default ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"])
    - Added `isPopular` (boolean, default false)
  - **Testing:** Full E2E Playwright tests validated discount persistence (including 0% values), popular badge toggling, per-plan billing period enforcement, and PayPal/offline payment flows
  - **Result:** Admins have complete control over pricing page appearance and behavior; all discount values 0-100% persist correctly; per-plan billing restrictions prevent invalid purchases
  - **Location:** shared/schema.ts, server/routes.ts (PUT /api/admin/plans/:id), client/src/pages/admin.tsx (lines ~3220-3400), client/src/pages/pricing.tsx (discount calculation ~124-140, billing enforcement ~287-410)

- **Plan Deletion Fix (Critical):**
  - **Problem:** DELETE /api/admin/plans/:id was returning 200 success but not actually deleting plans from database
  - **Root Cause:** Route was only setting `published: false` (archiving) instead of deleting the record
  - **Fix Applied:**
    - Added `deletePlan(id)` method to IStorage interface and DatabaseStorage implementation
    - Updated DELETE route to call `storage.deletePlan(planId)` instead of updating published status
    - Added proper foreign key constraint error handling (PostgreSQL error code 23503)
    - Plans with active subscriptions, offline payments, or plan requests cannot be deleted (protected by FK constraints)
  - **Error Handling:**
    - 404: Plan not found
    - 400: Cannot delete due to foreign key constraints with user-friendly message
    - 200: Successfully deleted
  - **Result:** Plan deletion now works correctly - plans are actually removed from database
  - **Location:** server/storage.ts (deletePlan method), server/routes.ts (DELETE route ~4210-4247)
  - **Testing:** E2E test confirmed plans without dependencies delete successfully, plans with subscriptions are protected

- **Phonebook Limit System (Complete):**
  - **Purpose:** Enforce plan-based limits on number of contacts per phonebook
  - **Implementation:**
    - Added `phonebookLimit` field to both `plans` and `users` tables (nullable integer, -1 or negative = unlimited)
    - Created `getPhonebookLimit(userId)` helper function with hierarchical logic:
      1. Check user-level override first (if set, use that)
      2. Get ALL active subscriptions for user
      3. Use MOST PERMISSIVE limit (if any plan is unlimited, user gets unlimited; otherwise use highest limit)
      4. Normalize -1 and negative values to null (unlimited)
    - Validation enforcement in:
      - Manual "Add Contact" route: Checks current count vs limit before allowing addition
      - CSV Import route: **Allows partial imports** - imports up to the limit and skips remaining contacts
    - Direct database query (`db.query.subscriptions.findMany`) to handle users with multiple active subscriptions
  - **CSV Partial Import Feature:**
    - When CSV has more contacts than plan allows, system imports up to the limit instead of blocking entirely
    - Returns `skipped` count and descriptive `limitWarning` message
    - Frontend displays amber warning banner and "Skipped (Plan Limit)" row in Import Summary
    - Toast notification includes skipped count
    - Example: User with limit=3 uploads 5 contacts → imports first 3, skips 2, shows clear warning
  - **Edge Cases Handled:**
    - Users with no subscription = unlimited
    - Users with multiple active subscriptions = most permissive limit applies
    - User-level overrides take precedence over all plan limits
    - Negative values normalize to unlimited (null)
    - CSV imports trim to available slots (total limit - current contacts)
  - **Result:** Plan-based phonebook limits fully enforced with user-friendly partial import behavior
  - **Location:** server/routes.ts (helper ~48-103, CSV import ~2627-2673), client/src/pages/phonebook-detail.tsx (UI), shared/schema.ts
  - **Testing:** E2E tests confirmed limited plans block at limit, unlimited plans allow 5+ contacts, partial imports work correctly
  - **Note:** Verbose console logging enabled for debugging (`[PhonebookLimit]` prefix) - consider trimming for production

## Recent Changes (November 6, 2025 - Continued)

- **CSV Import Phone Number Validation Fix:**
  - **Problem:** CSV import was rejecting all rows as "invalid" because it required phone numbers to start with '+'
  - **Root Cause:** Validation logic incorrectly required '+' prefix, but WHAPI accepts phone numbers with country code without '+'
  - **Fix Applied:** Removed '+' prefix requirement from CSV import validation
  - **Result:** CSV imports now accept phone numbers with or without '+' prefix (e.g., both "97339116526" and "+97339116526" are valid)
  - **Location:** server/routes.ts (CSV import validation, lines ~2493-2508)

- **Local Media Upload System (Performance Fix):**
  - **Problem:** WHAPI media uploads taking 1.5-2 minutes per file, making the system unusable
  - **Solution:** Local-only file storage with inline base64 message sending
  - **Implementation:**
    - Save files locally to `/uploads` directory (~240ms, instant!)
    - Return original base64 data URL for inline message sending
    - Files stored as `{timestamp}-{randomId}.{ext}` with MIME type detection
    - Added 30-day automatic cleanup cron job (runs daily at 3 AM)
    - Express static middleware serves `/uploads` for local backup access
    - Messages send media inline as base64 (per WHAPI documentation)
  - **Result:** Upload time reduced from 1.5-2 minutes to <1 second (500x faster!)
  - **Location:** server/index.ts (static serving), server/routes.ts (upload + send endpoints), server/worker.ts (cleanup job)
  - **Note:** For image_buttons and video_buttons, media is sent as direct base64 string in header field per WHAPI API specs

- **User-Facing Error Message Cleanup:**
  - **Problem:** Error notifications displayed "WHAPI" brand name to end users
  - **Fix Applied:** Removed "WHAPI" from all user-facing error messages
  - **Result:** Cleaner, more professional error messages without vendor branding
  - **Note:** Console logging still includes "WHAPI" for admin debugging purposes
  - **Location:** server/routes.ts (multiple error responses)

- **Image/Video Buttons Media Fix (Critical):**
  - **Problem:** Messages with image_buttons and video_buttons types were sending without media attachments
  - **Root Cause:** Incorrect WHAPI payload structure - for button messages with media, the `media` field must be at ROOT level, not in `header`
  - **Fix Applied:**
    - Updated both single send and bulk send routes for image_buttons and video_buttons
    - Correct format per WHAPI docs: `{ "type": "button", "media": "data:image/png;base64,...", "body": {...}, "action": {...} }`
    - Previous attempts incorrectly used `header: { type: "image", image: base64 }` which WHAPI strips out
    - Both routes now use proper WHAPI interactive message format with media at root level
  - **Result:** Image + Buttons and Video + Buttons messages now send with media correctly attached
  - **Location:** server/routes.ts (single send: lines ~1312-1352, bulk send: lines ~1612-1640)
  - **Documentation Reference:** WHAPI "Send buttons with images" and "Send Buttons with Video" sections
