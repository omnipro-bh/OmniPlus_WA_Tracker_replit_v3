# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform for WhatsApp automation, enabling businesses to manage multiple WhatsApp channels, perform bulk and individual messaging, and build interactive chatbots with workflow automation. The platform aims to enhance customer engagement and operational efficiency through streamlined WhatsApp communication and integrates with WHAPI Partner for billing.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform features a React TypeScript frontend (Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript, Drizzle ORM, PostgreSQL). It employs a days-based billing system with daily cron jobs and plan-specific messaging limits.

**Core Features:**
-   **Authentication:** JWT-based with distinct user and admin roles.
-   **Dashboard:** Provides key metrics, subscription status, and activity feeds.
-   **Channel Management:** Admin-controlled activation and user QR authorization via WHAPI.
-   **Messaging:** Supports interactive message sending (text, image, video, document types with configurable buttons) via WHAPI Gate API, including a realistic WhatsApp-style preview with emoji picker.
-   **Templates:** CRUD operations for message templates with preview functionality.
-   **Workflows:** A visual drag-and-drop builder (ReactFlow) for chatbots, supporting WHAPI message types, configurable nodes (including HTTP Request nodes with comprehensive configuration and secure execution), testing, and automated routing.
-   **Outbox & Bulk Message Status Tracking:** Tracks message sending jobs and provides real-time status updates via webhooks.
-   **Safety Meter:** Real-time WhatsApp channel health monitoring from WHAPI Tools API, with plan-based access control.
-   **Pricing:** Displays plans with duration toggles, supports PayPal, offline payments, and free trials. Admins control pricing page configuration, including dual pricing (display price vs. PayPal price), discounts, and billing periods.
-   **Admin Dashboard & Settings:** Manages users, billing, payments, channel activation, dynamic homepage content, and global configurations like authentication, bulk sending speed, page access, theme, chat widget location, and HTTP Request allowlist.
-   **Phonebook Management:** CRUD for contacts, including CSV import and plan-based limits.
-   **Bulk Sending:** Personalized or uniform messages to phonebook contacts.
-   **Subscriber Tracking:** Automatic subscriber list management via keyword-based button interactions with configurable subscribe/unsubscribe keywords.
-   **Page Access Control:** Plans and admins can restrict user access to specific platform pages.

**Design System:**
-   **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
-   **Typography:** Inter (primary), JetBrains Mono (code/numbers).
-   **Components:** shadcn/ui supplemented with custom elements.
-   **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Key entities include Users, Plans, Subscriptions, Channels, Templates, Workflows, Phonebooks, Subscribers, and ConversationStates.

**Plans Payment System:**
-   Supports PayPal, offline payments, and free trials.
-   **Admin Balance Pool:** Central `mainDaysBalance` manages days for allocation. PayPal payments deduct from this pool.
-   **PayPal Integration:** Automated workflow for payment verification, days allocation, and WHAPI channel extension/creation, with rollback on WHAPI API failure.
-   **Offline Payment & Free Trial Workflow:** Admin-reviewed requests, requiring manual day allocation.
-   **Message Limit System:** Independent daily limits for single and bulk messages, with explicit support for "unlimited" (-1) quotas.

