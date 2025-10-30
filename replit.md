# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a production-ready SaaS platform for WhatsApp automation. It allows businesses to manage multiple WhatsApp channels, send bulk and individual messages using templates, build interactive chatbots with workflow automation, and integrate with WHAPI Partner for billing. The platform aims to enhance customer engagement and operational efficiency through comprehensive WhatsApp communication solutions.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform features a React TypeScript frontend with Vite, Wouter, TanStack Query, Tailwind CSS, and shadcn/ui. The backend uses Express.js with TypeScript, Drizzle ORM, and PostgreSQL. A days-based billing system charges for active channels, managed by a daily cron job. Messaging limits are plan-enforced, and channel management integrates with WHAPI for authentication and lifecycle events.

**Core Features:**
- **Authentication:** JWT-based with httpOnly cookies, supporting registration, login, and role-based access (user/admin).
- **Dashboard:** Metrics, subscription status, and activity feed.
- **Channel Management:** Admin-controlled activation workflow involving user creation, admin activation (consuming days and calling WHAPI), and user QR code authorization. Displays WHAPI metadata. QR polling uses 2-second intervals checking for HTTP 409 status code.
- **Messaging (Send Page):** Interactive message sending using WHAPI Gate API. Form includes channel selection, recipient phone (E.164), header, body (required), footer, and up to 3 buttons. Buttons are converted to WHAPI format `{type: "quick_reply", title, id}`. Plan limit checking enforces daily message quotas. Toast notification: "Message queued. Track delivery in Outbox → Job Details."
- **Templates:** CRUD operations for message templates with preview.
- **Workflows & Chatbot:** Visual drag-and-drop chatbot builder using ReactFlow (@xyflow/react). Features include:
  - **Full-Screen Canvas:** Immersive editing experience with zoom (0.1x-2x) and pan controls for designing complex workflows
  - **Horizontal Layout:** Nodes arranged left-to-right for intuitive conversation flow visualization with dagre-based auto-layout algorithm. "Auto Layout" button triggers automatic horizontal arrangement with 100px node separation and 200px rank separation.
  - **Multi-Output Handles:** Custom node component renders individual output handles for each button and list row. Each handle is labeled with button/row title and positioned vertically with 32px spacing. Button handles use blue badges, list row handles use green badges. ReactFlow automatically captures sourceHandle/targetHandle IDs on edge connections for precise routing.
  - **Node Deletion:** Keyboard shortcuts (Delete/Backspace) with ReactFlow native selection support including multi-select via marquee selection; skips deletion when text inputs are focused
  - Node palette with MESSAGE types and TRIGGER types, supporting dual interaction modes:
    - **Click-to-add:** Click any node in palette to add it to canvas at default position
    - **Drag-and-drop:** Drag nodes from palette to specific canvas positions
  - **WHAPI Interactive Message Types:** Full support for 7 WHAPI interactive message types with dynamic button/section/card management:
    1. **Quick Reply Buttons** (quickReply): Text with up to 3 reply buttons with dynamic add/remove
    2. **Buttons with Image** (quickReplyImage): Image with up to 3 reply buttons with dynamic add/remove
    3. **Buttons with Video** (quickReplyVideo): Video with up to 3 reply buttons with dynamic add/remove
    4. **List Message** (listMessage): Expandable list with up to 10 sections, each containing multiple rows, with dynamic add/remove for both sections and rows
    5. **Call Button** (callButton): Single button to initiate phone call
    6. **URL Button** (urlButton): Single button to open website
    7. **Copy/OTP Button** (copyButton): Single button to copy text/OTP codes
    8. **Carousel** (carousel): Swipeable cards (up to 10) with buttons, supporting dynamic add/remove for cards and buttons
  - **Node Configuration:** WHAPI-compliant message structure editors with header (optional), body (required), footer (optional), and action (buttons/list) fields
  - **Dynamic Element Management:**
    - **Add/Remove Controls:** Plus and X buttons to dynamically add/remove buttons, sections, rows, and cards
    - **Auto-Generated IDs:** All interactive elements (buttons, rows, sections, cards) receive unique auto-generated IDs using `crypto.randomUUID()`
    - **Manual ID Override:** Users can edit any auto-generated ID directly in the configuration panel
    - **ID Regeneration:** RefreshCw icon button on each ID field to generate a new random unique ID
    - **Limit Enforcement:** Add buttons automatically disable when WHAPI limits reached (e.g., 3 buttons for Quick Reply, 10 cards for Carousel)
  - **State Management Fix:** WorkflowBuilder derives `selectedNode` from the `nodes` array to ensure config panel always displays latest node data after updates
  - **Test Functionality:** Each node features a test button (Flask icon) that opens a dialog for sending test messages to specified phone numbers via active channels
  - **Live/Stop Toggle:** Control workflow execution with toggle button - Live workflows process incoming webhooks and send automated responses, Stopped workflows only log messages without sending replies. Uses optimistic UI updates with automatic rollback on API failure to maintain UI/backend consistency.
  - Real-time workflow visualization with connections/edges
  - Save/load workflow definitions stored as JSON in database
  - **User-Specific Webhook Endpoints:** Each workflow has a unique webhook URL (`/webhooks/whapi/:userId/:webhookToken`) displayed with copy-to-clipboard functionality
  - **Entry Node Configuration:** Support for setting an entry node that serves as the welcome message for first-time contacts
  - **Automated Message Routing:** Incoming WHAPI webhook messages are routed based on:
    - **First Message of Day Trigger (October 2025):** Timezone-aware detection using Asia/Bahrain (UTC+3) timezone. Uses minimal-state `firstMessageFlags` table with (phone, dateLocal) unique constraint. On first text message of each calendar day (resets at 00:00 Bahrain time), sends the workflow's entry node message. Subsequent messages same day are ignored. Idempotent with conflict-based deduplication using database unique constraint.
    - **Text Messages:** Route to entry node for first messages of day, ignored for subsequent messages same day
    - **Button/List Replies:** Extracts ID after colon from WHAPI format ("ButtonsV3:r1" → "r1", "ListV3:r2" → "r2") and matches to workflow edges using sourceHandle (multi-output workflows) with fallback to node button configs (legacy workflows). Supports both `reply.button_reply` and legacy `button.id` formats.
  - **Inactive Workflow Handling:** Webhook handler respects `isActive` flag - logs all incoming messages for debugging but only sends automated responses when workflow is Live
  - **Automated Response Sending:** Integrates with WHAPI Gate API to send automated responses based on workflow configuration using `buildAndSendNodeMessage` helper
  - Full CRUD operations for workflows (create, edit, delete) with validation
