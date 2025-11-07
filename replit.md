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