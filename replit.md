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
- **Workflows & Chatbot:** Visual drag-and-drop chatbot builder using ReactFlow (@xyflow/react) with a full-screen canvas, horizontal auto-layout, multi-output handles for interactive messages, and node deletion functionality.
    - **Interactive Message Types:** Supports 7 WHAPI interactive message types (Quick Reply Buttons, Buttons with Image/Video, List Message, Call Button, URL Button, Copy/OTP Button, Carousel) with dynamic element management (add/remove, auto-generated/editable IDs, limit enforcement).
    - **Node Configuration:** WHAPI-compliant message structure editors for header, body, footer, and action fields.
    - **Testing & Live Toggle:** Each node includes a test button for sending messages to specified phone numbers. Workflows can be toggled between Live (process webhooks, send responses) and Stopped (log only) states, with optimistic UI updates.
    - **Automated Message Routing:** Incoming WHAPI webhook messages are routed based on:
        - **First Message of Day Trigger:** Timezone-aware detection (Asia/Bahrain) triggers the workflow's entry node message on the first text message of each calendar day.
        - **Button/List Replies:** Extracts IDs from WHAPI replies to route to specific workflow edges or node button configurations.
    - **Webhook Endpoints:** Each workflow has a unique, user-specific webhook URL.
    - **Entry Node Configuration:** Ability to set a welcome message for first-time contacts.
    - **Inactive Workflow Handling:** Webhook handler logs all messages but only sends automated responses for Live workflows.
- **Outbox:** Displays message sending job statuses (queued, pending, sent, delivered, read, failed, replied) with detailed message information, WHAPI payloads, and error details.
- **Pricing:** Displays plans with duration toggles, integrating PayPal for subscriptions and supporting offline payments.
- **Admin Dashboard:** User management, billing adjustments, offline payment approval, and channel activation controls.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.

**Design System:**
- **Color Palette:** Dark mode primary with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter for primary text, JetBrains Mono for code/numbers.
- **Components:** shadcn/ui with custom elements for badges, progress bars, and cards.
- **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Includes entities for Users, Plans (with `billingPeriod` enum, `requestType`, `published`, `pageAccess`, `chatbotsLimit`), Subscriptions (with per-user overrides: `dailyMessagesLimit`, `bulkMessagesLimit`, `channelsLimit`, `chatbotsLimit`), Channels, Templates, Jobs, Messages (with delivery tracking and unique `providerMessageId`), Workflows (with `webhookToken`, `isActive`, `entryNodeId`, `definitionJson`), ConversationStates, FirstMessageFlags (for idempotent first-message detection), WorkflowExecutions, OfflinePayments (with `requestType`), AuditLogs (with `actorUserId` for tracking action performers), Settings, and BalanceTransactions.

**Recent Schema Changes (Oct 30, 2025):**
- **Plans Table**: Migrated from `durationDays` to `billingPeriod` enum (MONTHLY/SEMI_ANNUAL/ANNUAL), added `requestType` enum (PAID/REQUEST_QUOTE/BOOK_DEMO), `published` boolean, `pageAccess` JSONB for feature access control, and `chatbotsLimit` for workflow restrictions.
- **Subscriptions Table**: Added per-user override fields (`dailyMessagesLimit`, `bulkMessagesLimit`, `channelsLimit`, `chatbotsLimit`) to allow custom limits beyond plan defaults.
- **OfflinePayments Table**: Added `requestType` field to track payment request types.
- **AuditLogs Table**: Uses `actorUserId` (mapped to `user_id` column) to track which admin/user performed each action.
- **Helper Function**: `getDaysFromBillingPeriod(period)` converts billing period enums to days (30/180/365).

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