- **Outbox:** Displays all jobs with totals (queued, pending, sent, delivered, read, failed, replied). Clicking a job opens dialog with message table. Each message has a "View" button opening a drawer with full WHAPI payload (header, body, footer, buttons), provider message ID, status, error details, and timestamps for debugging.
- **Pricing:** Displays plans with duration toggles, integrates PayPal for subscriptions, and supports offline payments.
- **Admin Dashboard:** User management, billing adjustments, offline payment approval, and channel activation. Includes an expandable user table showing channels and activation controls.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.

**Design System:**
- **Color Palette:** Dark mode primary with vibrant blue, success green, warning amber, error red, and info cyan.
- **Typography:** Inter for primary text, JetBrains Mono for code/numbers.
- **Components:** shadcn/ui with custom elements for badges, progress bars, and cards.
- **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
- **Users**: Authentication, roles.
- **Plans**: Subscription tiers, pricing, limits.
- **Subscriptions**: User plan enrollments.
- **Channels**: WhatsApp channels with status, WHAPI integration details, and expiration tracking (`activeFrom`, `expiresAt`).
- **Templates**: Reusable message formats.
- **Jobs**: Message sending jobs with delivery tracking.
- **Messages**: Individual message status and error handling. Includes delivery tracking timestamps (`sentAt`, `deliveredAt`, `readAt`, `repliedAt`) and `lastReply` content. Unique index on `providerMessageId` ensures no duplicate WHAPI message IDs.
- **Workflows**: Chatbot conversation flows with `webhookToken` (unique per workflow), `isActive` flag, `entryNodeId` (identifies welcome message node), and `definitionJson` (stores nodes/edges).
- **ConversationStates**: Tracks last message timestamp per phone/channel combination. Fields: `workflowId`, `phone`, `lastMessageAt`, `lastMessageDate`, `currentNodeId`.
- **FirstMessageFlags**: Minimal-state table for first-message-of-day trigger detection. Fields: `phone`, `dateLocal` (YYYY-MM-DD in Asia/Bahrain timezone), `firstMsgTs`. Unique constraint on (phone, dateLocal) ensures idempotent first-message detection.
- **WorkflowExecutions**: Logs workflow execution history including incoming message payloads, routing decisions, and outbound responses. Fields: `workflowId`, `phone`, `messageType`, `triggerData`, `responsesSent`, `status`, `errorMessage`.
- **OfflinePayments**: Manual payment submissions.
- **AuditLogs**: System activity tracking.
- **Settings**: System-wide configuration including `main_days_balance`.
- **BalanceTransactions**: Audit trail of balance operations (`TOPUP`, `ACTIVATION`, `REFUND`, `ADJUSTMENT`) with `balanceBefore`/`balanceAfter`.

