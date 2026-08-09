# OpsBridge Pro — Development Progress & Handoff

**Last updated:** After completing the Rewards & Commissions engine (Phase 2)
**Purpose:** Any Claude session (or developer) should be able to read this file and resume work immediately without re-analyzing the codebase or re-asking the user for context already established.

---

## 1. Project Overview

**OpsBridge Pro** is a multi-tenant operations platform bridging e-commerce and logistics, built for:
- **GlowMedals** — a Nigerian e-commerce merchant (Pay-on-Delivery model, Meta/TikTok ads)
- **Royale Logistics** — a logistics company serving GlowMedals and (in future) other merchants, with delivery agents across Nigeria's 36 states

Both businesses run inside the same codebase/app, with role-based dashboards determined by `business_type` (`merchant` vs `logistics`).

**Live URL:** opsbridgepro.pages.dev
**Repo:** github.com/royalegroup/opsbridgepro (branch: `main`)
**Hosting:** Cloudflare Pages, auto-deploys on push to `main`
**Database:** Supabase (Postgres + Auth)

---

## 2. Tech Stack & Architecture

- **Frontend:** React + Vite, Tailwind CSS (custom brand/surface/ink color tokens in `tailwind.config.js`)
- **Backend:** Supabase — Postgres tables, Supabase Auth for login, no custom backend server
- **PDF generation:** `jspdf` (client-side, for receipts)
- **Deployment:** Cloudflare Pages, build command `npm run build`, output `dist`

### Key architectural decisions
- **Multi-tenancy:** `businesses` table (type: `merchant`/`logistics`/`both`), `users.business_id` + `users.business_type` scope everything per business.
- **Auth:** Custom **username login** — `AuthContext.signInWithUsername()` looks up `users.email` by username, then calls Supabase `signInWithPassword`. Staff without a real email get a placeholder (`staff_xxx@opsbridgepro.internal` or `.app`) until real credentials are set via the Staff page's "Set Login Credentials" flow.
- **Permissions:** `users.permissions` (text array of page keys, empty array = full access) controls sidebar/page visibility. `users.scope_own_records` (boolean) controls **data isolation** — scoped staff (e.g. CS Reps) only see orders/customers/tasks assigned to or created by them, and cannot use "+ New Order"/"+ Add Customer" buttons (prevents self-assignment abuse).
- **Roles are free text**, normalized to `lowercase_snake_case` on save — not a fixed enum. Any role name works; permission presets exist as UI shortcuts only.
- **RLS is disabled on all tables** — access control is enforced entirely in application code via `business_id`/`scope_own_records` filtering, not Postgres RLS. **This is a known gap, not yet hardened for production security.**
- **Bundles use price snapshotting** (`cost_price_snapshot`, `selling_price_snapshot` on `bundle_items`) so historical profit reports don't silently drift when a linked product's price changes later. A manual "Resync Prices" button exists for when drift is wanted.
- **Rewards/Commissions use a generic ledger** (`rewards` table with `reward_type` enum: commission/bonus/incentive) so future bonus/incentive features extend the same table rather than requiring new ones.

---

## 3. Database Schema (all tables, as of this update)

Core:
- `businesses`, `users` (+ `username`, `permissions text[]`, `scope_own_records boolean`), `merchant_logistics_links`

GlowMedals (merchant) side:
- `products`, `customers` (+ `created_by`), `orders`, `order_items`
- `product_bundles`, `bundle_items` (+ `cost_price_snapshot`, `selling_price_snapshot`, `custom_name`, `custom_cost_price` — `product_id` is nullable to support standalone bundle items not tied to the product catalogue)
- `expenses` (+ `campaign_id`) — categories: ads/waybill/staff/office/miscellaneous/custom
- `campaigns` — marketing campaigns, optionally linked to a product and/or order source for ROAS attribution
- `blocked_customers` — fraud/COD-rejection blocklist, checked by phone at order creation
- `merchant_stock`, `merchant_stock_receipts` — GlowMedals' own on-hand inventory (separate from Royale's side), with dispatch validated against and deducted from this balance
- `tasks` (+ `outcome`, `outcome_notes`, `next_action`, `escalation_reason`, `escalated_at`, `follow_up_date`, `completed_by`) — auto-created on order delivered/failed
- `receipts` — tracks generated receipts (PDF/WhatsApp), linked to orders

