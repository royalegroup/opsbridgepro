# OpsBridge Pro — AI Development Rules

**Purpose:** this is the constitution every Claude session must follow when working on OpsBridge Pro. Read this file, `docs/PROJECT_ARCHITECTURE.md`, and `docs/DEVELOPMENT_PROGRESS.md` — in that order — before writing or changing anything.

These rules exist because they were each learned the hard way during this project's development. Where useful, the incident that produced the rule is named so a future session understands it's not a hypothetical concern.

---

## 1. Core Development Principles

**Never redesign a completed module unless explicitly requested.** If a page/feature is marked complete in `DEVELOPMENT_PROGRESS.md`, treat its current design as settled. Fixing a bug in it is fine; changing its architecture, data model, or UX pattern without being asked is not — even if you think you'd design it differently today.

**Extend existing modules before creating new ones.** Before adding a new sidebar item or table, check whether the need can be met by adding a tab, a field, or a section to something that already exists. Precedent: Marketing Dashboard/Campaigns, Finance's COD/Monthly-Rollup tabs, Stock's Inventory/Dispatches/Royale-Reports tabs — all deliberately built as tabs inside one page rather than three new sidebar items. The Order Follow-up Engine was explicitly redirected to extend the existing Tasks module rather than become a parallel system, for the same reason.

**Avoid duplicate functionality — always.** Before building a helper, table, or component, check if one already exists. This project has twice built the same thing twice: a `commission_rates` table alongside `commission_rules`, and a `RewardsLedger.jsx` component alongside `RewardsPage.jsx`, both from an earlier session that lost context. Both had to be found and removed. Check `PROJECT_ARCHITECTURE.md` Section 4 (tables) and Section 5 (modules) before assuming something doesn't exist yet.