## External Dependencies
- **WHAPI Partner API:** For channel management, creation, extension, and deletion. Handles channel activation failures gracefully if the Partner account lacks sufficient days.
- **WHAPI Gate API:** For QR code generation and sending messages.
- **PayPal Web SDK:** For subscription payments.
- **PostgreSQL (Neon):** Primary database managed by Drizzle ORM.
- **node-cron:** For scheduling daily tasks like days decrement.

## Days Balance & Authorization Flow (October 2025)
Critical improvements to ensure real-time UI updates and correct status synchronization:

### User Status Management
- **Auto-Recovery from Expired Status**: When admin adds days to any channel, the system checks if the user has at least one ACTIVE channel. If yes, the user's status is automatically updated from "expired" to "active", immediately removing the "Account Expired" banner from the dashboard.
- **Auto-Logout for Expired Users**: Non-admin users with "expired" status are automatically logged out and redirected to login page with an explanatory message. This prevents expired users from attempting operations that would fail.

### Real-Time Cache Invalidation
All mutations that affect user or channel state now properly invalidate React Query caches:
- **Admin Activation** (`/api/admin/users/:userId/channels/:channelId/activate`): Invalidates `/api/me`, `/api/channels`, `/api/admin/users`, and `/api/admin/balance`
- **Channel Authorization** (`/api/channels/:id/authorize`): Invalidates `/api/me` and `/api/channels`. Also updates user status from "expired" to "active" if they have any ACTIVE channels.
- This ensures dashboards, channel pages, and send pages update immediately without manual refresh

### WHAPI Status Integration
- **QR Scan Authorization**: When user scans QR code, the authorization endpoint calls `getChannelStatus()` to fetch real-time WHAPI connection status from WHAPI Gate API
- **Status Persistence**: Retrieved WHAPI status (`active`, `stopped`, etc.) is stored in the database for monitoring and troubleshooting
- **Authorization Workflow**: QR polling (2-second intervals) detects HTTP 409 status, automatically calls authorization endpoint, and updates channel to AUTHORIZED state

### Send Button Logic
- **Channel-Level Expiration Check**: Send page now validates each channel's `expiresAt` date instead of relying solely on user status
- **Multi-Condition Enablement**: Send button enabled only when there exists at least one channel that is:
  1. Status = "ACTIVE"
  2. AuthStatus = "AUTHORIZED"  
  3. ExpiresAt > current time (or null)
- **Granular Error Messages**: Displays specific guidance based on the blocking condition:
  - "No active channels. Please add and activate a channel"
  - "No authorized channels. Please authorize your channels by scanning the QR code"
  - "All channels have expired. Please add days to your channels to continue sending messages"

### Authentication Flow Fix (October 29, 2025)
Fixed recurring login redirect loop issue where users would see "Successfully logged in" but remain on the login page:

**Root Cause:**
- Login/signup mutations succeeded but didn't refetch auth state before redirecting
- DashboardLayout's auth guard saw unauthenticated state and redirected back to login
- Created infinite redirect loop

**Solution:**
- Both `login.tsx` and `signup.tsx` now use `await queryClient.refetchQueries({ queryKey: ["/api/me"] })` in their `onSuccess` handlers
- This ensures AuthContext has fresh user data before navigation to dashboard
- Eliminates race conditions by waiting for actual refetch completion (not arbitrary timeouts)
- Follows TanStack Query v5 best practices for deterministic state updates