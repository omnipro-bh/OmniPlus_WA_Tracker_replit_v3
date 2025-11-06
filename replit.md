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

## Recent Changes (November 6, 2025 - Continued)

- **Media Upload Authorization Fix (Critical):**
  - **Problem:** File uploads failing with "Upload failed: Unauthorized" error
  - **Root Cause:** Backend was using Partner API token instead of Channel token. WHAPI Gate API requires channel tokens for media uploads
  - **Fix Applied:**
    - Updated `/api/media/upload` endpoint to use channel token instead of partner token
    - Changed API endpoint from partner base URL to `https://gate.whapi.cloud/media`
    - Made channelId optional - if provided uses that channel, otherwise uses first available authorized channel
    - Frontend Send page validates channel selection before upload and passes channelId
    - Added automatic file type detection from MIME type (image/video/document)
    - Convert files to base64 before sending (matching backend JSON expectations)
  - **Result:** File uploads now work correctly using proper channel authorization
  - **Location:** server/routes.ts (lines ~2149-2252), client/src/pages/send.tsx (handleFileUpload function)

- **User-Facing Error Message Cleanup:**
  - **Problem:** Error notifications displayed "WHAPI" brand name to end users
  - **Fix Applied:** Removed "WHAPI" from all user-facing error messages:
    - "Failed to create WHAPI channel" → "Failed to create channel"
    - "Failed to fetch QR code from WHAPI" → "Failed to fetch QR code"
    - "WHAPI Partner account has insufficient days" → "Insufficient channel days available"
    - "Failed to create/extend WHAPI channel" → "Failed to create/extend channel"
    - "Failed to delete channel from WHAPI provider" → "Failed to delete channel from provider"
    - "WHAPI upload failed" → "Upload failed"
  - **Result:** Cleaner, more professional error messages without vendor branding
  - **Note:** Console logging still includes "WHAPI" for admin debugging purposes
  - **Location:** server/routes.ts (multiple error responses)
