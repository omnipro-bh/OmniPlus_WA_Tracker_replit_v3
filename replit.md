# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform for WhatsApp automation, enabling businesses to manage multiple WhatsApp channels, facilitate bulk and individual messaging, and develop interactive chatbots with workflow automation. It integrates with WHAPI Partner for billing and aims to enhance customer engagement and operational efficiency through streamlined WhatsApp communication.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform features a React TypeScript frontend (Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript, Drizzle ORM, PostgreSQL). It uses a days-based billing system with daily cron jobs and plan-specific messaging limits. Channel management is integrated with WHAPI for authentication and lifecycle events.

**Core Features:**
- **Authentication:** JWT-based with user and admin roles.
- **Dashboard:** Metrics, subscription status, and activity feeds.
- **Channel Management:** Admin-controlled activation and user QR authorization.
- **Messaging:** Interactive message sending via WHAPI Gate API, supporting text, image, video, and document types with configurable buttons and plan limits.
- **Templates:** CRUD for message templates with preview.
- **Workflows:** A visual drag-and-drop chatbot/automation builder using ReactFlow, supporting WHAPI message types, configurable nodes, testing, and automated routing.
- **Outbox:** Tracks message sending job statuses.
- **Bulk Message Status Tracking:** Real-time webhook-based status tracking.
- **Pricing:** Displays plans with duration toggles, integrating PayPal and supporting offline payments with coupons. Admin controls for pricing page configuration, including quarterly billing, dynamic discounts, popular plan badges, and per-plan billing period enforcement.
- **Admin Dashboard:** Manages users, billing, offline payments, channel activation, and dynamic homepage content.
- **Admin Settings:** Global configuration for authentication, bulk sending speed, default page access, and theme.
- **Homepage Content Management:** Admin tabs for managing 'Use Cases' and 'Homepage Features'.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.
- **Phonebook Management:** CRUD for phonebooks and contacts, including CSV import with validation and plan-based contact limits per phonebook, allowing partial imports.
- **Bulk Sending:** Supports personalized or uniform messages to phonebook contacts.

**Design System:**
- **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter (primary), JetBrains Mono (code/numbers).
- **Components:** shadcn/ui with custom elements.
- **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Key entities include Users, Plans (with billing periods, payment methods, limits), Subscriptions, Coupons, Channels, Templates, Jobs, Messages (with delivery tracking), Workflows, Phonebooks, PhonebookContacts, MediaUploads, ConversationStates, OfflinePayments, AuditLogs, Settings, and BalanceTransactions.

**Plans Payment System:**
- **Payment Methods:** Supports PayPal and offline payments.
- **PayPal Integration:** Requires `paypalPlanId`.
- **Plan Limits:** Defines daily single/bulk messages, channels, workflows, and media file sizes.

**Technical Implementations:**
- **Local Media Upload:** Files are saved locally to `/uploads` and sent as inline base64 for improved performance, with a 30-day automatic cleanup cron job.
- **Error Handling:** User-facing error messages are cleaned of vendor branding.
- **WHAPI Media Structure:** Corrected WHAPI payload structure for image_buttons and video_buttons to ensure media attachments are sent correctly.

