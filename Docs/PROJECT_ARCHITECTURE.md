# OpsBridge Pro — Project Architecture

**Purpose of this document:** a permanent technical reference. Unlike `docs/DEVELOPMENT_PROGRESS.md` (which tracks *what's been built and what's next*), this document explains *how the system is built and why* — architecture, schema, module design, business rules, and conventions. A new Claude session or developer should be able to read this document and understand the entire system without inspecting every file.

Keep this document in sync when architecture-level decisions change (new tables, new cross-cutting patterns, new business rules). Routine feature additions that follow existing patterns don't require an update here — update `DEVELOPMENT_PROGRESS.md` for those instead.

---

## 1. Project Vision

**OpsBridge Pro** is a multi-tenant operations platform that bridges e-commerce and logistics into one system. It exists because e-commerce merchants running Pay-on-Delivery (POD) models in Nigeria need tight coordination with their logistics provider — orders, stock, cash collection, and delivery status all need to flow between the two businesses without manual reconciliation.

**Businesses currently served:**
- **GlowMedals** — a merchant selling physical products (e.g. portable dryers) direct-to-consumer via Meta/TikTok ads, on a Pay-on-Delivery model.
- **Royale Logistics** — a logistics company with delivery agents across all 36 Nigerian states, fulfilling deliveries and cash collection for GlowMedals (and designed to serve other merchants in future).

**Long-term goal:** OpsBridge Pro was deliberately architected as a **multi-tenant product**, not a bespoke internal tool for just these two businesses. The data model assumes multiple merchants can connect to a logistics provider (`merchant_logistics_links` is many-to-many-ready), and multiple logistics providers could exist. The eventual vision is for this to be a sellable SaaS product for other merchant+logistics pairs in similar markets. This is why an earlier, simpler single-user tool ("OpsHub Pro") was deliberately abandoned and rebuilt fresh as OpsBridge Pro — see `DEVELOPMENT_PROGRESS.md` history for that decision.

---

## 2. System Architecture

### High-level architecture
- **Frontend:** React (Vite build), single-page application, no server-side rendering.
- **Backend:** Supabase — Postgres database + Supabase Auth. **No custom backend server or API layer** — the React app talks to Supabase directly via the `@supabase/supabase-js` client.
- **Hosting:** Cloudflare Pages, auto-deploys on every push to the `main` branch of the GitHub repo.
- **PDF generation:** client-side via `jspdf` (receipts).
- **Styling:** Tailwind CSS with a custom design-token palette (`brand`, `surface`, `ink`, `success`, `warning`, `danger`, `cod` colors defined in `tailwind.config.js`).

There is no separate "backend" codebase. All business logic that would traditionally live in API route handlers instead lives in React (in `src/lib/*Helpers.js` files) and runs client-side, writing directly to Postgres via Supabase.

