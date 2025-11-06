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
Key entities include Users, Plans (with billing periods, payment methods, PayPal Plan ID, publication status, page access, limits, file size limits for media), Subscriptions, Coupons, TermsDocuments, Channels, Templates, Jobs, Messages (with delivery tracking, `providerMessageId`, `messageType`, `mediaUrl`), Workflows (`webhookToken`, `isActive`, `entryNodeId`, `definitionJson`), Phonebooks, PhonebookContacts (with message type, media URL, and button configuration), MediaUploads, ConversationStates, FirstMessageFlags, WorkflowExecutions, OfflinePayments, AuditLogs, Settings, BalanceTransactions, PlanRequests, UseCases, and HomepageFeatures.

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

## Recent Changes (November 5, 2025)
- **Message Counter Fix (Critical):**
  - **Problem:** Dashboard and bulk page showing "0 / X messages sent today" despite having messages sent
  - **Root Cause:** `messagesSentToday` was hardcoded to `0` in `/api/me` endpoint
  - **Fix Applied:**
    - Implemented actual database query to count messages from today's jobs per user
    - Query: `SUM(jobs.total)` for jobs where `userId = user.id` AND `createdAt >= start_of_today (UTC)`
    - Added upper/lower bound date filtering for precise daily counting
    - Counter now accurately reflects messages sent today per user
  - **Result:**
    - Dashboard displays correct count (e.g., "5 / 100 messages sent today")
    - Bulk page shows same accurate count
    - Per-user isolation working correctly (each user sees only their own count)
    - Counter resets daily at midnight UTC
  - **Location:** `server/routes.ts`, `/api/me` endpoint (lines ~393-415)
- **Workflow Builder Canvas Expansion:**
  - Reduced left/right sidebar widths from 320px to 256px (w-80 → w-64)
  - Canvas area gained 128px of extra horizontal space
  - All three panels (palette, canvas, config) remain fully functional
  - Better use of screen real estate for building complex workflows
- **Homepage Feature Icons Fix:**
  - Added `toPascalCase()` helper function for dynamic lucide-react icon rendering
  - Fixed database entry: "messagesquare" → "message-square"
  - All 6 homepage feature icons now render correctly
- **Workflow Entry Node Behavior Clarified:**
  - Entry nodes are optional - workflows can function without them
  - Workflows without entry nodes still process button/list interactions
  - Entry node = optional welcome message trigger on first contact

## Recent Changes (November 6, 2025)
- **Phonebook Feature Implementation (Complete):**
  - **Database Schema:**
    - Added `phonebooks` table (id, userId, name, description, createdAt)
    - Added `phonebookContacts` table with comprehensive message configuration:
      - Contact details: phone, name, email
      - Message type: text_buttons, image, image_buttons, video_buttons, document
      - Message content: body, mediaUrl
      - Three button slots: button1-3 with text, type (quick_reply/url/call), value, and id
    - Added `mediaUploads` table for tracking WHAPI media uploads (whapiMediaId, fileName, fileType, fileSizeMB, expiresAt)
    - Added file size limits to plans: maxImageSizeMB (default 5), maxVideoSizeMB (default 16), maxDocumentSizeMB (default 10)
    - Extend messages table with messageType and mediaUrl columns for supporting 5 message types
  
  - **Backend API (Fully Implemented):**
    - Phonebook CRUD: GET/POST/PUT/DELETE `/api/phonebooks`
    - Contact CRUD: GET/POST/PUT/DELETE for contacts within phonebooks
    - Media upload: POST `/api/media/upload` with plan-based size validation, uploads to WHAPI, returns mediaId and URL
    - Send to phonebook: POST `/api/phonebooks/:id/send` creates bulk job for all contacts
    - Updated `processBulkJob` to handle all 5 message types using appropriate WHAPI methods (sendMediaMessage, sendInteractiveMessage, sendTextMessage)
  
  - **Storage Interface:**
    - Added complete CRUD methods for phonebooks, contacts, and media uploads
    - All methods follow existing patterns in server/storage.ts
  
  - **Frontend Pages:**
    - Created `/phonebooks` list page with create/delete functionality
    - Created `/phonebooks/:id` detail page with:
      - Contact table showing phone, name, message type, preview, and buttons
      - Send to all contacts functionality with channel selection
      - Delete contact functionality
      - Complete contact form dialog with:
        - Contact details (phone, name, email)
        - Message type selector (5 types)
        - File upload with plan-based size validation
        - Message body/caption input
        - Up to 3 configurable buttons (text, type, value, ID)
        - Real-time validation and error handling
    - Added Phonebooks to sidebar navigation with Book icon
    - Integrated routes in App.tsx
  
  - **Admin Controls:**
    - Added file size limit fields to plan editor (maxImageSizeMB, maxVideoSizeMB, maxDocumentSizeMB)
    - Defaults: 5MB (images), 16MB (videos), 10MB (documents)
    - Properly preserves 0 values using nullish coalescing and NaN checks
  
  - **Message Type Support:**
    - `text_buttons`: Text message with up to 3 interactive buttons
    - `image`: Image only with caption (no buttons)
    - `image_buttons`: Image with caption and up to 3 buttons
    - `video_buttons`: Video with caption and up to 3 buttons
    - `document`: Document file with caption (no buttons)
  
  - **WHAPI Integration:**
    - File upload uses WHAPI free media API (30-day storage)
    - Media stored with unique mediaId, accessible via WHAPI Gate URL
    - Plan-based file size validation before upload
  
  - **Location:** Backend in server/routes.ts, server/storage.ts, shared/schema.ts; Frontend in client/src/pages/phonebooks.tsx, client/src/pages/phonebook-detail.tsx

- **CSV Import and Bulk Send Enhancements:**
  - **Database Schema Updates:**
    - Added `header` and `footer` fields to phonebookContacts for flexible messaging
  
  - **CSV Import Feature:**
    - Created `/api/phonebooks/:id/import-csv` endpoint with comprehensive validation
    - Phone validation enforces country code (must start with +) and minimum length (8 chars)
    - Button ID rule: empty fields → auto-generate stable IDs; filled fields → use provided value
    - CSV columns supported: phone_number (required), name, email, header, body, footer, button1-3_text, button1-3_id
    - Returns detailed summary: total rows, successful imports, invalid rows with specific errors
    - Sample CSV download endpoint: GET `/api/phonebooks/sample-csv`
    - Frontend UI with file upload, validation summary display, and sample CSV download button
  
  - **Send Page Bulk Mode:**
    - Added Send Mode selector: Single (default) or Bulk
    - Bulk mode features:
      - Phonebook selector dropdown
      - Bulk strategy selector with two options:
        1. "Use Phonebook Fields per Contact" - Each contact receives their personalized message from phonebook data (reuses `/api/phonebooks/:id/send`)
        2. "Use One Message for All" - All contacts receive same message content from Send page (uses new `/api/phonebooks/:id/send-uniform`)
    - Conditional UI visibility:
      - Recipient fields (phone, name, email) hidden in bulk mode
      - Message fields (header, body, footer, buttons) hidden when using phonebook fields strategy
    - Button validation updated to handle both single and bulk modes
  
  - **Backend Implementation:**
    - New endpoint: POST `/api/phonebooks/:id/send-uniform` for uniform bulk messaging
    - Preserves existing single-send functionality and webhook logic
    - Button ID generation logic maintained in both CSV import and bulk send flows
  
  - **Location:** server/routes.ts, client/src/pages/phonebook-detail.tsx, client/src/pages/send.tsx, shared/schema.ts