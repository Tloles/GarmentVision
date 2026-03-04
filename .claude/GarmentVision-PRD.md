# GarmentVision — Product Requirements Document

---

## 1. Executive Summary

GarmentVision is an AI-powered garment intake and tracking system built for dry cleaning businesses. It uses computer vision (powered by Anthropic's Claude API) to automate the tedious, error-prone process of garment check-in — identifying garment type, color, brand, care instructions, and pre-existing damage from camera images alone.

The current prototype demonstrates core intake functionality: real-time garment detection, AI-powered analysis, care label reading, damage documentation, and orphan garment recovery. The next phase transforms GarmentVision from a single-shop tool into a multi-tenant SaaS platform, adding rack/location tracking so operators always know where every garment is in their facility.

**MVP Goal:** Deliver a production-ready SaaS platform that any dry cleaning business can sign up for and use to intake garments via AI-powered camera scanning, track garment locations through their facility, and manage customer orders — all from a browser.

---

## 2. Mission

**Mission Statement:** Eliminate manual data entry and lost garments in dry cleaning operations through AI-powered vision and real-time tracking.

**Core Principles:**

1. **Camera-first workflow** — The camera is the primary input device. Scanning a garment should be faster than typing anything.
2. **AI handles the tedium** — Garment classification, label reading, and damage documentation should require zero manual entry in the happy path.
3. **Never lose a garment** — Every garment has a barcode, a location, and a history. Orphan recovery is a first-class feature, not an afterthought.
4. **Works for any cleaner** — A one-person shop and a 5-location chain should both find value on day one.
5. **Cost-conscious AI usage** — Use the cheapest model that gets the job done for each task. High-volume detection calls use Haiku; complex analysis uses Sonnet.

---

## 3. Target Users

### Primary Persona: Dry Cleaning Owner/Operator
- Runs 1–5 locations
- Handles intake personally or manages 2–10 employees who do
- Technically comfortable enough to use a web app but not a developer
- Pain points: lost garments, slow check-in, illegible handwritten tags, no visibility into where garments are in the facility
- Wants: faster intake, fewer mistakes, easy garment lookup, confidence that nothing gets lost

### Secondary Persona: Counter Clerk
- Front-desk employee who checks in and checks out garments
- Needs a simple, guided workflow — not a dashboard full of options
- May be using a phone or tablet at the counter
- Pain points: reading care labels, documenting damage consistently, remembering regular customers' preferences

### Tertiary Persona: Back-of-House Worker
- Processes garments (cleaning, pressing, finishing)
- Needs to update garment location/status as items move through the facility
- May use a shared tablet or phone mounted at each station
- Pain points: figuring out which rack a garment belongs on, identifying orphaned items

---

## 4. MVP Scope

### ✅ In Scope — Core Functionality

- ✅ AI-powered garment intake (detection, classification, care label reading, damage documentation)
- ✅ Tiered AI model usage (Haiku for detection, Sonnet for complex analysis)
- ✅ Customer management (create, lookup by barcode)
- ✅ Order management (create, add garments, complete)
- ✅ Garment barcode tracking (auto-generated GARM-XXXXX codes)
- ✅ Orphan garment recovery (photo-based AI matching)
- ✅ Rack/location tracking (assign garments to named locations, update as they move)
- ✅ Location history log (where has this garment been?)
- ✅ Quick location lookup (scan barcode → see current location)

### ✅ In Scope — Technical / Platform

- ✅ Multi-tenant architecture (each business is an isolated tenant)
- ✅ Supabase Auth for user authentication
- ✅ Row-Level Security (RLS) for tenant data isolation
- ✅ Responsive web UI (works on desktop, tablet, and phone)
- ✅ Environment-based configuration (API keys, tenant settings)
- ✅ Migrate frontend to React (Next.js) for maintainability and routing

### ❌ Out of Scope — Deferred to Future Phases

- ❌ Employee accounts & role-based access (admin, clerk, cleaner)
- ❌ Multi-store support (multiple locations under one business)
- ❌ Garment workflow stages (received → cleaning → pressing → ready → picked up)
- ❌ SMS/email customer notifications
- ❌ Customer-facing tracking portal
- ❌ Auto-pricing based on garment type
- ❌ POS / SMRT system integration
- ❌ Barcode printer hardware integration
- ❌ Business analytics dashboards
- ❌ Conveyor system integration
- ❌ Native mobile app (iOS/Android)

---

## 5. User Stories

### Intake

**US-1:** As a counter clerk, I want to hold a garment in front of the camera and have it automatically captured and classified, so that I don't have to type the garment type, color, or brand manually.

> *Example: Clerk holds up a navy Brooks Brothers blazer. Camera auto-detects it's stable, captures a photo, and returns `{"garmentType": "Blazer", "color": "Navy", "brand": "Brooks Brothers"}`. Clerk confirms and moves to the next step.*

**US-2:** As a counter clerk, I want to scan a care label and have the system read all care instructions automatically, so that the back-of-house team knows exactly how to process the garment.

> *Example: Clerk flips the blazer to show the label. System reads "100% Wool — Dry clean only — Do not bleach — Iron allowed" and populates all fields.*

**US-3:** As a counter clerk, I want to photograph and document any pre-existing damage before cleaning, so that the business is protected from false damage claims.

> *Example: Clerk notices a small stain on the cuff. They tap "Capture Damage," photograph it, and the AI notes: "Stain — left cuff — minor — appears to be ink."*

### Location Tracking

**US-4:** As a back-of-house worker, I want to scan a garment's barcode and assign it to a rack or station, so that anyone can find it later.

> *Example: Worker finishes pressing a shirt, scans its barcode, and selects "Rack B-3" from a list. The system records the location and timestamp.*

**US-5:** As a counter clerk, I want to scan a barcode and instantly see where a garment is located, so that I can retrieve it quickly when a customer arrives for pickup.

> *Example: Customer arrives. Clerk scans the order ticket. System shows: "Blazer — Rack B-3, Pants — Rack B-3, Shirt — Pressing Station (since 10 min ago)."*

**US-6:** As a shop owner, I want to see the location history of a garment, so that I can troubleshoot when something goes missing.

> *Example: Owner looks up GARM-00042 and sees: "Intake counter → Cleaning bin → Dry clean machine #2 → Pressing station → Rack B-3 → ??? (no scan for 2 days)."*

### Orphan Recovery

**US-7:** As a back-of-house worker, I want to photograph an untagged garment and have the system find its most likely match, so that I can reunite it with the right order.

> *Example: Worker finds a white dress shirt with no tag. They photograph it. The system compares it against recent check-in photos and returns: "95% match — GARM-00037, Order #ORD-20260303-002, Customer: John Smith."*

### Multi-Tenancy

**US-8:** As a dry cleaning business owner, I want to sign up for GarmentVision with my email and start using it immediately, so that I don't need any technical setup.

> *Example: Owner signs up at garmentvision.com, creates an account, and is dropped into the intake screen. Their data is completely isolated from every other business on the platform.*

---

## 6. Core Architecture & Patterns

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│            Next.js (React) + Tailwind            │
│         Camera API · Barcode Input · UI          │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│                  API Layer                        │
│              Next.js API Routes                   │
│     Auth middleware · Tenant isolation            │
└───────┬──────────────────────────┬──────────────┘
        │                          │
┌───────▼───────┐          ┌───────▼───────┐
│  Anthropic    │          │   Supabase    │
│  Claude API   │          │   (Postgres   │
│               │          │    + Auth     │
│  Haiku:       │          │    + Storage) │
│   Detection   │          │              │
│  Sonnet:      │          │  RLS for     │
│   Analysis    │          │  multi-tenant│
│   Matching    │          │  isolation   │
└───────────────┘          └──────────────┘
```

### Directory Structure

```
garmentvision/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Auth pages (login, signup)
│   ├── (dashboard)/          # Authenticated app pages
│   │   ├── intake/           # Garment intake flow
│   │   ├── orders/           # Order management
│   │   ├── locations/        # Rack/location management
│   │   ├── orphans/          # Orphan recovery
│   │   └── customers/        # Customer management
│   ├── api/                  # API routes
│   │   ├── detect/           # Garment/label detection (Haiku)
│   │   ├── analyze/          # Garment/label/damage analysis (Sonnet)
│   │   ├── orphan/           # Orphan matching (Sonnet)
│   │   ├── garments/         # Garment CRUD
│   │   ├── orders/           # Order CRUD
│   │   ├── customers/        # Customer CRUD
│   │   └── locations/        # Location tracking
│   └── layout.tsx            # Root layout with auth provider
├── components/               # Shared React components
│   ├── camera/               # Camera feed, detection overlay
│   ├── intake/               # Intake step components
│   └── ui/                   # Generic UI components
├── lib/                      # Shared utilities
│   ├── supabase.ts           # Supabase client (server + browser)
│   ├── anthropic.ts          # Claude API client with model routing
│   └── auth.ts               # Auth helpers
├── supabase/
│   └── migrations/           # Database migrations
└── .env.local                # Environment variables
```

### Key Design Patterns

- **Model Router** — A central `getModel(task)` function that returns `claude-haiku-4-5-20251001` for detection tasks and `claude-sonnet-4-20250514` for analysis/matching tasks. Easy to reconfigure per-endpoint.
- **Tenant Isolation via RLS** — Every table includes a `tenant_id` column. Supabase Row-Level Security policies ensure users can only read/write their own tenant's data. No application-level filtering needed.
- **Graceful Degradation** — If Supabase is unreachable, the AI intake flow still works (just doesn't persist). If Claude is rate-limited, the UI shows a clear retry message.
- **Optimistic UI** — Location updates and order modifications update the UI immediately, then sync to the database.

---

## 7. Features

### 7.1 AI-Powered Garment Intake (Existing — Enhanced)

The core camera-driven intake flow, enhanced with tiered model usage:

| Step | Description | AI Model |
|------|-------------|----------|
| Detection | Is a garment/label in frame and ready? | **Haiku** |
| Garment Analysis | Classify type, color, brand | **Sonnet** |
| Damage Analysis | Identify and describe damage | **Sonnet** |
| Care Label Reading | Extract fiber content + care instructions | **Sonnet** |

Each analysis endpoint returns structured JSON. The frontend pre-fills editable fields so the operator can correct any mistakes before saving.

### 7.2 Rack / Location Tracking (New)

**Concepts:**
- **Location** — A named place in the facility (e.g., "Rack A-1", "Pressing Station", "Intake Counter", "Ready for Pickup Shelf")
- **Location Assignment** — A record that garment X is at location Y as of timestamp Z
- **Location History** — The ordered list of all location assignments for a garment

**Operations:**
- **Assign location:** Scan garment barcode → select location from list → save
- **Bulk assign:** Select a location → scan multiple garment barcodes in sequence → all assigned to that location
- **Quick lookup:** Scan garment barcode → see current location + order info
- **Location view:** Select a location → see all garments currently there
- **History:** View the full movement history of any garment

**Location Management:**
- Tenant admins can create, rename, and archive locations
- Locations are simple named entities (no hierarchy in MVP)
- Common defaults provided on signup: "Intake", "Cleaning", "Pressing", "Ready for Pickup"

### 7.3 Orphan Garment Recovery (Existing — Enhanced)

Photograph an untagged garment and use Claude's vision capabilities to match it against the database of check-in photos. Enhanced with:
- Enriched match results showing customer name, order number, and last known location
- Ability to immediately re-assign the orphan to the correct barcode and location

### 7.4 Customer Management (Existing)

Barcode-based customer lookup and creation. Customers are scoped to the tenant.

### 7.5 Order Management (Existing — Enhanced)

Create orders tied to customers, add garments, track through completion. Orders are scoped to the tenant.

**Order Lifecycle — Three States:**

- **Open** — Garments are being checked in or processed through the facility (cleaning, pressing, etc.). This is the default state when an order is created.
- **Ready** — Automatically triggered when ALL garments in the order reach the "Ready for Pickup" location. This is the billing trigger — the customer is charged at this point.
- **Picked Up** — Clerk manually confirms the customer has collected their garments at the counter. This closes the order.

**Auto-completion logic:** When any garment's location is updated, check if ALL garments in that garment's order are now at "Ready for Pickup." If yes, automatically transition the order from "Open" → "Ready."

**Business Rules (enforced at the API level):**

1. **No double check-in:** A garment that belongs to an Open or Ready order cannot be added to a new order. The API must check for existing active orders containing the garment and return an error with the conflicting order number (e.g., "This garment is already in Order #ORD-20260303-001").

2. **No duplicate open orders per customer:** If a customer already has an Open order, the system should surface that existing order instead of creating a new one. The UI should show: "Customer already has an open order — add garments to Order #ORD-20260303-001?"

3. **No cross-customer items:** A garment is permanently tied to the customer who first checked it in (via the first order it appeared in). If a garment barcode is scanned during a different customer's order, the API must block it and return: "This garment belongs to [Customer Name]."

4. **Pickup requires Ready status:** An order can only be marked as "Picked Up" if it is currently in "Ready" status. Orders still in "Open" status cannot be picked up.

5. **Re-opening:** If a garment from a "Ready" order gets moved away from "Ready for Pickup" (e.g., back to pressing for a redo), the order automatically reverts from "Ready" → "Open."

### 7.6 Multi-Tenant Auth (New)

- Email/password signup and login via Supabase Auth
- Each user belongs to a tenant (1:1 in MVP — one user = one business)
- JWT-based session management
- Protected API routes that extract `tenant_id` from the authenticated session

---

## 8. Technology Stack

### Frontend
- **Next.js 14+** (App Router) — React framework with file-based routing, SSR, and API routes
- **React 18** — Component-based UI
- **Tailwind CSS** — Utility-first styling
- **Browser Camera API** (MediaDevices.getUserMedia) — Live camera feed

### Backend
- **Next.js API Routes** — Server-side endpoints (replaces Express)
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude API access
  - `claude-haiku-4-5-20251001` — Detection (high-volume, low-cost)
  - `claude-sonnet-4-20250514` — Analysis, matching (lower-volume, higher quality)

### Database & Auth
- **Supabase** (hosted Postgres)
  - **Auth** — Email/password authentication, JWT sessions
  - **Database** — Postgres with Row-Level Security
  - **Storage** — Garment photo uploads (`garment-photos` bucket)
  - **Realtime** (future) — Live location updates

### Dependencies
| Package | Purpose |
|---------|---------|
| `next` | React framework |
| `react`, `react-dom` | UI library |
| `@supabase/supabase-js` | Supabase client |
| `@supabase/ssr` | Supabase server-side auth helpers |
| `@anthropic-ai/sdk` | Claude API |
| `tailwindcss` | Styling |

---

## 9. Security & Configuration

### Authentication
- Supabase Auth with email/password (OAuth providers can be added later)
- JWTs stored in HTTP-only cookies via `@supabase/ssr`
- Middleware on all `/api/*` and `/(dashboard)/*` routes to verify auth

### Tenant Isolation
- Every data table includes a `tenant_id` column (UUID, references `auth.users.id` in MVP)
- Supabase RLS policies enforce `tenant_id = auth.uid()` on all SELECT, INSERT, UPDATE, DELETE
- No application-level tenant filtering — the database enforces it

### Configuration (Environment Variables)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Anthropic
ANTHROPIC_API_KEY=your-api-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Security Scope

- ✅ Auth-gated access to all features
- ✅ RLS-enforced tenant data isolation
- ✅ API key server-side only (never exposed to browser)
- ✅ `.env.local` excluded from version control
- ❌ Role-based access within a tenant (future)
- ❌ API rate limiting per tenant (future)
- ❌ Audit logging (future)

---

## 10. API Specification

### AI Endpoints

#### `POST /api/detect`
Real-time frame analysis — is a garment or label visible and ready?

**Model:** Haiku

```json
// Request
{ "image": "<base64>", "mode": "garment" | "label" }

// Response
{ "detected": true, "reason": "Dress shirt held up clearly in frame" }
```

#### `POST /api/analyze/garment`
Full garment classification from a captured photo.

**Model:** Sonnet

```json
// Request
{ "image": "<base64>" }

// Response
{ "garmentType": "Blazer", "color": "Navy", "brand": "Brooks Brothers" }
```

#### `POST /api/analyze/label`
Care label reading and classification.

**Model:** Sonnet

```json
// Request
{ "image": "<base64>" }

// Response
{
  "fiberContent": "100% Wool",
  "dryClean": "Dry clean only",
  "washing": "Do not wash",
  "drying": "Dry flat",
  "ironing": "Iron allowed",
  "bleaching": "Do not bleach"
}
```

#### `POST /api/analyze/damage`
Damage identification and description.

**Model:** Sonnet

```json
// Request
{ "image": "<base64>" }

// Response
{
  "type": "stain",
  "location": "left cuff",
  "severity": "minor",
  "description": "Small ink stain on inner left cuff"
}
```

#### `POST /api/orphan/search`
Photo-based orphan garment matching against database.

**Model:** Sonnet

```json
// Request
{ "orphanPhoto": "<base64>" }

// Response
{
  "matches": [
    {
      "candidateId": "GARM-00037",
      "confidence": 0.95,
      "matchingFeatures": ["button count", "collar style", "fabric texture"],
      "differences": [],
      "garmentType": "Dress Shirt",
      "customerName": "John Smith",
      "orderNumber": "ORD-20260303-002"
    }
  ],
  "topMatchReasoning": "Identical collar construction and mother-of-pearl buttons"
}
```

### Location Endpoints (New)

#### `GET /api/locations`
List all locations for the tenant.

```json
// Response
{
  "locations": [
    { "id": 1, "name": "Intake Counter", "garment_count": 3 },
    { "id": 2, "name": "Rack A-1", "garment_count": 12 }
  ]
}
```

#### `POST /api/locations`
Create a new location.

```json
// Request
{ "name": "Rack B-4" }

// Response
{ "success": true, "location": { "id": 5, "name": "Rack B-4" } }
```

#### `POST /api/garments/:barcode/location`
Assign a garment to a location.

```json
// Request
{ "location_id": 2 }

// Response
{ "success": true, "garment_barcode": "GARM-00042", "location": "Rack A-1", "assigned_at": "2026-03-03T14:30:00Z" }
```

#### `GET /api/garments/:barcode/location`
Get current location and history for a garment.

```json
// Response
{
  "current": { "location": "Rack A-1", "since": "2026-03-03T14:30:00Z" },
  "history": [
    { "location": "Intake Counter", "from": "2026-03-03T09:00:00Z", "to": "2026-03-03T10:15:00Z" },
    { "location": "Cleaning Bin", "from": "2026-03-03T10:15:00Z", "to": "2026-03-03T12:00:00Z" },
    { "location": "Rack A-1", "from": "2026-03-03T14:30:00Z", "to": null }
  ]
}
```

#### `GET /api/locations/:id/garments`
List all garments currently at a location.

```json
// Response
{
  "location": "Rack A-1",
  "garments": [
    { "barcode": "GARM-00042", "garment_type": "Blazer", "color": "Navy", "customer": "John Smith", "since": "2026-03-03T14:30:00Z" }
  ]
}
```

---

## 11. Success Criteria

### MVP Success Definition
A dry cleaning business can sign up, create an account, intake garments using the AI camera system, track garment locations through their facility, and manage customer orders — all without any technical setup beyond opening a browser.

### Functional Requirements

- ✅ User can sign up and log in with email/password
- ✅ User's data is completely isolated from other tenants
- ✅ AI garment detection uses Haiku (cost-efficient)
- ✅ AI garment/label/damage analysis uses Sonnet (high quality)
- ✅ Full intake flow works: detect → classify → damage → care label → save
- ✅ Garments can be assigned to named locations
- ✅ Current location of any garment is retrievable by barcode scan
- ✅ Location history is recorded and viewable
- ✅ Orphan recovery returns matches with location and customer info
- ✅ Orders track which garments belong to which customer
- ✅ Photos are stored and retrievable

### Quality Indicators

- Garment detection (Haiku) responds in < 2 seconds
- Garment classification accuracy > 90% for common types
- Care label reading accuracy > 85% for clear labels
- Location assignment takes < 5 seconds (scan + tap)
- No data leakage between tenants

### User Experience Goals

- A new user can complete their first garment intake within 5 minutes of signing up
- The intake flow requires ≤ 2 taps per garment in the happy path (confirm info + confirm save)
- Location tracking is fast enough to not slow down the cleaning workflow

---

## 12. Implementation Phases

### Phase 1: Foundation (Weeks 1–2)
**Goal:** Migrate to Next.js, set up multi-tenancy, and replicate existing functionality.

- ✅ Scaffold Next.js project with Tailwind
- ✅ Set up Supabase Auth (signup, login, session management)
- ✅ Add `tenant_id` to all existing tables, enable RLS policies
- ✅ Migrate all API endpoints from Express to Next.js API routes
- ✅ Implement model routing (Haiku for detection, Sonnet for analysis)
- ✅ Migrate camera and intake UI to React components
- ✅ Port customer, order, and garment management screens

**Validation:** Existing intake flow works end-to-end behind auth, with tenant isolation verified.

### Phase 2: Location Tracking (Weeks 3–4)
**Goal:** Build the rack/location tracking system.

- ✅ Create `locations` and `garment_location_history` tables with RLS
- ✅ Build location management UI (create, rename, archive locations)
- ✅ Build "assign location" screen (scan barcode → pick location)
- ✅ Build "bulk assign" mode (pick location → scan many barcodes)
- ✅ Build garment lookup screen (scan barcode → see location + history)
- ✅ Build location inventory view (select location → see all garments)
- ✅ Integrate location into intake flow (auto-assign "Intake" on check-in)
- ✅ Show location info in orphan recovery results

**Validation:** Operator can track a garment from intake through cleaning to ready-for-pickup rack, and look it up at any point.

### Phase 3: Polish & Deploy (Weeks 5–6)
**Goal:** Production-ready SaaS deployment.

- ✅ Responsive design pass (tablet and phone optimization)
- ✅ Error handling and edge cases (offline, API failures, concurrent edits)
- ✅ Onboarding flow (first-time setup: create default locations, walkthrough)
- ✅ Deploy to Vercel (or similar)
- ✅ Custom domain setup
- ✅ Supabase production project (separate from dev)
- ✅ Basic landing page with signup

**Validation:** A real dry cleaning business can sign up and use the full system in production.

---

## 13. Future Considerations

### Post-MVP Enhancements (Phase 4+)

- **Employee accounts & roles** — Admin, clerk, cleaner roles with different permissions. Admin manages locations and views reports; clerks handle intake/checkout; cleaners update locations.
- **Garment workflow stages** — Formalized status tracking (received → cleaning → pressing → finishing → ready → picked up) with stage-specific views and alerts.
- **Multi-store support** — Multiple locations under one tenant, with cross-location garment transfers and per-store location management.
- **Customer notifications** — SMS/email when order is ready for pickup, with configurable templates per tenant.
- **Customer portal** — Web page where customers can track their order status (no login required, accessed via unique link).
- **Auto-pricing** — Suggested pricing based on garment type, fabric, and care requirements. Configurable price lists per tenant.
- **POS / SMRT integration** — Push completed orders to existing POS systems. The "SEND TO SMRT" button is already stubbed in the UI.
- **Analytics dashboard** — Intake volume, turnaround time, revenue per customer, most common garment types, damage frequency.
- **Barcode printer integration** — Generate and print physical barcode labels for garments and customer bags.
- **Smarter orphan matching** — Learn from confirmed matches over time to improve accuracy.

---

## 14. Risks & Mitigations

### Risk 1: AI Model Accuracy on Care Labels
**Risk:** Haiku or Sonnet misreads care symbols, leading to incorrect cleaning instructions and garment damage.
**Mitigation:** Keep Sonnet for label reading (don't downgrade to Haiku). Always present results as editable fields so the operator can correct mistakes. Log correction rates to monitor accuracy over time.

### Risk 2: Camera Quality Variance
**Risk:** Different devices (phones, tablets, webcams) produce vastly different image quality, affecting detection and analysis reliability.
**Mitigation:** The detection prompt already checks for blur, lighting, and framing. Add client-side image quality checks (resolution, brightness) before sending to the API. Provide camera setup guidance in onboarding.

### Risk 3: Multi-Tenant Data Leakage
**Risk:** A bug in RLS policies or API code exposes one tenant's data to another.
**Mitigation:** RLS policies are the primary enforcement layer (not application code). Write integration tests that attempt cross-tenant access and verify it fails. Use Supabase's `auth.uid()` function in all policies — never trust client-supplied tenant IDs.

### Risk 4: API Cost at Scale
**Risk:** High-volume detection calls (every camera frame) drive up Anthropic API costs faster than revenue scales.
**Mitigation:** Haiku for detection is already ~10x cheaper than Sonnet. Add client-side throttling (don't send frames faster than 1/second). Consider caching detection results for near-identical frames. Monitor per-tenant API usage and set alerts.

### Risk 5: Adoption Friction
**Risk:** Dry cleaners are used to paper tags and manual processes; they resist switching to a digital system.
**Mitigation:** Design the intake flow to be faster than the paper alternative (hold up garment → auto-capture → confirm → done). Provide a smooth onboarding experience with default locations pre-configured. Offer a free trial period so shops can evaluate without commitment.

---

## 15. Appendix

### Database Schema (Updated)

**Existing Tables** (add `tenant_id` column + RLS to all):
- `customers` — customer_barcode, name, phone, email
- `garments` — barcode, garment_type, color, brand, fiber_content, care fields, damage_notes, photo URLs
- `orders` — order_number, customer_barcode, status, timestamps
- `order_items` — order_id, garment_barcode, garment_id

**New Tables:**
- `locations` — id, tenant_id, name, is_archived, created_at
- `garment_location_history` — id, tenant_id, garment_barcode, location_id, assigned_at, unassigned_at

### AI Model Routing

| Endpoint | Model | Rationale |
|----------|-------|-----------|
| `/api/detect` | Haiku | High volume (every frame), simple yes/no output |
| `/api/analyze/garment` | Sonnet | Needs accurate classification from 30+ categories |
| `/api/analyze/damage` | Sonnet | Subtle visual analysis, descriptive output |
| `/api/analyze/label` | Sonnet | Small text/symbol reading, accuracy critical |
| `/api/orphan/match` | Sonnet | Multi-image comparison, complex reasoning |

### Repository

- **Current:** https://github.com/Tloles/GarmentVision
- **Stack migration:** Express + vanilla JS → Next.js + React + Tailwind
- **Database:** Supabase (retain existing project, add migrations)
