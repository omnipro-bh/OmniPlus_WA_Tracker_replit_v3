# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform designed for WhatsApp automation. Its primary purpose is to empower businesses with tools for managing multiple WhatsApp channels, facilitating bulk and individual messaging, and building interactive chatbots with workflow automation. The platform integrates with WHAPI Partner for billing and aims to significantly enhance customer engagement and operational efficiency through streamlined WhatsApp communication.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform is built with a React TypeScript frontend (Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript, Drizzle ORM, PostgreSQL). It employs a days-based billing system with daily cron jobs and plan-specific messaging limits. Channel management is tightly integrated with WHAPI for authentication and lifecycle events.

**Core Features:**
- **Authentication:** JWT-based with distinct user and admin roles.
- **Dashboard:** Provides key metrics, subscription status, and activity feeds.
- **Channel Management:** Admin-controlled activation and user QR authorization.
- **Messaging:** Supports interactive message sending (text, image, video, document types with configurable buttons) via WHAPI Gate API, respecting plan limits. Features realistic WhatsApp-style preview with phone mockup UI, emoji picker integration for message composition, and real-time media preview (images/videos/documents).
- **Templates:** CRUD operations for message templates with preview functionality.
- **Workflows:** A visual drag-and-drop builder (using ReactFlow) for chatbots and automation, supporting WHAPI message types, configurable nodes, testing, and automated routing. Fullscreen mode is available for an expanded canvas view. Carousel nodes support dynamic output handles for each Quick Reply button, enabling different workflow paths based on user selections. **HTTP Request nodes** are production-ready in the ACTION category with comprehensive configuration UI (method, URL, auth, headers, query params, body, response mapping, timeout) and success/error routing handles. Backend executor implements simplified secure architecture: HTTPS-only enforcement, admin-configurable domain allowlist (must be non-empty for execution, empty blocks all requests), redirect blocking, 5MB response limit, 10s timeout, and variable substitution ({{variable}} syntax from conversation context). Results stored in `conversation_states.context.http[nodeId]` as `{ status, statusText, data, mappedVariables, error, executedAt }`. Mapped variables are also merged into root context for easy {{variable}} access in downstream nodes.
- **Outbox:** Tracks the status of message sending jobs with pagination for large lists.
- **Bulk Message Status Tracking:** Real-time status updates via webhooks.
- **Safety Meter:** Real-time WhatsApp channel health monitoring with plan-based access control. Displays 4 color-coded metrics (lifetime, coverage, response rate, overall rating) from WHAPI Tools API. Features channel selector, manual refresh, and plan-gating. No database caching - metrics fetched on-demand with WHAPI's daily refresh limit.
- **Pricing:** Displays various plans with duration toggles and integrates PayPal for payments, supporting offline payments with coupons. Admins have comprehensive control over pricing page configuration, including quarterly billing, dynamic discounts, popular plan badges, and per-plan billing period enforcement.
- **Admin Dashboard:** Manages users, billing, offline payments, channel activation, and dynamic homepage content.
- **Admin Settings:** Global configurations for authentication, bulk sending speed, default page access (including Safety Meter), theme, chat widget location, and HTTP Request allowlist (trusted domains for workflow API calls).
- **Homepage Content Management:** Admin controls for 'Use Cases' and 'Homepage Features'.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.
- **Phonebook Management:** CRUD for phonebooks and contacts, including CSV import with validation, partial imports, and plan-based contact limits.
- **Bulk Sending:** Supports personalized or uniform messages to phonebook contacts.

**Design System:**
- **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter (primary), JetBrains Mono (code/numbers).
- **Components:** shadcn/ui supplemented with custom elements.
- **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Key entities include Users, Plans, Subscriptions, Coupons, Channels, Templates, Jobs, Messages, Workflows, Phonebooks, PhonebookContacts, MediaUploads, ConversationStates (with context jsonb field for HTTP results and workflow variables), OfflinePayments, AuditLogs, Settings (with httpAllowlist for domain restrictions and chatWidgetLocation for Tawk.to visibility control), and BalanceTransactions.

