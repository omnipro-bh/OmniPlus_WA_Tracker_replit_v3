# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform for WhatsApp automation, enabling businesses to manage multiple WhatsApp channels, perform bulk and individual messaging, and build interactive chatbots with workflow automation. The platform aims to enhance customer engagement and operational efficiency through streamlined WhatsApp communication and integrates with WHAPI Partner for billing.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform features a React TypeScript frontend (Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript, Drizzle ORM, PostgreSQL). It employs a days-based billing system with daily cron jobs and plan-specific messaging limits.

**Core Features:**
-   **Authentication:** JWT-based with distinct user and admin roles.
-   **Dashboard:** Provides key metrics, subscription status, and activity feeds.
-   **Channel Management:** Admin-controlled activation and user QR authorization via WHAPI.
-   **Messaging:** Supports interactive message sending (text, image, video, document types with configurable buttons) via WHAPI Gate API, including a realistic WhatsApp-style preview with emoji picker.
-   **Templates:** CRUD operations for message templates with preview functionality.
-   **Workflows:** A visual drag-and-drop builder (ReactFlow) for chatbots, supporting WHAPI message types, configurable nodes (including HTTP Request nodes with comprehensive configuration and secure execution), testing, and automated routing.
-   **Outbox & Bulk Message Status Tracking:** Tracks message sending jobs and provides real-time status updates via webhooks.
-   **Safety Meter:** Real-time WhatsApp channel health monitoring from WHAPI Tools API, with plan-based access control.
-   **Pricing:** Displays plans with duration toggles, supports PayPal, offline payments, and free trials. Admins control pricing page configuration, including dual pricing (display price vs. PayPal price), discounts, and billing periods.
-   **Admin Dashboard & Settings:** Manages users, billing, payments, channel activation, dynamic homepage content, and global configurations like authentication, bulk sending speed, page access, theme, chat widget location, and HTTP Request allowlist.
-   **Phonebook Management:** CRUD for contacts, including CSV import and plan-based limits.
-   **Bulk Sending:** Personalized or uniform messages to phonebook contacts.
-   **Subscriber Tracking:** Automatic subscriber list management via keyword-based button interactions with configurable subscribe/unsubscribe keywords.
-   **Page Access Control:** Plans and admins can restrict user access to specific platform pages.

**Design System:**
-   **Color Palette:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
-   **Typography:** Inter (primary), JetBrains Mono (code/numbers).
-   **Components:** shadcn/ui supplemented with custom elements.
-   **Responsiveness:** Mobile-first design with a collapsible sidebar.

**Data Model:**
Key entities include Users, Plans, Subscriptions, Channels, Templates, Workflows, Phonebooks, Subscribers, and ConversationStates.

**Plans Payment System:**
-   Supports PayPal, offline payments, and free trials.
-   **Admin Balance Pool:** Central `mainDaysBalance` manages days for allocation. PayPal payments deduct from this pool.
-   **PayPal Integration:** Automated workflow for payment verification, days allocation, and WHAPI channel extension/creation, with rollback on WHAPI API failure.
-   **Offline Payment & Free Trial Workflow:** Admin-reviewed requests, requiring manual day allocation.
-   **Message Limit System:** Independent daily limits for single and bulk messages, with explicit support for "unlimited" (-1) quotas.

**Technical Implementations:**
-   **Local Media Upload:** Files saved locally and sent as inline base64, with automatic cleanup. Template media URLs are automatically resolved and converted to base64.
-   **Error Handling:** User-facing error messages are sanitized.
-   **WHAPI Media Structure:** Corrected WHAPI payload structure for various media types.
-   **WhatsApp Preview:** Custom phone mockup UI with interactive elements and real-time media preview.
-   **Emoji Support:** Integrated emoji-mart picker.
-   **HTTP Request Security:** Enforces HTTPS-only, admin-managed domain allowlist, no redirects, and limits on response size/timeout. Stores results in `conversation_states.context`.
-   **Webhook Message Validation:** Strictly validates inbound messages to prevent system events from triggering entry nodes. Additionally filters out group messages (`@g.us`) to ensure workflows only process private chats (`@s.whatsapp.net`), preventing unwanted bot responses in group conversations.
-   **HTTP Request Node Test Button:** Allows testing API configurations within the workflow builder.
-   **Chat Widget Location Control:** Admins control Tawk.to chat widget visibility.
-   **PayPal Environment Configuration:** Managed centrally via backend configuration.
-   **Dual Pricing System:** Supports separate display pricing (e.g., BHD) for users and PayPal pricing (USD) for payment processing.
-   **Outbox Job Status Updates:** Ensures real-time status updates for single and bulk message jobs.

## External Dependencies
-   **WHAPI Partner API (https://manager.whapi.cloud):** For channel management.
-   **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation and sending messages.
-   **PayPal Web SDK:** For subscription payments.
-   **PostgreSQL (Neon):** Primary database.
-   **node-cron:** For scheduling daily tasks.
-   **emoji-mart:** For emoji picker functionality.