Royale (logistics) side:
- `agents`, `logistics_requests`, `stock_dispatches`, `agent_stock`, `royale_stock` (running balance, prevents over-dispatch to agents)
- `cod_remittances` (+ `due_at`, `overdue_alert_sent`, `agent_delay_reason`, `batch_reference`, `royale_batch_reference`) — 24hr remittance timeline
- `royale_stock_reports`, `royale_stock_report_items` — monthly stock snapshots published to a merchant for reconciliation

Shared / cross-cutting:
- `notifications` — schema exists, **no UI built yet** (unused so far)
- `commission_rules` — flat / percent_order / percent_profit, targetable by role or specific staff, business-scoped (works for both merchant and logistics businesses)
- `rewards` — the universal ledger (columns: `business_id`, `staff_id`, `department`, `role_snapshot`, `reward_type`, `related_order_id`, `related_campaign_id`, `calculation_method`, `rate_snapshot`, `amount_earned`, `amount_paid`, `status`, `notes`, `reversed_reason`, `approved_by/at`, `paid_at`, timestamps)
- `reward_payments` — payment history/audit trail against a reward (supports partial/batch payments)

**⚠️ Cleanup note:** During this session we found and removed a duplicate/conflicting parallel implementation from an earlier context-reset session: a `commission_rates` table (dropped, empty), a `RewardsLedger.jsx` component (deleted, unused), and a `commissionHelpers.js` file (deleted, unused). If a *future* session ever finds files/tables that don't match this doc, **check before building** — don't assume you invented it fresh.

**⚠️ Verify-before-handoff note:** The initial Rewards handoff assumed `exportRowsToCSV` already existed in the live `csvExport.js` (it existed in the sandbox from a prior reset session, but was never actually pushed). This caused a Cloudflare build failure (`MISSING_EXPORT`) that had to be hotfixed. Lesson: sandbox file state is not proof of live repo state — when reusing a "shared" helper across a build, hand over that helper file too rather than assuming it's already deployed.

All tables have **RLS disabled**.

---

## 4. Feature Status

### ✅ Phase 1 — Foundation (complete)
- Multi-tenant auth & dashboards for both businesses
- Full order pipeline: GlowMedals order → confirm → auto-creates logistics request → Royale assigns agent → out for delivery → delivered/failed
- Stock pipeline: GlowMedals dispatches → Royale confirms receipt → distributes to agent → deducted on delivery
- COD pipeline: auto-created on delivery → agent batch remits → Royale confirms → batch settles to merchant
- Agent mobile view (deliveries, COD, stock)
- Staff management with permissions, username login, Remember Me, password change (both businesses)
- Data scope isolation (`scope_own_records`) for staff privacy/security
- Product edit/delete (dependency-safe — blocks delete if used in orders/bundles, offers deactivate instead)
- Product bundles (with price snapshotting + standalone/custom items not in the product catalogue)
- Task module: auto-created on delivered/failed orders, outcome-based workflow (Customer Satisfied / Ready to Reorder / Escalate / etc.), auto-reorder creation, escalation to manager
- Customer receipts: PDF (jsPDF, branded) + WhatsApp text, tracked in `receipts` table
- Royale Staff module mirroring GlowMedals (password change, credentials, role permissions)

