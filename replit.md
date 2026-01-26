# OmniPlus WA Tracker

## Overview
OmniPlus WA Tracker is a SaaS platform designed for WhatsApp automation, empowering businesses to manage multiple WhatsApp channels, execute bulk and individual messaging campaigns, and construct interactive chatbots with sophisticated workflow automation. Its primary goal is to elevate customer engagement and streamline operational efficiency through optimized WhatsApp communication, integrating with WHAPI Partner for billing and channel management.

## User Preferences
- Dark mode by default (matches design guidelines)
- Theme persisted in localStorage
- Responsive sidebar collapsible on mobile

## System Architecture
The platform utilizes a modern stack consisting of a React TypeScript frontend (Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript, Drizzle ORM, PostgreSQL). It implements a days-based billing system with daily cron jobs and plan-specific messaging quotas.

**Core Features:**
-   **Authentication & Authorization:** JWT-based system with distinct user and admin roles, including admin impersonation functionality for support and debugging.
-   **Dashboard:** Centralized display of key metrics, subscription status, and activity feeds.
-   **Channel Management:** Admin-controlled channel activation and user-driven QR authorization via WHAPI. Includes real-time "Safety Meter" for channel health monitoring.
-   **Messaging & Templates:** Supports interactive message sending (text, image, video, document with configurable buttons) via WHAPI Gate API, featuring a WhatsApp-style preview with emoji picker. Provides full CRUD for message templates with preview.
-   **Workflow Automation (Chatbots):** A visual drag-and-drop builder (ReactFlow) enables creation of chatbots supporting WHAPI message types, configurable nodes (including secure HTTP Request nodes with comprehensive configuration), testing, and automated routing. Features include multi-workflow entry node triggering and robust webhook message validation to prevent group message processing.
-   **Bulk Messaging & Outbox:** Allows personalized or uniform bulk messages to phonebook contacts. Includes a comprehensive job management system with real-time status tracking, pause/resume/delete controls, and daily limit enforcement during processing.
-   **Phonebook Management:** CRUD operations for contacts, including CSV import and plan-based limits.
-   **Subscriber Tracking:** Automatic subscriber list management based on keyword interactions.
-   **Pricing & Billing:** Dynamic pricing page with duration toggles, supporting PayPal, offline payments, and free trials. Admins control dual pricing (display vs. PayPal), discounts, and billing periods. Features an Admin Balance Pool for managing days and automated PayPal integration.
-   **Admin Dashboard & Settings:** Comprehensive administration panel for managing users, billing, payments, channels, dynamic content, and global configurations (authentication, bulk sending speed, page access, theme, chat widget, HTTP Request allowlist). Includes plan-based page access control.
-   **Data Capture/Collection:** Enables tracking user interactions within workflow sequences using "Start Capture" and "End Capture" nodes, recording button clicks for data collection and storage.
-   **Booking Scheduler:** Complete appointment booking system with departments, staff members, recurring time slots (dayOfWeek-based), and customer bookings. Includes "Book Appointment" and "Check Bookings" workflow nodes for conversational booking flows via WhatsApp with multi-step department→staff→slot selection, availability validation, and configurable booking limits per customer.

**Design System:**
-   **Aesthetics:** Dark mode with vibrant accents (blue, green, amber, red, cyan).
-   **Typography:** Inter (primary), JetBrains Mono (code/numbers).
-   **Components:** Utilizes shadcn/ui components augmented with custom elements.
-   **Responsiveness:** Mobile-first design approach with a collapsible sidebar.

**Data Model:**
Key entities include Users, Plans, Subscriptions, Channels, Templates, Workflows, Phonebooks, Subscribers, ConversationStates, SentMessages, CaptureSequences, CapturedData, BookingDepartments, BookingStaff, BookingStaffSlots, and Bookings.

**Technical Implementations:**
-   **Media Handling:** Local media uploads are saved locally, sent as inline base64, and cleaned up automatically. Template media URLs are resolved to base64.
-   **Error Handling:** Sanitized user-facing error messages and proper extraction of WHAPI errors.
-   **Interactive UI:** Custom phone mockup for WhatsApp preview with emoji picker integration.
-   **Security:** HTTP Request nodes enforce HTTPS, admin-managed domain allowlist, no redirects, and response limits.
-   **Dual Pricing System:** Supports separate display pricing (e.g., BHD) for users and PayPal pricing (USD).
-   **Multi-Workflow Button Click Routing:** Implemented message ownership tracking to prevent multiple workflows from processing the same button clicks concurrently.

## External Dependencies
-   **WHAPI Partner API (https://manager.whapi.cloud):** For channel management and billing integration.
-   **WHAPI Gate API (https://gate.whapi.cloud):** For QR code generation, message sending, and webhooks.
-   **PayPal Web SDK:** For secure subscription payment processing.
-   **PostgreSQL (Neon):** The primary relational database.
-   **node-cron:** Used for scheduling daily background tasks.
-   **emoji-mart:** Provides emoji picker functionality within the UI.