# OmniPlus WA Tracker - Design Guidelines

## Design Approach
**System-Based Approach** drawing from modern SaaS dashboards (Linear, Vercel, Stripe) with emphasis on clean information architecture, efficient workflows, and professional aesthetics suitable for a business productivity tool.

## Core Design Principles
- **Clarity First**: Information hierarchy supports quick scanning and task completion
- **Professional Polish**: Enterprise-ready appearance that builds trust
- **Efficient Workflows**: Minimize clicks, maximize visibility of critical data
- **Status-Driven**: Visual indicators make system state immediately obvious

---

## Color Palette

### Dark Mode (Primary)
- **Background Base**: 222 15% 7% (dark slate, slightly warm)
- **Surface Elevated**: 222 15% 11% (cards, modals)
- **Surface Interactive**: 222 15% 15% (hover states)
- **Border Subtle**: 222 10% 20% (dividers, card borders)
- **Border Strong**: 222 10% 30% (focused inputs)

### Brand & Accent
- **Primary Brand**: 240 95% 65% (vibrant blue for CTAs, active states)
- **Primary Hover**: 240 95% 70%
- **Success**: 142 70% 50% (active channels, positive metrics)
- **Warning**: 38 90% 60% (pending states, low balance warnings)
- **Error**: 0 85% 60% (failed messages, critical alerts)
- **Info**: 200 90% 55% (informational chips)

### Light Mode
- **Background**: 0 0% 100%
- **Surface**: 222 10% 98%
- **Border**: 222 10% 90%
- **Primary**: 240 95% 55% (slightly darker for contrast)

### Text Hierarchy
- **Primary Text**: 222 10% 95% (dark) / 222 90% 10% (light)
- **Secondary Text**: 222 8% 65% (dark) / 222 20% 45% (light)
- **Tertiary Text**: 222 6% 50% (dark) / 222 15% 60% (light)

---

## Typography

### Font Families
- **Primary**: 'Inter', system-ui, sans-serif (Google Fonts)
- **Monospace**: 'JetBrains Mono', monospace (for codes, phone numbers, IDs)

### Scale & Usage
- **Display (Landing Hero)**: text-5xl lg:text-6xl, font-bold, tracking-tight
- **Page Titles**: text-3xl, font-semibold
- **Section Headers**: text-xl, font-semibold
- **Card Titles**: text-lg, font-medium
- **Body**: text-base, font-normal
- **Small Labels**: text-sm, font-medium
- **Captions**: text-xs, text-secondary

---

## Layout System

### Spacing Primitives
Use Tailwind units: **2, 3, 4, 6, 8, 12, 16, 20, 24** for consistent rhythm
- Tight spacing: p-2, gap-2 (chips, inline elements)
- Standard spacing: p-4, gap-4 (card padding, form fields)
- Section spacing: p-6 to p-8 (major containers)
- Page margins: p-8 to p-12 (main content areas)

### Grid System
- **Sidebar**: Fixed w-64 (desktop), collapsible on mobile
- **Main Content**: max-w-7xl mx-auto with px-6 lg:px-8
- **Dashboard Cards**: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6
- **Data Tables**: Full-width with horizontal scroll on mobile

### Application Shell
```
[Sidebar: w-64, fixed left, dark surface]
[Main: flex-1, ml-64 desktop, ml-0 mobile]
  [Header: sticky top-0, z-10, backdrop-blur]
  [Content: max-w-7xl, px-6 lg:px-8, py-8]
```

---

## Component Library

### Navigation
- **Sidebar**: Dark surface (222 15% 9%), icons from Heroicons (outline), active state with primary brand accent border-l-2
- **Sidebar Items**: py-3 px-4, rounded-lg hover:bg-surface-interactive, text-sm font-medium
- **Top Nav (Landing)**: Sticky with backdrop-blur-lg, logo left, nav center, auth buttons right

### Cards
- **Base**: bg-surface-elevated, border border-subtle, rounded-lg, p-6, shadow-sm
- **Hover Interactive**: hover:border-strong transition-colors
- **Stat Cards**: Large number (text-3xl font-bold), label below (text-sm text-secondary), optional icon top-right

### Status Chips
- **Active**: bg-success/10 text-success border-success/20, px-3 py-1, rounded-full, text-xs font-semibold
- **Pending**: bg-warning/10 text-warning border-warning/20
- **Paused**: bg-slate-500/10 text-slate-400 border-slate-500/20
- **Failed/Error**: bg-error/10 text-error border-error/20
- **Delivered/Success**: bg-info/10 text-info border-info/20