### ✅ Phase 2 (in progress)
- **Blocked Customers** — merchant-side blocklist checked at order creation, manager override with audit trail
- **Ads Spend Tracking + Marketing Dashboard** — campaigns (optionally linked to product/source for attribution), ROAS/CAC/gross-profit calculations, platform & top-product breakdowns, ROAS ranking; ad spend logged as an Expense (category=ads) linked to a campaign, not a separate system
- **CSV Export** — Orders page, "Export Current View" (respects status filter) vs "Export All" (respects data scope, ignores status filter)
- **State Insights** — added as a section within the existing Reports page (not a new top-level module, per explicit decision): orders/revenue/gross-profit/success-rate/fail-rate/avg-delivery-time/top-product/active-customers per state. Avg delivery time computed from `logistics_requests.assigned_at → delivered_at`. Agent workload/coverage-gap fields are explicitly marked "Coming soon" (honest placeholder, not faked) pending a future merchant↔logistics data link.
- **Monthly Finance Rollup** — second tab inside the Finance page (not a new sidebar item). Full P&L: revenue, COGS, gross profit, delivery fees, opex by category, net profit, margin, COD settled/pending, outstanding receivables (live balance, not month-locked), AOV, new customers. Month-over-month % deltas. 12-month trend (custom lightweight SVG line chart, no new dependency). Drill-down modals on Revenue/Expenses. Refunds/Returns explicitly shown as "Not yet tracked" — **no returns/refunds data model exists yet**.
- **Rewards & Commissions engine** — just completed. Generic `rewards` ledger designed to extend into a full Rewards & Incentives platform later (marketing KPI incentives, bonuses, approval workflows) without redesign. Phase 2 scope: flat/percent-of-order/percent-of-profit commission rules, targetable by role or specific staff; auto-awarded (idempotent) when an order is marked `delivered`, for both the assigned CS Rep (merchant side) and the delivering Agent (logistics side); full ledger with Earned→Approved→Paid workflow, manual Reverse (with reason) as the hook point for future automated Returns/Refunds integration; Ledger/Rules/Reports tabs on **both** GlowMedals (`RewardsPage.jsx`) and Royale (`RoyaleRewardsPage.jsx`); CSV export.
- **Merchant Stock Inventory** — GlowMedals now has real on-hand inventory (`merchant_stock`), separate from Royale's side. "Record Stock In" (supplier/production/return/adjustment), dispatch-to-Royale now validates against and deducts from this balance (blocks over-dispatch, same pattern as Royale→Agent), and a Reconciliation view (On Hand vs Sent vs Royale-Confirmed, flags mismatches). Royale can "Publish Monthly Stock Report" — a snapshot (warehouse + optionally agent-held stock) visible read-only to the merchant, without exposing per-agent detail.

### ⬜ Phase 2 — remaining
1. **Automatic Order Assignment** — round-robin routing to available CS Reps/closers, configurable working hours, auto-pause outside hours
2. **Cart Abandoned Tracking** — needs a "lead"/pre-order concept that doesn't exist yet (currently orders are only created once a customer is confirmed)
3. **Form Analytics** — needs ad/lead source instrumentation beyond what currently exists
4. **Mobile App View** — a dedicated lightweight mobile view for managers/owners (the Agent view is already mobile-optimized; manager dashboards are currently responsive-desktop-first only)

### 🔮 Future Phase — explicitly deferred (not started)
Agreed with the user to build this *after* the commission core is stable and tested:
- Marketing/Creative team KPI-based incentives (ROAS/revenue/profit/order targets)
- Company-wide bonus programs (monthly/quarterly/annual, referral, discretionary)
- Manager approval workflows for incentives
- No-code configuration UI for incentive rules
- Advanced rewards analytics/dashboards beyond what Phase 2 built

---

## 5. Known Issues / Technical Debt

- **RLS disabled everywhere.** Fine for current single-team usage; must be addressed before onboarding external/untrusted users or other merchants.
- **No automated tests.** All verification has been manual (user testing in the live app) plus brace/paren syntax sanity checks during generation. **This project's most serious bug so far (see "Resolved Bugs" below) passed every sandbox syntax check and only surfaced as a silent runtime failure** — a reminder that syntax-clean is not correctness-verified.
- **Sandbox/session resets lose in-progress file state.** Always check this file first in a new session before rebuilding anything, and check the live repo for what's actually deployed rather than assuming.
- Refunds/Returns has no data model — several features (Monthly Rollup, commission reversal) have honest placeholders waiting on this.
- Cross-business analytics (Royale's agent workload/coverage visible from GlowMedals' State Insights) is explicitly deferred, not forgotten.

### Resolved Bugs (kept for reference — don't rediscover these)

