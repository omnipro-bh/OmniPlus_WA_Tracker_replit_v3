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
- **Authentication:** JWT-based with httpOnly cookies, supporting user and admin roles.
- **Dashboard:** Provides metrics, subscription status, and activity feeds.
- **Channel Management:** Admin-controlled activation, user QR authorization, and status polling.
- **Messaging (Send Page):** Interactive message sending via WHAPI Gate API, supporting various content types and button options, with plan limit enforcement.
- **Templates:** CRUD operations for message templates with preview functionality.
- **Workflows:** A visual drag-and-drop chatbot/automation builder using ReactFlow, supporting 10 WHAPI message types (Interactive and Terminal). Features include configurable nodes, testing capabilities, live/stopped toggles, automated message routing, and entry node configuration.
- **Outbox:** Tracks message sending job statuses (queued, pending, sent, delivered, read, failed, replied) with detailed information and auto-refreshing updates.
- **Bulk Message Status Tracking:** Real-time webhook-based status tracking for bulk messages, including provider message IDs, delivery events, and full reply payloads.
- **Pricing:** Displays plans with duration toggles, integrating PayPal and supporting offline payments with coupon support.
- **Admin Dashboard:** Comprehensive management for users, billing adjustments, offline payment approval/deletion, channel activation controls, and dynamic homepage content management (Use Cases and Features).
- **Admin Settings:** Global configuration for authentication controls, bulk sending speed, default page access for new users, and default theme.
- **Homepage Content Management:** Admin tabs for managing dynamic Use Cases and Homepage Features displayed on the landing page, including sorting and publication status.
- **WHAPI Settings:** Global configuration for WHAPI Partner token and base URL.
- **Default User Experience:** Admins can configure default page access and theme for new signups without subscriptions.

**Design System:**
- **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
- **Typography:** Inter (primary), JetBrains Mono (code/numbers).
- **Components:** shadcn/ui with custom elements.
- **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Key entities include Users, Plans (with billing periods, payment methods, PayPal Plan ID, publication status, page access, limits), Subscriptions, Coupons, TermsDocuments, Channels, Templates, Jobs, Messages (with delivery tracking and `providerMessageId`), Workflows (`webhookToken`, `isActive`, `entryNodeId`, `definitionJson`), ConversationStates, FirstMessageFlags, WorkflowExecutions, OfflinePayments, AuditLogs, Settings, BalanceTransactions, PlanRequests, UseCases, and HomepageFeatures.

**Plans Payment System:**
- **Payment Methods:** Supports PayPal and offline payments, stored as a JSONB array.
- **PayPal Integration:** Requires a unique `paypalPlanId` field when enabled.
- **Plan Limits:** Defines daily single messages, daily bulk messages, channels, and workflows.

## External Dependencies
- **WHAPI Partner API (https://manager.whapi.cloud):** For channel management (creation, extension, deletion).
- **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation and sending messages (text, media, location, interactive, carousel).
- **PayPal Web SDK:** For subscription payments.
- **PostgreSQL (Neon):** Primary database.
- **node-cron:** For scheduling daily tasks.