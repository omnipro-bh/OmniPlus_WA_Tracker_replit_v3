# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform for WhatsApp automation, enabling businesses to manage multiple channels, send bulk/individual messages, develop interactive chatbots with workflow automation, and integrate with WHAPI Partner for billing. Its core purpose is to enhance customer engagement and operational efficiency through streamlined WhatsApp communication, offering significant market potential.

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
- **Admin Dashboard:** User management, billing adjustments, offline payment approval, and channel activation controls.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.

**Design System:**
- **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter (primary), JetBrains Mono (code/numbers).
- **Components:** shadcn/ui with custom elements.
- **Responsiveness:** Mobile-first with a collapsible sidebar.

**Data Model:**
Includes entities for Users, Plans (with billing period, request type, payment methods array, PayPal Plan ID, publication status, page access, messaging/workflow limits), Subscriptions (with per-user overrides, channel/coupon linking, terms acceptance), Coupons, TermsDocuments, Channels, Templates, Jobs, Messages (with delivery tracking and `providerMessageId`), Workflows (`webhookToken`, `isActive`, `entryNodeId`, `definitionJson`), ConversationStates, FirstMessageFlags, WorkflowExecutions, OfflinePayments, AuditLogs, Settings, BalanceTransactions, and PlanRequests.

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