**Commissions silently never awarded (found and fixed same day as Notifications UI).** Root cause was **three separate stale Postgres CHECK constraints** on the `rewards` table, left over from an earlier abandoned parallel design (the `commission_rates`/`commissionHelpers.js` version deleted earlier in this project — see Section 4's cleanup note). The table's constraints still only accepted the *old* design's values (`reward_type IN ('order_commission','campaign_incentive','bonus','referral','other')`, `calculation_method IN ('flat','percentage_of_order','percentage_of_profit','manual')`) while all the actually-built code (`rewardsHelpers.js`, `commission_rules`, both Rewards pages) used the *new* design's values (`'commission'`, `'percent_order'`, `'percent_profit'`). Every insert failed with Postgres error `23514` — but the original `awardOrderCommission()` never checked the insert's `error` return, so it failed **completely silently** with no console output, no thrown exception, nothing. The delivery/order flow itself worked perfectly throughout, which is exactly why this went undetected for a while.

Fixed in two parts:
1. `rewardsHelpers.js` rewritten so every Supabase call checks and logs its `error` — silent failures on a money-related action are no longer possible by design.
2. The three constraints were dropped and recreated to match what the code actually writes:
   ```sql
   ALTER TABLE rewards DROP CONSTRAINT rewards_reward_type_check;
   ALTER TABLE rewards ADD CONSTRAINT rewards_reward_type_check CHECK (reward_type IN ('commission', 'bonus', 'incentive'));
   ALTER TABLE rewards DROP CONSTRAINT rewards_calculation_method_check;
   ALTER TABLE rewards ADD CONSTRAINT rewards_calculation_method_check CHECK (calculation_method IN ('flat', 'percent_order', 'percent_profit'));
   -- rewards_status_check already matched (pending/earned/approved/paid/reversed/cancelled) — no change needed
   ```

**Lesson for future sessions:** when a `rewards`-adjacent (or any pre-existing-table) feature misbehaves with no visible error, check `pg_constraint` for the actual live CHECK definitions before assuming the application code is wrong — a table can exist with a schema that silently diverges from what the code assumes, especially on a table that had more than one design attempt in this project's history.

**Two `.single()` → `.maybeSingle()` bugs**, found via the same debugging session (console showed `406 Not Acceptable`): `codHelpers.js` (`createCODRecord`) and `stockHelpers.js` (`deductAgentStockOnDelivery`) both used `.single()` to check for an existing row where "no row found" is a normal, expected first-time case (no COD record yet, no agent_stock row yet for that product) — `.single()` treats zero rows as an error (406), `.maybeSingle()` correctly returns `null`. Both fixed. **General rule going forward:** use `.maybeSingle()` for any "does this already exist" existence-check query; reserve `.single()` for queries where exactly one row is a hard guarantee (e.g. fetching by primary key of a row you know exists).

---

## 6. Exact Next Step

### ✅ A. Merchant Stock Inventory — COMPLETE
Built: `merchant_stock`, `merchant_stock_receipts`, `royale_stock_reports`, `royale_stock_report_items` tables. GlowMedals Stock page now has 3 tabs (Inventory/Dispatches/Royale Reports) — on-hand tracking via "Record Stock In", dispatch now validates against and deducts from on-hand balance (blocks over-dispatch), and a Reconciliation view flags mismatches between On Hand / Sent / Royale-Confirmed. Royale's Stock Management page gained a "Publish Monthly Report" action that snapshots their stock (warehouse + optionally agent-held) for a merchant to view read-only.

### ✅ B1. Order Timeline — COMPLETE
Built `order_events` table with 3-tier visibility (`public`/`internal`/`management`), filtered client-side using existing signals (owner sees all, non-scoped staff sees public+internal, scoped staff/agents see public only — no new permission system introduced). `orderEventHelpers.js` provides `logEvent()` (fire-and-forget, never blocks the calling action) and `getVisibleEvents()`. Shared `OrderTimeline.jsx` modal component renders the filtered, chronological log with icons per event type and an "Internal"/"Management" badge visible only to those who can see those tiers.

Wired into the core lifecycle at: order created, order edited (internal), assigned to CS rep, confirmed, sent to logistics, agent assigned, out for delivery, delivered, delivery failed, cancelled, commission awarded (internal). Present on GlowMedals Orders, Royale Requests, and the Agent view — each has a "🕐 View Timeline" button per order/delivery.

**Not yet instrumented (follow-up polish, not blocking):** task outcome changes, stock adjustments, receipt generation, blocklist-match warnings, and anything at the `management` visibility tier (no such actions exist in the app yet — the tier is filter-ready but has no auto-generated events). Add these opportunistically as those flows are touched again, not as a dedicated task.

### ✅ B2. Notifications UI — COMPLETE (core), partial trigger coverage
Built `notificationHelpers.js` (`notify()` — fire-and-forget like `logEvent`; `getBusinessOwnerId()` — fallback recipient for business-level alerts with no specific staff target) and `NotificationBell.jsx` (unread-count badge, dropdown list, click-to-mark-read, mark-all-read), wired into `Sidebar.jsx` for both desktop and mobile. Notifications are inherently recipient-scoped (`recipient_id`) so no additional visibility-tier filtering was needed on top, unlike Order Timeline.

**Trigger points wired:** agent assigned a delivery → notifies the agent; order delivered → notifies the assigned CS Rep; delivery failed → notifies the assigned CS Rep; COD overdue alert sent, both directions (merchant → Royale owner, **and** Royale → agent) → notifies the right recipient; task escalated to a manager → notifies that manager. Wired into `RequestsPage.jsx`, `AgentView.jsx`, `FinancePage.jsx`, `CODPage.jsx` (Royale), and `taskHelpers.js`. **All originally-planned trigger points are now covered — notification coverage is complete for this phase.**

### 🚧 B3. Tasks scheduling/reminder extension — IN PROGRESS / BLOCKED pending architectural fix + end-to-end retest

**Do not treat this as complete.** End-to-end testing surfaced a significant architectural gap (see below) that must be fixed and fully retested before this can be marked done.

**What was built and deployed so far:**
- Schema: `tasks.logistics_id` added (nullable, alongside existing nullable `merchant_id`, with a CHECK ensuring exactly one is set) — tasks now work on **both** GlowMedals and Royale, not just the merchant side. `tasks.reminder_offset_hours` (stored for a future scheduled-reminder phase — see "architectural honesty" note below), `tasks.next_action_type` (free text), `tasks.origin` (constrained: manual/workflow/automation/customer_reschedule/delivery_failure).
- `taskHelpers.js`: `deriveTaskStatus()` computes Upcoming/Due Today/Due Tomorrow/Overdue **live** from `due_date` (not stored, avoids drift); `createLogisticsTask()` and `createMerchantTask()` for creating tasks scoped to either business; `completeTaskWithOutcome()` extended to accept an explicit `rescheduleDate` for reschedule-type outcomes instead of a hardcoded +2-days default.
- `TasksPage.jsx` (merchant): Due Today/Due Tomorrow/Overdue added as derived filter chips + summary cards; reschedule outcomes ("Needs Another Follow-Up", "Re-delivery Scheduled") now show a date picker.
- `RoyaleTasksPage.jsx` (new): Royale's own Follow-ups page — same Due Today/Tomorrow/Overdue view, since Royale previously had no way to see or work logistics-scoped tasks at all. Wired into `App.jsx`, `Sidebar.jsx`, `RoyaleStaffPage.jsx` permissions.
- **Reschedule buttons added in three places:** Royale's Requests page (📅 Log Reschedule on out-for-delivery rows), the Agent's own view (same capability from their login), and — after the user caught this was missing — GlowMedals' Orders page (📅 Reschedule on New/Assigned orders, letting a CS Rep hold an order and schedule a callback *before* confirming/sending to logistics, matching the original spec's core scenario).
- **Architectural honesty, agreed with the user:** OpsBridge Pro has no backend server or cron (see `PROJECT_ARCHITECTURE.md`). True *proactive* reminders (notifying someone at a scheduled time even if nobody has the app open) are **not implemented** and would need a Supabase Edge Function on a schedule — a future phase. What's built instead: live-computed Due Today/Tomorrow/Overdue buckets visible whenever someone opens Tasks/Follow-ups, plus notifications firing at the moment a reschedule/assignment/escalation action actually happens.
- **Bug found and fixed during testing:** Royale's reschedule flow initially passed `agents.id` as a task's `assigned_to`, but that column is a foreign key to `users.id` — fixed to use the agent's actual `user_id`.