## External Dependencies
- **WHAPI Partner API (https://manager.whapi.cloud):** For channel management.
- **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation and sending messages.
- **PayPal Web SDK:** For subscription payments.
- **PostgreSQL (Neon):** Primary database.
- **node-cron:** For scheduling daily tasks.

## Recent Changes (November 7, 2025)

### Comprehensive Pricing Controls System
**Purpose:** Full admin control over pricing page configuration including quarterly billing, configurable discounts, popular plan badges, and per-plan billing period enforcement.

**Features Implemented:**
- **QUARTERLY Billing Period:** Added 90-day billing period throughout entire stack (schema, backend routes, frontend UI, PayPal integration)
- **Database-Driven Discount Percentages:** Three new fields per plan (`quarterlyDiscountPercent`, `semiAnnualDiscountPercent`, `annualDiscountPercent`) with 0-100% range, replacing hardcoded 5%/10% values
- **Popular Plan Badge Control:** `isPopular` boolean field enables admins to mark any plan with "POPULAR" badge on pricing page and homepage
- **Enabled Billing Periods:** `enabledBillingPeriods` JSONB array allows per-plan control of which billing periods are available for purchase
- **Dynamic Pricing Page:** Billing period toggles automatically show/hide based on union of all plans' enabled periods
- **Per-Plan Billing Enforcement:** Purchase buttons only shown for billing periods each plan supports; shows "Not available for [period] billing" message when unavailable

**Critical Bugs Fixed:**
1. **Discount Parsing:** Changed from `parseInt(...) || 5/10` to `Number.isNaN()` check with 0-100 clamping - now preserves explicit 0% discounts instead of forcing them to legacy defaults
2. **Billing Period Enforcement:** Added validation to prevent users from purchasing plans in unsupported billing periods
3. **Plan Sorting Inconsistency:** Added `.sort((a, b) => a.sortOrder - b.sortOrder)` to Pricing page - both admin and public pages now show identical plan order
4. **Homepage POPULAR Badge Bug:** Changed landing page from hardcoded `index === 1` to database `plan.isPopular` field - badge now correctly controlled by admin toggle on both homepage and pricing page

**Database Schema Changes:**
- Added `QUARTERLY` to `billingPeriodEnum`
- Added `quarterlyDiscountPercent` (integer, default 0)
- Added `semiAnnualDiscountPercent` (integer, default 5)  
- Added `annualDiscountPercent` (integer, default 10)
- Added `enabledBillingPeriods` (JSONB, default `["MONTHLY", "SEMI_ANNUAL", "ANNUAL"]`)
- Added `isPopular` (boolean, default false)

**Admin Panel Updates:**
- New "Pricing Controls" section with discount percentage inputs (0-100%) for each billing period
- Billing period checkboxes (Monthly, Quarterly, Semi-Annual, Annual) to control availability per plan
- Popular Plan toggle switch to enable/disable POPULAR badge

**Testing:** Full E2E Playwright tests validated discount persistence (including 0% values), popular badge toggling (both pages), per-plan billing period enforcement, consistent plan sorting across pages, and PayPal/offline payment flows.

**Result:** Admins have complete control over pricing page appearance and behavior; all discount values 0-100% persist correctly; per-plan billing restrictions prevent invalid purchases; plan order is consistent across all pages; POPULAR badge controlled by database on both homepage and pricing page.

**Location:** `shared/schema.ts`, `server/routes.ts` (PUT /api/admin/plans/:id), `client/src/pages/admin.tsx` (lines ~3220-3400), `client/src/pages/pricing.tsx` (discount calculation ~124-140, billing enforcement ~287-410, sorting ~282), `client/src/pages/landing.tsx` (POPULAR badge ~533-608)

### Workflow Entry Node Persistence Fix
**Problem:** When removing the "Entry Node" badge from a workflow node and saving, the badge would reappear when closing and reopening the workflow builder.

**Root Cause:** The `updateWorkflow` mutation invalidated the cache but did not update the `selectedWorkflow` state. When the builder was closed and reopened, it used the stale `selectedWorkflow` object which still contained the old `entryNodeId` value.

**Fix:** Updated the mutation's `onSuccess` callback to update the `selectedWorkflow` state with the fresh data returned from the server, ensuring entry node changes persist correctly.

**Result:** Entry node badge removal now persists across save/close/reopen cycles.

**Location:** `client/src/pages/workflows.tsx` (lines 49-67)

### Outbox Pagination (November 8, 2025)
**Purpose:** Improve user experience when viewing large numbers of message sending jobs by adding configurable pagination controls.

**Features Implemented:**
- **Show Entries Selector:** Dropdown to select number of jobs per page (10, 25, 50, 100 options)
- **Page Navigation:** Previous/Next buttons with disabled states for first/last pages
- **Page Number Buttons:** Shows up to 5 page number buttons with smart positioning based on current page
- **Info Display:** "Showing X to Y of Z entries" text showing current range
- **Auto-Reset Logic:** Automatically resets to page 1 when items per page changes or when current page becomes invalid (e.g., after job list shrinks from auto-refresh)
- **Client-Side Implementation:** All pagination is client-side, no backend changes required

**Technical Implementation:**
- React useState for `itemsPerPage` (default: 10) and `currentPage` (default: 1)
- useEffect hook to handle page reset when current page exceeds total pages (prevents React rendering violations)
- Array slicing to display only jobs for current page: `jobs.slice(startIndex, endIndex)`
- Pagination controls only render when there's more than 1 page of results
- All existing functionality preserved (auto-refresh, job details dialog, export to Excel)

**Testing:** Full E2E Playwright test validated selector functionality (10→25 change), page navigation (Next/Previous/page numbers), state management (highlighted current page, disabled/enabled buttons), and display text accuracy with 64 jobs across multiple pages.

**Result:** Users can now efficiently navigate through large job lists with configurable page sizes and clear pagination controls. The UI updates correctly during auto-refresh scenarios.

**Location:** `client/src/pages/outbox.tsx` (lines 22-60 for state/logic, 145-290 for UI controls)

### Workflow Carousel Node Configuration Panel Fix (November 8, 2025)
**Problem:** The Node Configuration panel in the Workflow Builder was too narrow (256px), causing the carousel node configuration content to be clipped/cut off on the right side. Fields and buttons were not fully visible or clickable.

**Root Cause:** The Node Configuration panel had a fixed width of `w-64` (256px), which was insufficient for the extensive carousel configuration content including:
- Introduction text textarea
- Multiple carousel cards (up to 10)
- Each card with: Card ID, Media URL, Card Text, and Buttons section
- Each button with: Title, ID, and URL fields

**Fix:** Increased the Node Configuration panel width from `w-64` (256px) to `w-96` (384px) in WorkflowBuilder.tsx to accommodate the carousel's extensive nested content.

**Testing:** E2E Playwright test confirmed panel width is now 382px with no horizontal clipping (scrollWidth=382). All carousel configuration fields are fully visible and accessible.

**Result:** The carousel node configuration panel now displays all content without clipping. Users can see and interact with all fields, buttons, and controls.

**Location:** `client/src/components/WorkflowBuilder.tsx` (line 708: Card className width change)