**Technical Implementations:**
-   **Local Media Upload:** Files saved locally and sent as inline base64, with automatic cleanup. Template media URLs are automatically resolved and converted to base64.
-   **Error Handling:** User-facing error messages are sanitized and WHAPI errors properly extracted from complex objects.
-   **WHAPI Media Structure:** Corrected WHAPI payload structure for various media types.
-   **WhatsApp Preview:** Custom phone mockup UI with interactive elements and real-time media preview.
-   **Emoji Support:** Integrated emoji-mart picker.
-   **HTTP Request Security:** Enforces HTTPS-only, admin-managed domain allowlist, no redirects, and limits on response size/timeout. Stores results in `conversation_states.context`.
-   **Webhook Message Validation:** Strictly validates inbound messages to prevent system events from triggering entry nodes. Additionally filters out group messages (`@g.us`) to ensure workflows only process private chats (`@s.whatsapp.net`), preventing unwanted bot responses in group conversations.
-   **HTTP Request Node Test Button:** Allows testing API configurations within the workflow builder.
-   **Chat Widget Location Control:** Admins control Tawk.to chat widget visibility.
-   **PayPal Environment Configuration:** Managed centrally via backend configuration.
-   **Dual Pricing System:** Supports separate display pricing (e.g., BHD) for users and PayPal pricing (USD) for payment processing.
-   **Outbox Job Status Updates:** Ensures real-time status updates for single and bulk message jobs.
-   **Workflow Builder Persistence (Nov 2025):** Fixed critical bug where workflow saves would fail after the first save, requiring users to close and reopen the builder for each change. The mutation now properly parses the JSON response instead of corrupting the workflow state with a raw Response object. This ensures webhook URLs display correctly and multiple sequential saves work reliably.
-   **Multi-Workflow Entry Node Triggering (Nov 2025):** Fixed "First Message of Day" logic to trigger entry nodes for ALL active workflows with entry nodes configured, not just the one that received the webhook. When a user sends their first message of the day, all active workflows with entry nodes now execute independently, enabling parallel workflow automation.
-   **Bulk Send Error Handling (Nov 2025):** Improved error message extraction for all send endpoints (single, bulk, uniform). WHAPI errors are now properly stringified from complex objects instead of displaying `[object Object]`. Added media validation to prevent jobs from being created without required media files for document/image/video message types.
-   **Admin User Impersonation (Nov 2025):** Admins can "Login as User" to view the platform as any non-admin user for debugging and support. Features: JWT-based impersonation preserving admin privileges, persistent amber banner across all pages, secure exit mechanism, audit logging of all impersonation actions, validation of impersonated user on every request, and prevention of impersonating admins or deleted/banned users. Implementation maintains proper authorization (admin retains admin access during impersonation) with separate request context for impersonated user data. **Fixed Nov 22, 2025:** Resolved issues where banner wasn't showing and pages were displaying admin data instead of impersonated user data. The `/api/me` endpoint now correctly returns the impersonated user's subscription, channels, and messages in the main response with admin context in the `impersonation` metadata field. Page access control (`ProtectedRoute`) now properly enforces the impersonated user's permissions instead of bypassing checks for admins. **Fixed Nov 23, 2025:** Updated ALL user-scoped endpoints to use `getEffectiveUserId()` helper function for consistent impersonation context. Both GET endpoints (data retrieval) and POST endpoints (resource creation) now respect impersonation, ensuring admins see and create resources for the impersonated user while audit logs preserve the real admin ID for accountability. **Fixed Nov 24, 2025 (Morning):** Resolved empty job details dialog bug in Outbox during impersonation. The `/api/jobs/:id` endpoint now uses `getEffectiveUserId()` to properly return job details for the impersonated user instead of returning 404 errors. **Fixed Nov 24, 2025 (Afternoon):** Comprehensive fix for remaining impersonation bugs across phonebook and workflow endpoints. Fixed 8 additional endpoints: phonebook GET/PUT/DELETE (`/api/phonebooks/:id`), workflow PUT/DELETE/toggle-active (`/api/workflows/:id`), and workflow test-message endpoint. All endpoints now properly use `getEffectiveUserId()` ensuring full platform functionality during impersonation including viewing phonebook details, saving workflows, and testing workflow messages.
-   **Pricing Page Discount Display (Nov 2025):** Fixed hardcoded discount percentage badges showing incorrect values (+5% offset from database). The pricing page now dynamically calculates the maximum discount for each billing period (Quarterly, Semi-Annual, Annual) across all plans and displays the correct values from the database. Discount badges are conditionally rendered only when discount > 0%.
-   **Pricing Page Default View (Nov 2025):** Fixed pricing page defaulting to "Monthly" tab even when Monthly billing is disabled. The page now automatically selects the first enabled billing period (Quarterly, Semi-Annual, or Annual) when plans are loaded, providing immediate access to available subscription options.
-   **Admin Billing Column Display (Nov 2025):** Fixed empty "Billing" column in admin plans table. The column now correctly displays all enabled billing periods from the `enabledBillingPeriods` array (Monthly, Quarterly, Semi-Annual, Annual) instead of relying on the deprecated `billingPeriod` field, showing multiple billing options per plan.
-   **Multi-Workflow Button Click Routing (Nov 24, 2025):** Fixed critical bug where multiple active workflows would process the same button clicks from carousel/list messages. Root cause: WHAPI sends button_reply webhooks to ALL registered webhook URLs, causing concurrent workflows to execute the same button routing. Solution: Implemented message ownership tracking system using new `sent_messages` table that records which workflow sent which interactive message (carousel, quickReply, quickReplyImage, quickReplyVideo, listMessage). The webhook handler now checks message ownership via `context.quoted_id` lookup before processing button clicks, ignoring clicks from messages sent by other workflows. This enables multiple workflows to run concurrently without conflicts. Table structure: `sent_messages(id, workflowId, messageId, phone, messageType, sentAt)` with unique index on `messageId` for efficient lookups. Note: Pre-deployment interactive messages will not be tracked and their button clicks will be ignored.

## External Dependencies
-   **WHAPI Partner API (https://manager.whapi.cloud):** For channel management.
-   **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation and sending messages.
-   **PayPal Web SDK:** For subscription payments.
-   **PostgreSQL (Neon):** Primary database.
-   **node-cron:** For scheduling daily tasks.
-   **emoji-mart:** For emoji picker functionality.