**Important discovery — the architectural gap (why this is blocked, not done):**

End-to-end testing (merchant-side reschedule, tested by the user directly) revealed that reschedule was built as a **fire-and-forget event**, not a proper **state change**. Specifically:
- The Order Timeline correctly records every reschedule as history (including multiple sequential reschedules showing their different dates) — this part works.
- But the order itself has no field showing its *current* scheduled date — you have to dig through the Timeline to find the latest one.
- The associated Task is not reliably created/updated to reflect the new date — so there's no single, trustworthy place the assigned CS Rep or agent can look to know "what do I need to do, and when."
- Nothing stops **two different reschedules from being created for the same order** — e.g. a manager reschedules to Friday, then later a CS Rep who didn't know that happened reschedules again to a different date, silently, with no warning.
- There's no concurrency check — if two staff have the same order open, the second save could unknowingly overwrite a newer schedule the first person just set.

**Root cause:** the system conflated two genuinely different concepts that need separate representation:
1. **Timeline** = permanent historical record (already correct, don't touch)
2. **Current schedule** = the one active, current operational state — this concept **did not exist** anywhere in the schema. Each reschedule action independently wrote a Timeline event and *attempted* to write a Task, with no shared notion of "is there already an active schedule for this order, and does this action supersede it or conflict with it."

**Approved architectural direction for the next session (NOT YET IMPLEMENTED — no SQL run, no code changed):**

Add a current-schedule pointer directly on `orders`, proposed schema:
```sql
ALTER TABLE orders ADD COLUMN next_follow_up_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN next_follow_up_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN next_action_type TEXT;
ALTER TABLE orders ADD COLUMN next_follow_up_set_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN next_follow_up_set_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN next_follow_up_reason TEXT;
```

Target invariant: **one order → one current active schedule → one current active scheduling task.** Timeline stays the full history; `orders.next_follow_up_*` + exactly one active task represent current state.

**The next implementation must build ONE shared scheduling/reschedule function**, used identically by all three surfaces that currently each have their own separate (and now proven inconsistent) reschedule logic: Merchant Orders, Royale Requests, and the Agent view. That one function must handle:
- First-time scheduling
- Rescheduling (superseding the old task — mark it `cancelled` with a note referencing the new one, never leave two active tasks competing)
- **Existing-schedule detection**: before saving, check `orders.next_follow_up_date`/`next_follow_up_set_by`/`next_follow_up_set_at` — if already set, show the user exactly what's there (who set it, when, why) and require an explicit choice: **Keep Existing Schedule** (do nothing) or **Change Schedule** (proceed, requires a new date)
- **Stale/concurrent-write protection**: immediately before saving, re-fetch the order's current schedule fields and compare against what was loaded when the modal opened — if they differ, block the save and show the newer schedule instead of silently overwriting it
- Updating `orders.next_follow_up_*`, creating/updating the one active task, logging the Timeline event, and firing the appropriate notification — all as one coherent action, not separate uncoordinated writes

**Schema verification the next session must do FIRST, before writing any code:**
- Confirm `tasks(id)` and `users(id)` are the correct reference targets for the new FKs (should be, based on existing conventions elsewhere in the schema, but verify against the live DB, not memory)
- Confirm none of the six proposed `orders` column names conflict with anything already there
- Confirm no unsafe migration/backfill is needed for existing order rows (nullable columns, so existing rows should be unaffected — but verify)
- Confirm FK naming/`ON DELETE` behavior is consistent with how the rest of the schema does it

**Deferred items (carried forward, unchanged):**
- The three compact Dashboard summary widgets (CS/Royale/Merchant Due-Today/Tomorrow/Overdue counts on the main dashboard pages, not just on Tasks/Follow-ups) — not built because `MerchantDashboard.jsx`/`LogisticsDashboard.jsx` weren't in verified sandbox state during B3's build, and per `AI_RULES.md` guessing at unverified files was judged riskier than a documented gap.
- Automatic Order Assignment, Cart Abandoned Tracking, Form Analytics, Mobile App View (unchanged from before).
- True scheduled/proactive reminders (needs Supabase Edge Functions + cron — later phase, not this one).

**Exact next task:** begin by reviewing this section and `PROJECT_ARCHITECTURE.md` against the live schema, verify the proposed SQL above, then implement the single shared scheduling function and apply it consistently across all three surfaces. **Do not mark B3 complete until the full merchant + Royale + Agent reschedule flow has been retested end-to-end**, including the existing-schedule warning and the concurrency check.

---

## 8. Governance Documents
Two additional permanent reference docs were created alongside this one and must be kept in sync:
- **`docs/PROJECT_ARCHITECTURE.md`** — stable technical reference (system design, full schema, module architecture, business rules, coding standards). Update only when something architectural changes, not for routine feature work.
- **`docs/AI_RULES.md`** — the development constitution every session must follow (core principles, how to resume after a reset, how to generate handoffs, how to debug, how to decide new-module-vs-extend). Read this file, then `PROJECT_ARCHITECTURE.md`, then this progress doc, in that order, at the start of any session.

---

## 7. Working Conventions Established This Project

- **Every SQL change is run by the user in Supabase manually** — Claude drafts it, explains it, user runs it and confirms success before app code is built against it.
- **File handoff pattern:** Claude builds/edits files in its own sandbox, verifies with a brace/paren balance check (no live build tooling available in-session), then uses `present_files` so the user downloads and pastes into VS Code (Ctrl+A → paste → save for existing files; new file creation for new ones), then `git add . && git commit && git push` to deploy via Cloudflare.
- **User is non-technical but capable** — comfortable with VS Code copy-paste workflow and Supabase SQL editor, not writing code themselves. Explanations should stay practical and step-by-step, not academic.
- **This handoff doc must be regenerated/updated at the end of every major feature**, or proactively if a session is running long / approaching limits — per explicit standing instruction from the user.