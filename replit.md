# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform for WhatsApp automation, enabling businesses to manage multiple channels, send bulk/individual messages, develop interactive chatbots with workflow automation, and integrate with WHAPI Partner for billing. Its core purpose is to enhance customer engagement and operational efficiency through streamlined WhatsApp communication, offering significant market potential.

## Recent Changes (November 4, 2025)
- **Offline Payment Coupon Support:**
  - Added complete coupon support for offline payments on Pricing page
  - Amount field is now readonly, auto-populated from plan price based on selected billing duration (monthly/semi-annual/annual)
  - Users can enter and validate coupon codes via real-time API validation
  - Frontend displays discount breakdown: original price, discount percentage, final discounted amount
  - Backend validates submitted amounts match expected calculations (duration discount + coupon discount) to prevent tampering
  - Coupons apply as one-time discounts (first payment period only); renewals use original plan price
  - Admin approval flow links coupon to subscription and increments usage counter
  - Support for all billing durations with proper amount validation
  - E2E tested and architect reviewed: Implementation complete and secure
- **Days Balance & Status Synchronization Fix:**
  - Fixed critical synchronization issue between channel expiration and days balance/status display
  - Root cause: Admin dashboard was displaying deprecated `user.daysBalance` field and stale `user.status` from database instead of calculating from active channels
  - Solution: Updated `/api/admin/users` endpoint to override both `daysBalance` and `status` with real-time calculations
  - Days balance now calculated from channel.expiresAt dates (sum of all channel days remaining)
  - User status now calculated from active channels (expired if no active channels, active otherwise)
  - **Status Precedence:** Only calculates active/expired when current status is "active" or "expired"; preserves "banned", "disabled", "pending" manual overrides
  - Now all dashboards (user dashboard, admin dashboard, user details, channels page) show synchronized days remaining and status
  - Cron job correctly sets expired channels to `daysRemaining: 0` every hour
  - Both `/api/me` and `/api/admin/users` endpoints now consistently calculate days and status from channel data
  - No more mismatch between "ACTIVE" status with "0 days" - users with no active channels show as "EXPIRED"
- **Landing Page Hero Image Updated:**
  - Replaced WhatsApp chatbot interface image with campaign analytics showcase
  - New image displays: Notification Campaigns, Rich Media Messages, Click-to-WhatsApp Ads with 92% read rate and 76% reply rate
  - Updated alt text to describe campaign performance metrics
- **Tawk.to Live Chat Integration:**
  - Added Tawk.to chat widget to all pages (ID: 690896ac607713194fe5092a/1j94op4kn)
  - Widget loads asynchronously in client/index.html before closing body tag
  - Available on landing, about, legal pages, dashboard, and all authenticated pages
  - E2E test passed: Widget loads and displays correctly on multiple pages

## Recent Changes (November 3, 2025)
- **Log Pages Performance Optimization:**
  - Limited Workflow Logs to display last 100 executions (reduced from 500)
  - Bulk Logs already defaults to 100 entries
  - Improves page load performance as logs accumulate
  - Full historical data preserved in database for auditing/reporting
  - E2E test passed: Both pages load correctly with optimized limits
  - Architect reviewed: No data loss concerns, pagination can be added later if needed
- **Bulk Page - Emoji/Unicode Support:**
  - Fixed CSV parsing to properly preserve emoji and Unicode characters (🕓, ✋, 👋, 🎉)
  - Added UTF-8 encoding configuration to PapaParse library
  - Emojis now display correctly in message preview instead of replacement characters (�)
  - Works for all message fields: header, body, footer
  - E2E test passed: Verified emoji preservation through upload and preview
  - Architect reviewed: No side effects or security concerns
- **Bulk Page - User-Provided Button IDs:**
  - CSV upload now supports optional button ID columns (button1_id, button2_id, button3_id)
  - System uses user-provided IDs when available in CSV, otherwise auto-generates IDs as before
  - Header normalization handles various formats (button1_id, button_1_id, button 1 id)
  - No changes to sending flow, validation, or message dispatch behavior
  - Updated on-page guidance to mention optional button ID columns
  - Architect reviewed: Implementation secure and correct
- **Expiration Date Fix:**
  - Fixed expiration date mismatch between Channels page and Settings page
  - Settings page now fetches actual channel data and displays real expiration date instead of calculating it incorrectly
  - Both pages now show consistent expiration dates (e.g., Nov 3, 2025)
  - E2E test passed: Verified both pages display the same expiration date
- **Workflow Webhook Display in Admin:**
  - Added endpoint `GET /api/admin/users/:id/workflows` to fetch user's workflows (admin-only)
  - Admin user drawer now displays full workflow webhook URLs (up to 2 workflows)
  - Shows "First Workflow" and "Second Workflow" labels when user has multiple workflows
  - Each webhook includes workflow name, active/inactive status, and functional copy button
  - Helpful messaging when user has no workflows or more than 2 workflows
  - E2E test passed: Both workflow webhooks display correctly with actual tokens and copy functionality works
- **Channel Activation Flow Fixed:**
  - Clarified two separate concepts: user.daysBalance (for users to extend their own channels) vs channel days via WHAPI (for admin-managed activation)
  - Admin "+ Days" button now shows channel selector dialog first, allowing admin to select which channel to add days to
  - Correct endpoint `/api/admin/users/:userId/channels/:channelId/activate` deducts from admin main balance → calls WHAPI API → adds days to channel ledger
  - Old `/api/admin/users/:id/add-days` endpoint reverted to simple user balance adjustment only (no admin balance or WHAPI interaction)
  - E2E test passed: Adding 1 day to admin@omniplus.com's channel successfully deducted from admin balance and called WHAPI Partner API
