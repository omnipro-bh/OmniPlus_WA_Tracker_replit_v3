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
- **Messaging:** Supports interactive message sending (text, image, video, document types with configurable buttons) via WHAPI Gate API, respecting plan limits.
- **Templates:** CRUD operations for message templates with preview functionality.
- **Workflows:** A visual drag-and-drop builder (using ReactFlow) for chatbots and automation, supporting WHAPI message types, configurable nodes, testing, and automated routing. Fullscreen mode is available for an expanded canvas view. Carousel nodes support dynamic output handles for each Quick Reply button, enabling different workflow paths based on user selections.
- **Outbox:** Tracks the status of message sending jobs with pagination for large lists.
- **Bulk Message Status Tracking:** Real-time status updates via webhooks.
- **Safety Meter:** Real-time WhatsApp channel health monitoring with plan-based access control. Displays 4 color-coded metrics (lifetime, coverage, response rate, overall rating) from WHAPI Tools API. Features channel selector, manual refresh, and plan-gating. No database caching - metrics fetched on-demand with WHAPI's daily refresh limit.
- **Pricing:** Displays various plans with duration toggles and integrates PayPal for payments, supporting offline payments with coupons. Admins have comprehensive control over pricing page configuration, including quarterly billing, dynamic discounts, popular plan badges, and per-plan billing period enforcement.
- **Admin Dashboard:** Manages users, billing, offline payments, channel activation, and dynamic homepage content.
- **Admin Settings:** Global configurations for authentication, bulk sending speed, default page access, and theme.
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
Key entities include Users, Plans, Subscriptions, Coupons, Channels, Templates, Jobs, Messages, Workflows, Phonebooks, PhonebookContacts, MediaUploads, ConversationStates, OfflinePayments, AuditLogs, Settings, and BalanceTransactions.

**Plans Payment System:**
- **Payment Methods:** Supports PayPal and offline payments.
- **PayPal Integration:** Requires `paypalPlanId` for subscription integration.
- **Plan Limits:** Defines daily limits for single/bulk messages, channels, workflows, and media file sizes.

**Technical Implementations:**
- **Local Media Upload:** Files are saved locally to `/uploads` and sent as inline base64, with a 30-day automatic cleanup cron job.
- **Error Handling:** User-facing error messages are sanitized of vendor branding.
- **WHAPI Media Structure:** Corrected WHAPI payload structure for various media types (e.g., `image_buttons`, `video_buttons`).

## External Dependencies
- **WHAPI Partner API (https://manager.whapi.cloud):** Used for channel management.
- **WHAPI Gate API (https://gate.whapi.cloud):** Used for QR code generation and sending messages.
- **PayPal Web SDK:** Integrated for subscription payments.
- **PostgreSQL (Neon):** Serves as the primary database.
- **node-cron:** Utilized for scheduling daily tasks and background processes.