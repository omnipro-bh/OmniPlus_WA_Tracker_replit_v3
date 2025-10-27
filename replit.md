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
  - Interactive canvas for designing conversation flows
  - Node palette with MESSAGE types (text, media, location, interactive, contact, catalog) and TRIGGER types (message trigger, schedule trigger, webhook trigger, manual trigger)
  - Node-specific configuration panels for editing message content and settings
  - Real-time workflow visualization with connections/edges
  - Save/load workflow definitions stored as JSON in database
  - Webhook configuration section for WHAPI integration
  - Full CRUD operations for workflows (create, edit, delete)
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
- **Workflows**: Chatbot conversation flows.
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