- **Admin UI Forms Enhancement:** Migrated Use Cases and Homepage Features management dialogs to use proper Form + useForm + zodResolver pattern for better validation and error handling
- **TypeScript Error Fixes:** Resolved optional field null handling in admin forms by providing default empty strings for image and icon fields
- **Dynamic Landing Page Content:** 
  - Landing page now fetches and displays dynamic homepage features from `/api/homepage-features`
  - Added Use Cases section to landing page that fetches content from `/api/use-cases`
  - Created `renderIcon` helper function to dynamically load Lucide React icons based on icon name strings
  - Features and Use Cases are filtered by published status and sorted by sortOrder
  - Fallback to hardcoded content when no dynamic data is available
- **E2E Testing:** Full test coverage confirms admin-to-landing data flow works correctly with proper validation
- **Legal Pages Added:**
  - Created three legal document pages: Privacy Policy, Terms & Conditions, and Button Functionality Terms
  - All pages accessible from landing page footer under "Legal" section
  - Content displays with proper formatting using Card component and prose typography
  - Each page includes header with OmniPlus logo, "Back to Home" link, and contact email (support@omniplus-bh.com)
  - Public routes (no authentication required) registered in App.tsx
  - E2E test passed: All three pages load correctly, navigation works, cross-links function properly

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform features a React TypeScript frontend (Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript, Drizzle ORM, PostgreSQL). It employs a days-based billing system with daily cron jobs and plan-enforced messaging limits. Channel management integrates with WHAPI for authentication and lifecycle events.

**Core Features:**
- **Authentication:** JWT-based with httpOnly cookies, supporting user and admin roles.
- **Dashboard:** Metrics, subscription status, and activity feed.
- **Channel Management:** Admin-controlled activation, user QR authorization, and status polling.
- **Messaging (Send Page):** Interactive message sending via WHAPI Gate API, supporting various content types and button options, with plan limit enforcement.
- **Templates:** CRUD operations for message templates with preview.
- **Workflows:** Visual drag-and-drop chatbot/automation builder using ReactFlow, supporting 10 WHAPI message types (Interactive and Terminal), configurable nodes, testing capabilities, and live/stopped toggles. Automated message routing handles first-message triggers, button/list replies, and unique webhook URLs per workflow. Includes entry node configuration for welcome messages.
- **Outbox:** Tracks message sending job statuses (queued, pending, sent, delivered, read, failed, replied) with detailed info, auto-refreshing for near real-time updates.
- **Bulk Message Status Tracking:** Real-time webhook-based status tracking for bulk messages, capturing provider message IDs, delivery events, and full reply payloads.
- **Pricing:** Displays plans with duration toggles, integrating PayPal and supporting offline payments.
- **Admin Dashboard:** User management, billing adjustments, offline payment approval/deletion, channel activation controls, and dynamic homepage content management (Use Cases and Features tabs).
- **Admin Settings:** Configuration panel with authentication controls (enable/disable sign in and sign up on home page), bulk sending speed settings, default page access controls for new users, and default theme setting for first-time visitors.
- **Homepage Content Management:** Admin tabs for managing Use Cases (with title, description, image, sort order, and publication status) and Homepage Features (with title, description, icon name, sort order, and publication status) displayed on the landing page.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.
- **Default User Experience:** Admins can configure default page access and theme for new signups, automatically applied to users without subscriptions.

**Design System:**
- **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter (primary), JetBrains Mono (code/numbers).
- **Components:** shadcn/ui with custom elements.
- **Responsiveness:** Mobile-first with a collapsible sidebar.

**Data Model:**
Includes entities for Users, Plans (with billing period, request type, payment methods array, PayPal Plan ID, publication status, page access, messaging/workflow limits), Subscriptions (with per-user overrides, channel/coupon linking, terms acceptance), Coupons, TermsDocuments, Channels, Templates, Jobs, Messages (with delivery tracking and `providerMessageId`), Workflows (`webhookToken`, `isActive`, `entryNodeId`, `definitionJson`), ConversationStates, FirstMessageFlags, WorkflowExecutions, OfflinePayments, AuditLogs, Settings, BalanceTransactions, PlanRequests, UseCases (title, description, image, sortOrder, published), and HomepageFeatures (title, description, icon, sortOrder, published).

**Plans Payment System:**
- **Payment Methods:** JSONB array storing ["paypal", "offline"] combinations
- **PayPal Integration:** Required `paypalPlanId` field when PayPal is enabled; validated in UI and backend
- **Plan Limits:** Daily single messages, daily bulk messages, channels, and workflows (chatbots)
- **Plan Duplication:** Automatically filters out PayPal from duplicates (PayPal Plan ID must be unique); preserves offline payment method if present

## External Dependencies
- **WHAPI Partner API (https://manager.whapi.cloud):** For channel management (creation, extension, deletion).
- **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation and sending messages (text, media, location, interactive, carousel).
- **PayPal Web SDK:** For subscription payments.
- **PostgreSQL (Neon):** Primary database.
- **node-cron:** For scheduling daily tasks.