### React architecture
- **`App.jsx`** is the single router. It does not use a routing library (no React Router) — it holds a `currentPage` state and a `MERCHANT_PAGES` / `LOGISTICS_PAGES` object mapping page keys to components, selected based on the logged-in user's `business_type`. Navigation is just `setCurrentPage(key)`.
- **`AuthContext.jsx`** (`src/contexts/`) is the single source of truth for the logged-in user. It holds the Supabase Auth `session` and the joined `profile` (the row from the `users` table, which carries `business_id`, `business_type`, `role`, `permissions`, `scope_own_records`). Every page reads `profile` via `useAuth()`.
- **Component split by business domain:** `src/pages/merchant/*` (GlowMedals dashboard pages), `src/pages/logistics/*` (Royale dashboard pages), `src/pages/agent/AgentView.jsx` (a single mobile-optimized view for delivery agents — agents don't get a full dashboard), `src/pages/auth/LoginPage.jsx`.
- **Shared components** (`src/components/shared/`) are used across both businesses — e.g. `Sidebar`, `Badge`, `StatCard`, `OrderTimeline`.
- **No global state library** (no Redux/Zustand). Each page fetches its own data on mount via a `load()`/`loadAll()` async function and holds it in local `useState`.

### Supabase architecture
- **Row Level Security (RLS) is disabled on every table.** Access control is enforced entirely in application code by filtering queries on `business_id` (or `merchant_id`/`logistics_id`) and `scope_own_records`. **This is a known, accepted gap** — acceptable for the current trusted-team usage, but must be revisited before onboarding untrusted external users or additional merchants (see `DEVELOPMENT_PROGRESS.md` Known Issues).
- Every table that belongs to a business carries a business-scoping column. Naming is **not fully consistent** — some tables use `business_id`, others `merchant_id`, others `logistics_id` depending on which side of the merchant/logistics divide they primarily belong to. This inconsistency is a known quirk (see Section 9) rather than a deliberate pattern — check the actual column name per table rather than assuming.

### Authentication flow
1. User enters a **username** and password on the login screen (not email — usernames are the user-facing identifier).
2. `AuthContext.signInWithUsername(username, password)` looks up `users.email` for that `username`, then calls Supabase Auth's `signInWithPassword(email, password)`.
3. On success, Supabase Auth issues a session. `AuthContext` then fetches the matching row from `users` (joined via `auth_id`) to build the `profile` object — this is what the rest of the app reads.
4. Staff who haven't had login credentials set up yet have a **placeholder email** (`staff_xxx@opsbridgepro.internal` or `.app`) in `users.email` until an owner/manager uses the Staff page's "Set Login Credentials" action, which creates their real Supabase Auth account and updates their `username`/`email`.
5. "Remember me" persists the session using Supabase's built-in session persistence (localStorage-backed).

### Authorization flow
Two independent layers, both driven by columns on the `users` table:

1. **Page-level (`permissions`)** — a text array of page keys (e.g. `['dashboard','orders','customers']`). An **empty array means full access** (used for owners and "Full Access" presets). The Sidebar and App.jsx router both filter against this array to decide what's navigable.
2. **Data-level (`scope_own_records`)** — a boolean. When `true` (and the user isn't `role === 'owner'`), queries for Orders/Customers/Tasks are filtered to only rows the user is assigned to (`assigned_cs_rep`, `created_by`, `assigned_to`). Scoped users also lose the ability to create brand-new Orders/Customers/Tasks from scratch (the "+ New X" buttons are hidden) — this prevents a scoped CS Rep from self-assigning fabricated records. This flag is set per staff member on the Staff page, independent of their `role` or `permissions` — a Store Manager and a CS Rep could theoretically have identical permissions but different scope settings.

`role` itself is **free text**, not an enum — normalized to `lowercase_snake_case` on save. It is used for display and for commission-rule targeting ("applies to role X"), not for access control directly.

### Multi-tenant design
- `businesses` is the tenant table (`type`: `merchant` / `logistics` / `both`).
- `users.business_id` + `users.business_type` scope a staff member to exactly one business.
- `merchant_logistics_links` connects a merchant business to a logistics business (currently one link: GlowMedals ↔ Royale, but the table supports many-to-many).
- Every business-owned table is filtered by the logged-in user's `business_id` in every query — there is no cross-tenant query anywhere in the app except the deliberate, narrow bridge points (see Section 6).

---

## 3. Folder Structure

```
src/
├── App.jsx                 — top-level router: business_type → page map, permission filtering
├── main.jsx                 — React entry point
├── index.css                 — Tailwind base + custom component classes (btn-primary, card, input, badge, etc.)
├── contexts/
│   └── AuthContext.jsx       — session/profile state, signInWithUsername, signOut
├── lib/                       — business logic & calculations, framework-agnostic (no JSX)
│   ├── supabase.js            — Supabase client init (URL + anon key)
│   ├── taskHelpers.js         — task auto-creation, outcome handling, TASK_OUTCOMES config
│   ├── codHelpers.js          — COD record creation with 24hr due_at
│   ├── stockHelpers.js        — agent stock deduction on delivery
│   ├── merchantStockHelpers.js — merchant on-hand stock in/out + over-dispatch validation
│   ├── receiptHelpers.js      — PDF (jsPDF) + WhatsApp text receipt generation
│   ├── marketingHelpers.js    — campaign ROAS/CAC/attribution calculations
│   ├── financeRollupHelpers.js — monthly P&L calculations, MoM deltas, 12-month trend
│   ├── rewardsHelpers.js      — commission rule matching + calculation + awarding
│   ├── orderEventHelpers.js   — order timeline event logging + visibility filtering
│   └── csvExport.js           — generic CSV export utilities (exportOrdersToCSV, exportRowsToCSV)
├── components/
│   ├── shared/                — used by both merchant and logistics dashboards
│   │   ├── Sidebar.jsx, Badge.jsx, StatCard.jsx, OrderTimeline.jsx
│   └── merchant/               — GlowMedals-only components
│       └── ReceiptModal.jsx
├── pages/
│   ├── auth/LoginPage.jsx
│   ├── merchant/                — every GlowMedals dashboard page (one file per sidebar item)
│   └── logistics/                — every Royale dashboard page
└── pages/agent/AgentView.jsx     — the single mobile view agents get (no sidebar, tab-based)

docs/
├── DEVELOPMENT_PROGRESS.md   — living status doc: what's done, what's next, known issues
└── PROJECT_ARCHITECTURE.md   — this document
```

**Convention:** a page component owns its own data-fetching (`load()`), its own modal/form state, and its own save/update functions. Helpers in `lib/` are extracted when logic is either (a) reused across pages, or (b) represents a business rule/calculation worth testing/reading in isolation from JSX.

---

## 4. Database Architecture

RLS is disabled on all tables. All relationships below use standard Postgres foreign keys even where RLS doesn't enforce them.

### Core / Tenant tables
| Table | Purpose | Key columns |
|---|---|---|
| `businesses` | The tenant table. | `type` (merchant/logistics/both), `owner_id` |
| `users` | Every staff member across **both** businesses — single identity table. | `auth_id` (links to Supabase Auth), `business_id`, `business_type`, `role` (free text), `username`, `permissions` (text[]), `scope_own_records` (bool) |
| `merchant_logistics_links` | Connects a merchant business to a logistics business. Many-to-many ready. | `merchant_id`, `logistics_id`, `is_active` |

### GlowMedals (merchant) domain
| Table | Purpose | Notes |
|---|---|---|
| `products` | Catalogue. | `cost_price`/`selling_price`/`delivery_fee` are the *current* prices — see snapshotting note below. |
| `customers` | Customer records. | `created_by` — used for `scope_own_records` filtering. |
| `orders` | The core transaction record. | `assigned_cs_rep`, `status`, `total_amount`, `total_delivery_fee`. |
| `order_items` | Line items per order. | Stores `unit_selling_price`/`unit_cost_price`/`unit_delivery_fee` **as a snapshot at sale time** — editing a product's price later never changes historical order totals. |
| `product_bundles` + `bundle_items` | Multi-product bundles sold as one unit. | `bundle_items.product_id` is **nullable** — supports standalone custom line items (`custom_name`/`custom_cost_price`) not in the catalogue. `cost_price_snapshot`/`selling_price_snapshot` lock in pricing at bundle-creation time (see Business Rules — this was a deliberate fix for profit-report drift). |
| `merchant_stock` + `merchant_stock_receipts` | GlowMedals' own on-hand inventory. | `merchant_stock` is the running balance; `_receipts` is the append-only audit trail that increments it. |
| `stock_dispatches` | Outbound stock shipments to a logistics partner. | Validated against and deducts from `merchant_stock` before insert. |
| `expenses` | All business costs. | `category` enum + `custom_category` for free-text. `campaign_id` links "Ads" category expenses to Marketing campaigns. |
| `campaigns` | Marketing campaigns. | `product_id`/`order_source` are **optional** — if neither is set, a campaign is "spend-only" (contributes to total spend but not ROAS). |
| `blocked_customers` | Fraud/COD-rejection blocklist. | Checked by phone match at order creation. |
| `tasks` | Follow-up/workflow items. | Auto-created on order delivered/failed; also supports manual tasks. `outcome`/`escalation_reason`/`follow_up_date` support the outcome-logging workflow (see Module Architecture). |
| `receipts` | Tracks generated customer receipts. | One row per order once a receipt is generated; tracks whether PDF was downloaded / WhatsApp was sent. |

### Royale (logistics) domain
| Table | Purpose | Notes |
|---|---|---|
| `agents` | Delivery agents. | `states_covered` (text[]) — an agent can cover multiple states. |
| `logistics_requests` | **The bridge object** between a merchant's order and Royale's fulfillment of it. | Carries both `order_id` (FK to the merchant's `orders` table) and `merchant_id` — this is the one place merchant and logistics data are directly joined. |
| `royale_stock` | Royale's own warehouse balance (separate from any individual agent). | Incremented when a `stock_dispatch` is confirmed received; decremented when distributed to an agent. |
| `agent_stock` | What each individual agent currently holds. | Decremented automatically on delivery. |
| `cod_remittances` | Cash-on-delivery tracking, from agent → Royale → merchant. | `due_at` (24hr from delivery), `agent_remittance_status`, `merchant_settlement_status` are two independent status fields since it's a two-hop settlement. |
| `royale_stock_reports` + `royale_stock_report_items` | Monthly stock snapshots Royale publishes to a merchant for reconciliation. | Read-only from the merchant's side — doesn't expose Royale's internal per-agent breakdown. |

### Shared / cross-cutting tables
| Table | Purpose | Notes |
|---|---|---|
| `notifications` | **Schema exists, no UI built yet.** | `reference_type`/`reference_id` is a proper polymorphic pointer. This is the next module to build. |
| `order_events` | Order activity timeline. | `visibility_level` (`public`/`internal`/`management`) filtered client-side against the viewer's `role`/`scope_own_records` — see Module Architecture. |
| `commission_rules` | Configurable commission logic. | `calculation_method` (flat/percent_order/percent_profit), targetable by `applies_to_role` OR `applies_to_user_id` (staff-specific override takes precedence). Works for **both** merchant and logistics businesses via `business_id`. |
| `rewards` | **The universal rewards ledger** — commissions today, bonuses/incentives in future via `reward_type`. | Uses `related_order_id`/`related_campaign_id` as explicit nullable FKs rather than a generic `reference_type`/`reference_id` pair — **this is an inconsistency with `notifications`' polymorphic pattern**, worth normalizing if a third reference type is ever needed. |
| `reward_payments` | Payment audit trail against a `rewards` row. | Supports partial/batch payments even though the current UI only does full-payment. |

---

## 5. Module Architecture

**Orders** (`pages/merchant/OrdersPage.jsx`) — the central record. Owns creation, editing (pre-logistics only), status transitions, CS Rep assignment, blocklist checking at creation, CSV export, and the entry point to the Receipt and Timeline modals. Writes to `order_events` at every status change.

**Customers** (`pages/merchant/CustomersPage.jsx`) — simple CRUD, scoped by `created_by` for scoped staff. Feeds the customer picker in Orders.

**Products** (`pages/merchant/ProductsPage.jsx`) — catalogue CRUD with dependency-safe delete (blocks deletion if referenced in orders/bundles, offers deactivate instead).

**Bundles** (`pages/merchant/BundlesPage.jsx`) — composes Products (or custom items) into a sellable unit, with price snapshotting so bundle profit reports don't drift when linked product prices change later.

**Marketing** (`pages/merchant/MarketingPage.jsx`) — Campaigns (optionally linked to a Product and/or order `source` for attribution) + a Dashboard tab computing ROAS/CAC/gross-profit by joining `campaigns` against `orders`/`order_items` and `expenses` (category=ads). Ad spend is **not** a separate ledger — it's an Expense row with `campaign_id` set.

**Finance** (`pages/merchant/FinancePage.jsx`) — two tabs: COD & Remittances (operational, order-by-order) and Monthly Rollup (executive P&L summary with MoM deltas and a 12-month trend chart). Both read from `orders`/`order_items`/`expenses`/`cod_remittances` — no separate finance ledger exists; Finance is a *view* over transactional data, not a system of record.

**Reports** (`pages/merchant/ReportsPage.jsx`) — general order analytics + the **State Insights** section (per-state revenue/profit/success-rate/delivery-time), explicitly designed to be extended later with Royale-side agent/coverage data without restructuring (currently shows an honest "Coming soon" placeholder for that).

**Logistics** (`pages/logistics/RequestsPage.jsx` + others) — Royale's operational core: receiving `logistics_requests` created by a merchant's order confirmation, assigning an agent, tracking delivery status. This is where most of the merchant→logistics bridge logic lives (stock deduction, COD creation, commission awarding, timeline logging all fire from here as well as from the Agent view, since either side can mark a delivery outcome).

**Stock** — split across `merchant/StockPage.jsx` (GlowMedals: on-hand inventory, dispatch, reconciliation, Royale's published reports) and `logistics/StockManagementPage.jsx` (Royale: incoming dispatch confirmation, warehouse balance, distribution to agents, monthly report publishing). Agent-held stock (`agent_stock`) is a third layer, visible on `AgentView.jsx`.

**Rewards** (`pages/merchant/RewardsPage.jsx` + `pages/logistics/RoyaleRewardsPage.jsx`) — near-identical Ledger/Rules/Reports UIs on both sides, sharing `rewardsHelpers.js`. Commission is auto-awarded (idempotent — checked against `related_order_id` + `staff_id` before inserting) whenever an order reaches `delivered`, from whichever UI (Royale manager or Agent) triggers that transition.

**Tasks** (`pages/merchant/TasksPage.jsx`) — auto-created on order delivered/failed, with an outcome-logging workflow (Customer Satisfied / Ready to Reorder / Escalate / etc.) that can auto-create a new order (reorder flow) or a follow-up task. **This module is the designated foundation for the upcoming Workflow & Follow-up Engine** (see `DEVELOPMENT_PROGRESS.md` B3) — new scheduling/reminder features should extend Tasks, not create a parallel system.

**Notifications** — schema only, not yet built. Planned to reuse the same event points already instrumented for Order Timeline.

**Follow-up Workflow** — not a separate module; this is the *combination* of Tasks + Order Timeline + (future) Notifications, per an explicit architectural decision to avoid building a competing "Next Action" system (see `DEVELOPMENT_PROGRESS.md`).

**Staff** (`pages/merchant/StaffPage.jsx` + `pages/logistics/RoyaleStaffPage.jsx`) — near-identical UIs for both businesses: add staff, set login credentials, edit permissions/scope, change password. This is where `commission_rules`' `applies_to_role`/`applies_to_user_id` targets are populated from, and where the Marketing Manager preset's team-role dropdown lives.

**Authentication** — `AuthContext.jsx` + `LoginPage.jsx`. See Section 2.

### How modules interact
Orders is the hub. Confirming an Order creates a `logistics_requests` row (Logistics module). Marking that delivered fires four side effects from a single trigger point: `stockHelpers`/`merchantStockHelpers` (deduct agent stock), `codHelpers` (create COD record → Finance), `taskHelpers` (create follow-up task → Tasks), `rewardsHelpers` (award commission → Rewards), and `orderEventHelpers` (log timeline event → visible on the Order). Marketing reads Orders+Expenses but never writes to them. Reports/Finance Rollup are pure read-side aggregations — no module writes *to* them.

---

## 6. Data Flow — Order Lifecycle Walkthrough

1. **Order created** (GlowMedals, `OrdersPage`) — status `new`. Blocklist checked against customer phone at this point. `order_events`: `order_created` (public).
2. **CS Rep assigned** — status `assigned`. Event: `assigned_rep` (public).
3. **CS Rep confirms** — status `confirmed` → immediately `sent_to_logistics`. A `logistics_requests` row is created (this is the merchant↔logistics bridge). Events: `order_confirmed`, `sent_to_logistics` (public).
4. **Royale assigns an agent** (`RequestsPage`) — `logistics_requests.status = 'assigned'`. Event: `agent_assigned` (public).
5. **Agent marks out for delivery** (from either `RequestsPage` or `AgentView`) — order status → `in_transit`. Event: `out_for_delivery` (public).
6. **Delivery outcome:**
   - **Delivered** → order status `delivered`. In one transaction-like sequence: agent stock deducted (`stockHelpers`), a `cod_remittances` row created with a 24hr `due_at` (`codHelpers`), commission awarded to both the CS Rep and the Agent if active `commission_rules` exist (`rewardsHelpers` — idempotent), a follow-up Task auto-created (`taskHelpers`), and `order_events` logs `delivered` (public) + `commission_awarded` (internal).
   - **Failed** → order status `failed`. Event: `delivery_failed` (public). A follow-up Task is still auto-created (Delivery Recovery type).
7. **COD settlement** — Agent batches their pending COD and remits to Royale; Royale confirms receipt, then batch-settles to the merchant. This updates `cod_remittances.agent_remittance_status` and `.merchant_settlement_status` independently.
8. **Finance visibility** — the Monthly Finance Rollup (GlowMedals) and the Rewards ledgers (both sides) are pure read-side views over this same data — Revenue/COGS come from `orders`+`order_items`, COD Settled/Pending from `cod_remittances`, commission Earned/Paid from `rewards`. Nothing is duplicated into a separate ledger.
9. **Receipt** — once delivered, a CS Rep can generate a PDF/WhatsApp receipt (`ReceiptModal`), which writes a `receipts` row for audit purposes.
10. **Task outcome** — separately, the auto-created Task gets worked by a CS Rep, who logs an outcome. "Customer Ready to Reorder" creates a **new** Order, restarting this whole flow.

---

## 7. Business Rules

These were established through explicit product decisions during development — they are not obvious from the schema alone:

- **Delivery is always shown as FREE on receipts**, regardless of the stored `delivery_fee` value — GlowMedals' actual policy is free delivery, and this was hardcoded into the receipt template rather than left to data.
- **COD must be remitted within 24 hours of delivery.** Overdue remittances trigger visible alerts on the Agent, Royale, and Merchant sides, and require the agent to log a delay reason.
- **Commissions auto-award on `delivered` only**, never on `confirmed` — intermediate order stages never earn commission. Awarding is **idempotent** (checked against order+staff before inserting) since delivery status can theoretically be touched from two different UIs (Royale manager or Agent).
- **Scoped staff (`scope_own_records = true`) cannot create brand-new Orders/Customers/Tasks.** They can only work records already assigned to them. This is a deliberate anti-fraud measure, not an oversight.
- **Blocklist matches block scoped staff outright**; only non-scoped staff (managers/owners) can override a blocklist match, and doing so requires an explicit checkbox acknowledgment — never a silent bypass.
- **Products cannot be permanently deleted if referenced in any order or bundle** — the system offers "Deactivate" instead to preserve historical report integrity. Editing a product's price only affects *future* orders/bundles, never past ones (enforced via snapshotting, not a business-rule check).
- **Stock cannot be over-dispatched at any stage** — merchant→Royale dispatch is validated against `merchant_stock`, and Royale→Agent distribution is validated against `royale_stock`. Both block the action outright rather than allowing negative balances.
- **Bundle costs are locked in ("snapshotted") at creation time** and do not silently follow live product price changes. A manual "Resync Prices" action exists for when a genuine update is wanted — this was a direct fix for inaccurate historical profit reporting.
- **Orders can only be edited or deleted while still pre-logistics** (`new`/`assigned`/`confirmed`) — once a `logistics_requests` row exists, the order is locked to editing (Cancel is still available, but not delete).
- **Refunds/Returns has no data model.** Anywhere this matters (Finance Rollup, commission reversal), the UI is honest about this — showing "Not yet tracked" rather than a fabricated zero, and commission reversal is a manual action with a required reason, explicitly built as the hook point for when Returns/Refunds is eventually built.
- **Order Timeline visibility is three-tiered** (`public`/`internal`/`management`) and filtered using the *same* signals as data-scope (role/scope_own_records) — no separate visibility permission system was introduced.

---

## 8. Permission Model

Three independent signals on the `users` row combine to fully determine what a staff member can do:

1. **`role`** (free text, normalized lowercase_snake_case) — descriptive/targeting only (used by `commission_rules` and displayed in UI). Does **not** gate access directly, except that `role === 'owner'` is hardcoded to bypass both `permissions` and `scope_own_records` entirely (owners always see and can do everything in their business).
2. **`permissions`** (text array of page keys; empty = full access) — gates which sidebar items/pages are reachable at all.
3. **`scope_own_records`** (boolean) — gates whether a user's Orders/Customers/Tasks queries are filtered to only their own assigned/created rows, and whether they can create new top-level records.

**Business separation** is a fourth, orthogonal dimension: `business_id` + `business_type` on `users` scope a person to exactly one business (GlowMedals *or* Royale) — there is no user who belongs to both. Every data query in every page filters by `profile.business_id`.

**Staff page presets** (e.g. "CS Rep", "Store Manager", "Finance Officer", "Marketing Manager", "Full Access") are just pre-filled combinations of `permissions` + `scope_own_records` for convenience when adding a new staff member — they are not stored as a distinct concept anywhere; after creation, a user's actual permissions/scope can be edited freely via "Edit Access" independent of whatever preset was used to create them.

---

## 9. Coding Standards

- **Functional React components only**, hooks-based (`useState`/`useEffect`), no class components.
- **Naming:** PascalCase for components/files (`OrdersPage.jsx`), camelCase for functions/variables, snake_case for database columns (matches Postgres convention directly — no camelCase↔snake_case mapping layer exists, so `total_amount` is `total_amount` in both DB and JS).
- **Data fetching pattern:** one `async function load()` (or `loadAll()`) per page, called from `useEffect` on mount (gated on `profile?.business_id` being available), using `Promise.all` for parallel independent queries. No React Query/SWR — manual refetch after every mutation.
- **Modal-based CRUD pattern:** a page holds `show*` boolean state for modal visibility, a `form` object for the current edit, and a `save()` function that inserts/updates then calls `load()` again. No optimistic UI updates anywhere — every mutation waits for the round-trip then refetches.
- **Error handling:** Supabase calls are checked via destructured `{ data, error }`, not try/catch, except in helper functions in `lib/` where a failure genuinely shouldn't block the calling action (e.g. `logEvent` in `orderEventHelpers.js` wraps in try/catch and only `console.error`s — a failed timeline write must never block the actual business action).
- **Tailwind conventions:** reusable classes are defined once in `index.css` (`.btn-primary`, `.btn-secondary`, `.btn-danger`, `.card`, `.input`, `.label`, `.badge`, `.nav-item`, `.stat-card`, `.section-title`, `.page-title`) rather than repeating utility strings — new UI should reuse these before inventing new utility combinations.
- **Helper extraction rule:** logic goes into `src/lib/*Helpers.js` (not inline in a page component) when it's (a) reused by more than one page, or (b) represents a business calculation/rule worth being able to read and reason about in isolation (commission calculation, ROAS math, receipt formatting, etc.).
- **File handoff/verification workflow (Claude-specific):** Claude's sandbox has no live `npm run build` available, so every file is checked with a lightweight brace/paren-balance script before being handed to the user, who pastes it into their real project (VS Code) and runs the actual Cloudflare build. This has occasionally missed real errors (e.g. a missing export) that only surface in the real build — **always treat a Cloudflare build failure as authoritative over the sandbox check**, and fix forward immediately.
- **Never assume sandbox file state equals live repo state.** The sandbox has been reset multiple times during this project's development, occasionally leaving stale/duplicate files (e.g. `commission_rates` vs `commission_rules`, `RewardsLedger.jsx` vs `RewardsPage.jsx`) that were never actually deployed. Before reusing a "shared" file across a multi-file feature, verify it's genuinely in the live repo (ask the user, or hand over the full file rather than assuming a partial diff is enough).

---

## 10. Future Expansion Points

When adding a new module, follow these established patterns rather than inventing new ones:

- **Tenancy:** every new table needs a `business_id`/`merchant_id`/`logistics_id` column and every query must filter by `profile.business_id`. Check `merchant_logistics_links` if the feature spans both businesses.
- **Permissions:** add the new page key to both the relevant `*_PAGES` permission list (in `StaffPage.jsx` / `RoyaleStaffPage.jsx`) and the Sidebar nav array — don't invent a new permission mechanism.
- **Data scope:** if the new module has per-staff records (like Orders/Customers/Tasks), reuse `scope_own_records` filtering rather than a bespoke visibility flag.
- **Timeline events:** if the new module represents something that happens *to an order*, log it via `orderEventHelpers.logEvent()` with an appropriate `visibility_level` rather than building a separate history mechanism.
- **Notifications (once built):** new event-triggering code should add a notification write at the same call sites already instrumented for Order Timeline events, respecting the same visibility tiering.
- **Rewards/Incentives expansion:** new reward types (bonuses, marketing KPI incentives) should use the existing `rewards` table with a new `reward_type` value, not a new table — this was explicitly designed for that extension.
- **Pricing/valuation:** if a new module stores a price that could change later (like Products), follow the **snapshot pattern** established by `order_items` and `bundle_items` — store the price *at the time of the transaction*, not a live reference.
- **UI placement:** prefer adding a **tab within an existing page** (as done for Marketing Dashboard/Campaigns, Finance COD/Rollup, Stock Inventory/Dispatches/Reports) over adding a new top-level sidebar item, unless the feature is genuinely a distinct workflow a user would navigate to directly and often.
- **Before building:** check `docs/DEVELOPMENT_PROGRESS.md` for known pending work and known issues, and check this document for whether a similar pattern already exists — avoid the duplicate-implementation problem that occurred with the Rewards module (see `DEVELOPMENT_PROGRESS.md` cleanup notes).