### Forms
- **Input Fields**: bg-surface-elevated border-border-subtle rounded-md px-4 py-2.5, focus:border-primary focus:ring-2 focus:ring-primary/20
- **Labels**: text-sm font-medium mb-2 text-primary
- **Helper Text**: text-xs text-secondary mt-1
- **Field Groups**: space-y-4

### Buttons
- **Primary**: bg-primary hover:bg-primary-hover text-white rounded-md px-4 py-2.5 font-medium shadow-sm
- **Secondary**: bg-surface-elevated border border-border-strong hover:bg-surface-interactive
- **Outline on Images**: bg-white/10 backdrop-blur-md border-white/20 text-white (no custom hover - rely on native)
- **Destructive**: bg-error hover:bg-error/90

### Tables
- **Header**: bg-surface-elevated border-b-2 border-border-strong text-xs font-semibold uppercase tracking-wide text-secondary
- **Rows**: border-b border-border-subtle hover:bg-surface-interactive, py-4
- **Cells**: px-4, align text-left for strings, text-right for numbers
- **Actions Column**: text-right with icon buttons (edit/delete)

### Modals
- **Overlay**: fixed inset-0 bg-black/60 backdrop-blur-sm
- **Panel**: bg-surface-elevated rounded-xl shadow-2xl max-w-2xl mx-auto p-6, slide-in animation
- **Header**: text-xl font-semibold mb-6, close button top-right

### Progress Indicators
- **Bar**: h-2 bg-surface-elevated rounded-full overflow-hidden
- **Fill**: bg-primary h-full transition-all, show percentage label alongside
- **Usage Example**: "Daily Sending Limit: 45/100" with visual bar below

### Banners
- **Warning (No Plan)**: bg-warning/10 border-l-4 border-warning px-6 py-4 rounded-md
- **Error (Expired)**: bg-error/10 border-l-4 border-error
- **Info**: bg-info/10 border-l-4 border-info

---

## Page-Specific Layouts

### Landing Page
- **Hero**: Full viewport height (min-h-screen), centered content, large headline (text-5xl lg:text-7xl font-bold), gradient text effect on key words, dual CTAs (primary + outline-on-image style), hero illustration/screenshot on right (lg:grid-cols-2)
- **Stats Band**: bg-surface-elevated py-12, 4-column grid on desktop, large numbers (text-4xl font-bold) with labels
- **Features**: 3-column grid (lg:grid-cols-3), icon + title + description cards with hover lift effect
- **Pricing Table**: Cards in row (grid-cols-1 md:grid-cols-2 lg:grid-cols-4), highlighted Popular plan with border-primary, feature list with checkmarks
- **Use Cases**: Alternating 2-column sections with screenshots, py-20 spacing between

### Dashboard
- **Metrics Row**: 4 stat cards (Channels Used, Days Remaining, Plan, Messages Today)
- **Banner**: Full-width at top if status issues
- **Charts/Activity**: Below metrics, recent jobs table, quick actions

### Channel Management
- **Info Bar**: Sticky below header, shows Available Days (large) and Limit usage, color-coded
- **Channel Grid**: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- **Channel Card**: Phone number (text-lg font-mono), status chip, QR code button, pause/resume/delete actions in footer

### Send/Bulk Pages
- **Two-Column Layout**: Form left (w-full lg:w-1/2), Live Preview right (sticky top-24)
- **Preview Card**: Mimics WhatsApp message appearance, bg-[#DCF8C6] dark:bg-[#005C4B], rounded-lg p-4, WhatsApp-style bubble

### Outbox/Job Details
- **Summary Bar**: Top row with job type, created date, status counts in grid
- **Messages Table**: Full-width, sortable columns (To, Status, Buttons, Error, Created), pagination below

---

## Images

### Hero Section (Landing)
- **Image**: Dashboard screenshot or abstract illustration showing WhatsApp integration, channel management interface
- **Placement**: Right side of hero (50% width on desktop), hidden on mobile
- **Style**: Subtle drop shadow, slight tilt (rotate-2), rounded-xl borders

### Feature Sections
- **Icons**: Use Heroicons (outline style) in brand color, size-8 to size-12
- **Screenshots**: Optional product screenshots in feature cards, showing real UI elements with subtle border and shadow

### Empty States
- **Illustrations**: Simple line art or icons when no channels/jobs/messages exist
- **Message**: Helpful text guiding user to first action (e.g., "Add your first channel to get started")

---

## Animations

**Minimal, Purposeful Only:**
- **Page Transitions**: None (instant navigation)
- **Hover**: Scale-105 on cards (very subtle), color transitions on buttons (150ms)
- **Modal**: Slide-up + fade-in (200ms ease-out)
- **Loading States**: Spinner for async actions, skeleton loaders for tables
- **Status Changes**: Color transitions on chips (300ms)

**Avoid**: Scroll animations, parallax, excessive motion