**Preserve backward compatibility.** Existing orders, receipts, commissions, and reports must continue to compute correctly after a schema or logic change. If a change would alter historical numbers (e.g. changing how profit is calculated), prefer the **snapshot pattern** (store the value at the time, don't recompute from live data) over a live recalculation — this is why `order_items` and `bundle_items` store price snapshots.

**Preserve multi-tenant architecture.** Every new table gets a business-scoping column. Every new query filters by `profile.business_id`. Never write a query that could return another business's data, even accidentally through a missing `.eq('business_id', ...)`.

**Reuse existing components whenever possible.** Before writing new JSX for a modal, form, badge, or stat card, check `src/components/shared/` and the CSS utility classes in `index.css` (`.btn-primary`, `.card`, `.input`, `.badge`, etc.). New UI should look and behave like a natural extension of what exists, not a visually distinct addition.

**Design every new database schema for future expansion**, even when only building a narrow slice of it now. Precedent: the `rewards`/`commission_rules` schema was deliberately built wide (supporting flat/percent/staff-override/product-override, and a generic `reward_type`) even though Phase 2 only used a fraction of it — this let the future Rewards & Incentives expansion be additive rather than a redesign. When scoping a feature, ask "what would this need to become later?" and leave room in the schema for that, even if the UI for it doesn't exist yet.

**Build features incrementally.** Don't build five interdependent pieces in one uninterrupted pass without checkpoints. Prefer: ship the schema → confirm it works → build the core UI → confirm it works → wire in cross-module triggers → confirm. Large specs (the original Rewards & Incentives spec, the Order Follow-up Engine spec) should be explicitly split into "build now" and "future phase" before any code is written — and that split should be proposed to the user, not assumed unilaterally.

**Don't over-engineer Phase 2 (or any) features.** Match the build to the agreed scope. If a spec has ten sections and the user agreed to build three now, build three well rather than all ten shallowly. A no-code configuration UI for business rules, for example, is a legitimate future ambition but should not be built "just in case" inside a feature whose Phase 2 scope was one hardcoded calculation method.

**Separate SQL changes from React changes.** Always give the user SQL to run and get their confirmation of success *before* writing application code against that schema. Never guess at a schema and build code against the guess. When a table might already exist (context reset, prior session), verify its actual columns via a `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '...'` query before assuming.

**Always explain deployment steps.** Every code handoff should tell the user exactly which file(s) to update in VS Code (new file vs. Ctrl+A-replace-existing), and the exact `git add / commit / push` sequence. Don't assume familiarity with the workflow even though it's now well-established — restate it briefly each time.

**Always update `DEVELOPMENT_PROGRESS.md` after completing a major feature**, or proactively if a session is running long. This is not optional — it is part of the Definition of Done for every feature, per explicit standing instruction. See Section 3 for how.

**Respect existing business rules.** Before changing behavior, check `PROJECT_ARCHITECTURE.md` Section 7 (Business Rules). Rules like "commissions only award on delivered," "scoped staff can't self-assign," "delivery is always shown as FREE on receipts," and "stock can never be over-dispatched" were each deliberate product decisions, not incidental behavior — don't quietly change them while building something else.

**Keep UI consistent with existing modules.** Same modal patterns, same tab patterns, same button copy style ("+ New X", "Save Changes", etc.), same color usage (`success`/`warning`/`danger`/`brand`/`cod`). A user should not be able to tell which session built which page.

**Prefer automation over manual processes**, matching what's already established: commissions auto-calculate on delivery rather than requiring manual entry; follow-up tasks auto-create on delivered/failed; COD records auto-create on delivery. When building something a human would otherwise have to remember to do, default to automating it unless there's a clear reason not to.

**Every important business action should be auditable.** Money (rewards, COD, expenses), stock movements, and order status changes all have created-by/timestamp trails and (for orders) timeline events. New features that touch money, stock, or order state should follow the same standard — don't add a silent mutation path.

**Never remove existing functionality without approval.** Deprecating or deleting a feature, table, or page requires an explicit ask from the user — never infer that something is "probably unused" and remove it. (The one exception: cleaning up files/tables that were never wired into the live app at all, which is a duplicate-cleanup situation covered under "avoid duplicate functionality," not a functionality removal.)

**Always consider both merchant and logistics workflows before implementing a feature.** Most operational features (Staff, Rewards, Stock) exist in near-identical form on both the GlowMedals and Royale sides. Before declaring a feature "done," check whether the other business needs the equivalent — don't assume a merchant-side feature request doesn't also apply to logistics, or vice versa.

**Reuse existing helper functions where appropriate.** Check `src/lib/` before writing new calculation or formatting logic. `csvExport.js`, `orderEventHelpers.js`, `rewardsHelpers.js`, etc. are meant to be imported, not reimplemented per-page.

**Follow the existing coding style** exactly as documented in `PROJECT_ARCHITECTURE.md` Section 9 — functional components, the established naming conventions, the modal-based CRUD pattern, the `load()`/`Promise.all()` data-fetching pattern, snake_case matching the DB columns directly (no camelCase mapping layer).

**Think about scalability without sacrificing simplicity.** The schema should anticipate growth (see the schema-expansion rule above), but the *shipped* UI/logic should stay as simple as the current phase actually requires. Scalability lives in the data model and architecture, not in premature UI complexity.

---

## 2. How to Resume After a Context Reset

Claude's sandbox has been reset multiple times during this project. When starting a session with no memory of prior conversation (or uncertain memory):

1. **Read `docs/PROJECT_ARCHITECTURE.md` first** — get oriented on what exists and how it's built.
2. **Read `docs/DEVELOPMENT_PROGRESS.md` second** — get oriented on current status, what's in progress, and the exact next step.
3. **Do not assume your sandbox's local file state matches the live repository.** The sandbox may be empty, may have stale files from a previous reset session, or may be missing files that exist live. Before building on top of an existing file, ask the user to confirm it exists in their real project, or simply hand over the complete file rather than a partial diff.
4. **If you find a file or table that isn't documented** in either doc, don't assume you invented it — treat it as a signal that undocumented work may exist, and verify with the user (e.g. via a Supabase `information_schema` query, or asking them to check their VS Code file tree) before building on or around it.
5. **If a genuinely conflicting duplicate is found** (two tables/files clearly attempting the same thing), stop and resolve it explicitly with the user before proceeding — don't silently pick one and hope, and don't leave both in place.

---

## 3. How to Generate Handoff Documents

At the end of every major feature (or proactively if a session is running long / approaching limits):

1. **Update `docs/DEVELOPMENT_PROGRESS.md`** — mark the just-completed feature as done with a real summary (what was built, what files changed, any deferred polish), and update the "Exact Next Step" section to reflect the new current priority.
2. **Only touch `docs/PROJECT_ARCHITECTURE.md`** if the feature changed something architectural (new table, new cross-cutting pattern, new business rule) — routine feature work doesn't need an architecture-doc edit.
3. **Hand the updated doc(s) to the user the same way as any other file** — `present_files`, tell them exactly what to paste and where, include it in the same `git commit` as the feature itself (or a small follow-up commit) so the doc and the code it describes never drift apart in the repo history.
4. **Give a short in-chat summary too** — the doc is for future-session/developer reference; the user still needs a plain-language recap in the conversation itself.
5. **Be honest about what's incomplete.** A handoff document that overstates completeness is worse than useless — it actively misleads the next session. Explicitly list deferred polish, known issues, and unconfirmed assumptions rather than implying everything is finished.

---

## 4. How to Approach Debugging

1. **Reproduce the actual error before proposing a fix.** When the user pastes a Cloudflare build log or a browser console error, read it fully — the real cause is usually stated explicitly (missing export, RLS block, column mismatch) rather than needing to be guessed.
2. **Treat a live build/deploy failure as authoritative over any local sandbox check.** Claude's sandbox has no live `npm run build` — brace/paren-balance checks are a sanity net, not proof of correctness. If Cloudflare fails on something the sandbox check passed (this has happened — a missing `exportRowsToCSV` export slipped through), fix forward immediately and don't re-trust the same weak check for that class of error going forward.
3. **Check schema reality before code reality.** A large share of bugs in this project have been schema drift (a table/column assumed to exist but not confirmed, or two conflicting versions of the same table from different sessions) rather than logic bugs. When something doesn't behave as expected and Supabase is involved, verify the actual table structure with a query before assuming the application code is wrong.
4. **Isolate before rewriting.** Prefer a minimal, targeted `str_replace`-style fix over regenerating an entire file, unless the file is already being fully replaced for other reasons in the same turn. Full-file regeneration should be reserved for when the sandbox doesn't have the current file state to patch against.
5. **Explain the root cause to the user in plain terms**, not just the fix — they are non-technical but engaged, and understanding *why* something broke (e.g. "the sandbox had a leftover function from an earlier session that was never actually deployed") helps them trust and follow future instructions.

---

## 5. Deciding: Existing Module or New Module?

Ask, in order:

1. **Does this belong to a business object that already has a home?** (e.g. anything about an order's history → Order Timeline; anything about money owed to staff → Rewards ledger.) If yes, extend that module.
2. **Would a new tab inside an existing page satisfy this**, the way Marketing/Finance/Stock each host multiple related concerns as tabs? If the feature is a *view* or *workflow variant* on data that already has a home page, add a tab rather than a new sidebar item.
3. **Does it need its own top-level navigation because a user would go there directly and often**, independent of any other page? (e.g. Orders, Tasks, Staff each warranted their own sidebar item because they're primary daily destinations.) Only create a new page/module if this is genuinely true.
4. **Does it need a new table, or does it fit into an existing generic structure?** Check whether `rewards` (reward_type), `order_events` (event_type + visibility_level), or `expenses` (category) could absorb the new concept via a new enum value rather than a new table. Prefer extending an existing generic table over creating a narrow new one, *unless* the new concept has meaningfully different columns/relationships that would force awkward nullable fields onto the existing table.
5. **If still unsure, propose the options to the user** rather than deciding unilaterally — this project's most complex features (Rewards & Incentives, the Follow-up Engine) were explicitly scoped through a back-and-forth with the user about "build now vs. future phase" and "extend X vs. build new," and that conversation produced better outcomes than a unilateral architectural call would have.