**Plans Payment System:**
- **Payment Methods:** Supports PayPal, offline payments, and free trials.
- **Admin Balance Pool:** Central `mainDaysBalance` tracks available days for allocation. All PayPal payments automatically deduct from this pool.
- **PayPal Integration:** 
  - Requires `paypalPlanId` for subscription integration.
  - Automated workflow: User pays → System verifies payment → **Deducts from admin balance pool** → Adds days to user → **Calls WHAPI API to extend channel** → Creates subscription.
  - Protection: Prevents subscription if admin pool has insufficient days.
  - WHAPI Integration: Automatically calls `extendWhapiChannel` or `createWhapiChannel` to actually activate/extend the channel on WHAPI platform.
  - Rollback: If WHAPI API fails, automatically refunds admin balance and cancels subscription.
- **Free Trial System:** Plans can offer free trials with configurable duration (days). Admin enables/disables trials and sets duration per plan. Free trial requests are processed identically to offline payments.
- **Offline Payment & Free Trial Workflow:** User submits request (offline payment or free trial) → Admin reviews in Offline Payments tab (dual badges for free trials: PAID + FREE TRIAL) → Admin approves → Channel becomes ACTIVE and subscription created → **No automatic days added** → Admin manually adds days to balance pool later using "Add Days to Pool" feature.
- **Plan Limits:** Defines daily limits for single/bulk messages, channels, workflows, and media file sizes.
- **Page Access Control:** Plans can restrict access to specific pages including Dashboard, Channels, Safety Meter, Send Messages, Templates, Workflows, Outbox, Workflow Logs, Bulk Logs, and Phonebooks. Default page access for new users is configurable in admin settings.

**Technical Implementations:**
- **Local Media Upload:** Files are saved locally to `/uploads` and sent as inline base64, with a 30-day automatic cleanup cron job.
- **Error Handling:** User-facing error messages are sanitized of vendor branding.
- **WHAPI Media Structure:** Corrected WHAPI payload structure for various media types (e.g., `image_buttons`, `video_buttons`).
- **WhatsApp Preview:** Custom-built phone mockup UI with WhatsApp-style message bubbles, interactive buttons (Quick Reply, URL, Call), and real-time media preview for uploaded files.
- **Emoji Support:** Integrated emoji-mart picker with Popover component for seamless emoji insertion in message body.
- **HTTP Request Security:** Production-ready simplified secure implementation with HTTPS-only, domain allowlist (admin-managed via Settings page, must be non-empty for execution), no redirects, 5MB/10s limits. Conversation state context stores HTTP results under `context.http[nodeId]` with schema `{ status, statusText, data, mappedVariables, error, executedAt }`. Mapped variables are also merged into root context for workflow continuity and {{variable}} substitution.
- **Webhook Message Validation (Nov 2025):** Critical fix implemented to prevent entry node triggers from system events. Webhook handler now strictly validates inbound messages by checking for actual text content or button replies before processing. This prevents WHAPI status updates, delivery receipts, and other system events from incorrectly triggering first-message-of-day logic and sending unwanted entry node messages.
- **HTTP Request Node Test Button (Nov 2025):** Added test functionality to HTTP Request nodes allowing users to test their API configuration before saving workflows. Test button executes the HTTP request with current configuration and displays results including status, response data, mapped variables, and errors. Note: Timeout conversion between UI (seconds) and execution (milliseconds) is handled in test endpoint only.
- **Chat Widget Location Control (Nov 2025):** Admins can now control where the Tawk.to chat widget appears via Settings tab. Two options: "Show on All Pages" (homepage + dashboard) or "Show on Homepage Only" (landing page only, excludes dashboard). ChatWidget component dynamically loads/unloads Tawk.to script based on setting and current route. Proper cleanup removes all Tawk DOM elements and resets window state when widget should be hidden.

## External Dependencies
- **WHAPI Partner API (https://manager.whapi.cloud):** Used for channel management.
- **WHAPI Gate API (https://gate.whapi.cloud):** Used for QR code generation and sending messages.
- **PayPal Web SDK:** Integrated for subscription payments.
- **PostgreSQL (Neon):** Serves as the primary database.
- **node-cron:** Utilized for scheduling daily tasks and background processes.
- **emoji-mart:** Emoji picker library (@emoji-mart/react, @emoji-mart/data) for message composition.