# Mortgage Early Payoff + Reverse Mortgage (MP/MO/MR) Plan

## Goals

- Make early mortgage payoff **explicit** in the Events table (no more “hidden” payoff via shortening `M.toAge` or relocation resolution only).
- Support **overpaying** a mortgage from a chosen age (explicit event).
- Add a **reverse mortgage** event that pays out cash explicitly and stops advancing when the loan reaches the property value (simplified cap).
- Keep property sale cashflow behaviour **net** (sale proceeds available for next purchase/investing are what matters for calculations), while still showing forward/reverse mortgage settlement clearly in **attributions**.
- Ensure any auto-recomputed ages/amounts are visibly surfaced via brief highlight/flash, consistent with existing auto-updates.

## Non-goals (for this iteration)

- Country-specific reverse mortgage products (HECM vs local variants), fees/insurance, or complex draw options beyond “one-off or annual range”.
- Full lender compliance rules (tax/insurance defaults, move-out triggers, etc.).
- Multiple simultaneous loan instruments on the same property (unless explicitly decided; see decision below).

---

## Event Types (user-authored, explicit)

### `M` — Mortgage (base contract + scheduled payment)

- **Meaning:** A standard amortizing mortgage tied to a property `R` event (same `id`).
- **Fields (existing):**
  - `id` = property id (must match a single `R` event)
  - `fromAge` = start age (must match `R.fromAge`)
  - `toAge` = payoff age (required; see validation)
  - `amount` = yearly scheduled repayment amount
  - `rate` = annual interest rate
- **Canonical rule:** `M.toAge` represents the effective payoff end age after considering linked payoff/overpay events.
  - `M.toAge` must never be blank (simulation-blocking error).

### `MO` — Mortgage Overpay (extra principal payments)

- **Meaning:** An additional explicit expense applied to the active mortgage for that property.
- **Fields (proposal):**
  - `id` = property id (same as `M.id`)
  - `fromAge` / `toAge` = overpay window (inclusive); allow one-off by `fromAge == toAge`
  - `amount` = yearly overpay amount (expense)
  - `rate` unused (hidden)
- **Effect:** reduces remaining principal faster; can pull `MP` earlier and therefore shorten `M.toAge`.

### `MP` — Mortgage Payoff (lump-sum settlement)

- **Meaning:** A one-off explicit expense that settles the remaining principal at the payoff age.
- **Fields (proposal):**
  - `id` = property id (same as `M.id`)
  - `fromAge` = `toAge` = payoff age (one-off)
  - `amount` = computed remaining principal at that age (auto unless user overrides; see impact rules)
  - `rate` unused (hidden)
- **Invariant:** `MP.age` always equals `M.toAge` once linked.

### `MR` — Reverse Mortgage (payouts against home equity, simplified)

- **Meaning:** A loan against the property that **pays cash to the user** and accrues interest onto the balance; repayment occurs on property sale.
- **Fields (proposal):**
  - `id` = property id (must match a single `R` event)
  - `fromAge` / `toAge` = payout window; allow one-off by `fromAge == toAge`
  - `amount` = yearly payout (income/cash inflow)
  - `rate` = annual interest rate applied to reverse balance
- **Cap (simplified):** payouts stop (or are reduced) once reverse balance reaches property value.
  - Interest continues accruing after payouts stop.
  - On sale, repayment is non-recourse: repay up to sale proceeds; any shortfall is written off (attribution-only).

---

## Linking & Propagation Rules (forward mortgage)

### Relationship model

- Group key: property `id`.
- Per property id, there is:
  - exactly one `R` (purchase/sale) event
  - exactly one `M` event (forward mortgage) **if** forward mortgage is used
  - optionally one `MO` and one `MP` (start with 1 each for simplicity; expand later if needed)

### Deterministic propagation (no circular ambiguity)

- **Invariant:** `MP.age == M.toAge` (always enforced after edits).
- **Edit `MO.fromAge`, `MO.toAge`, or `MO.amount`:**
  - recompute the implied payoff age
  - auto-adjust `MP.age` to that payoff age
  - set `M.toAge = MP.age`
  - flash/highlight `MP.fromAge`, `MP.toAge`, and `M.toAge` when changed
- **Edit `MP.age`:**
  - set `M.toAge = MP.age`
  - recompute `MP.amount` (remaining principal at that age, taking `MO` into account)
  - flash/highlight `M.toAge` and `MP.amount` when changed
- **Edit `M.toAge`:**
  - move/create `MP` to that age
  - recompute `MP.amount`
  - flash/highlight the auto-updated fields

### Conflict handling (impact resolution)

When a user edits fields such that `MO` implies payoff at a different age than the user-forced `MP.age`:

- Show an inline impact resolution panel (same UX class as relocation impacts), offering:
  1. “Make payoff age match overpayment plan” (move `MP` and `M.toAge`)
  2. “Keep payoff age; adjust overpayment amount/window” (recompute `MO.amount` or `MO.toAge`, depending on which field is editable)
  3. “Disable overpayment” (set `MO` to NOP or remove)

Auto-edits from resolution must flash/highlight changed fields.

---

## Property Sale Semantics + Attributions

### Required behaviour

- **Cash ledger:** the user only gets **net proceeds** available for subsequent allocations (buy property, invest, emergency stash).
- **Attributions:** property sale should still show (even if cash is net):
  - gross sale value (if available)
  - forward mortgage remaining principal settlement (if any)
  - reverse mortgage balance repayment (if any)
  - any reverse-mortgage non-recourse write-off (if applicable)

### Implementation approach (preferred: attribution-only breakdown, preserve net cash)

- Keep existing “net sale proceeds” cashflow for correctness and minimal churn.
- Enrich the sale entry payload (the existing `type: 'sale'` orderedEntry) with additional metadata captured **before** deleting the property record, e.g.:
  - `forwardMortgagePayoff`
  - `reverseMortgagePayoff`
  - `reverseWriteoff`
- In the sale handling path, record additional attribution lines from this metadata without changing the cash amount added.

This avoids needing to refactor `RealEstate.sell()` to return gross value or changing the cash accounting paths.

---

## Validation (simulation-blocking vs warning)

### Blocking errors

- `M.toAge` must be present (blank is simulation-blocking).
- `M` must have exactly one matching `R` event with same `id` and same `fromAge`.
- `MP` must be one-off (`fromAge == toAge`) and must match `M.toAge` once linked.
- `MO` range must lie within the mortgage active window (from `M.fromAge` to `M.toAge`).

### Warnings

- `MO.amount` so large it implies payoff within the same year (allowed, but warn).
- `MP.amount` manually overridden (if we allow overrides) and differs materially from computed payoff.

---

## Reverse Mortgage (`MR`) Behaviour Details

### Balance and payouts

- Each year in `MR` window:
  - determine current property value (market value; not equity)
  - compute remaining “advance headroom” = `max(0, propertyValue - balance)`
  - payout = `min(MR.amount, headroom)` (or 0 if no headroom)
  - record payout as cash inflow (non-taxable “loan proceeds”)
  - accrue interest onto balance annually (balance grows regardless of payout)

### Settlement

- On property sale (`R.toAge`):
  - repay = `min(balance, saleProceedsAvailable)`
  - reduce sale proceeds by `repay` for net cash effect (or record as attribution-only if sale proceeds are already net)
  - if `balance > saleProceeds`, write off the remainder (attribution-only)

### Linking constraints

- `MR` requires the property to have a sale age (`R.toAge` set); otherwise show a blocking error or an impact that forces user to set `R.toAge`.

---

## `MR` vs `M` on the Same Property

### Rule: allow sequence only

- Do not allow overlapping active windows for forward and reverse mortgages on the same property id.
- Allow sequencing only when `MR.fromAge > M.toAge` (no same-year overlap).

Rationale: FinSim runs on whole-year (age) buckets. If `MR.fromAge == M.toAge`, both instruments would be “active” in the same simulated year unless we introduce intra-year ordering semantics. For v1, avoid that ambiguity by starting the reverse mortgage the year after the forward mortgage payoff year.

When the user creates an overlap in the table view, show an inline impact badge + resolution panel that offers to:

- auto-convert at age `X` (default `X = MR.fromAge`) by setting `M.toAge = X` and creating/moving `MP` to `X`
- or shift `MR.fromAge` to `M.toAge + 1`
- or cancel `MR`

All auto-edits flash/highlight the specific fields changed.

---

## UI/UX Tasks (table + accordion + wizard)

- Add event types `MP`, `MO`, `MR` to event type dropdown and help/tooltips.
- Add overlap detection for `M` vs `MR` and wire it into the impact-badge + inline resolution panel in the table view.
- Add wizards:
  - `MO`: pick property (mortgage), window, amount
  - `MP`: pick property, payoff age (amount computed/shown)
  - `MR`: pick property, window, payout amount, interest rate
- Events Wizard integration:
  - Define `MP/MO/MR` wizard flows in `src/frontend/web/assets/events-wizard.yml`.
  - Ensure the table-view wizard button (per-row) can launch these flows and write results back into the active row.
  - Support “convert forward → reverse” as either:
    - an overlap-resolution action (table impact panel), and/or
    - a dedicated wizard flow that creates/updates `MP` and `MR` plus adjusts `M/MO`, with field flashes for all auto-updated cells.
- Implement auto-propagation with visible feedback:
  - re-use existing field flash/highlight utilities used by other auto-updates
- Add impact resolution panel for mortgage-plan conflicts (parallel UX to relocation impacts).

---

## Core Tasks

- Extend mortgage engine to support:
  - extra principal payments (`MO`) that reduce remaining principal without changing base scheduled payment
  - explicit payoff (`MP`) that settles remaining principal at payoff age
- Add reverse mortgage state per property (balance + rate) and payout logic capped by property value.
- Ensure sale path emits attribution breakdown for loan settlement while keeping net cash semantics.

---

## Serialization / CSV

- Ensure `MP/MO/MR` round-trip through `serializeSimulation()` / `deserializeSimulation()` in `src/core/Utils.js`.
- Persist computed fields (no recompute-on-load):
  - `MP.amount` (computed payoff) must be written to CSV and restored on load
  - any auto-adjusted payoff ages (e.g., `M.toAge`, `MP.fromAge/toAge`) are already persisted by virtue of being event fields

---

## Tests

Core (Node) tests under `tests/`:

- `TestMortgagePayoffEvent`: `M + MP` settles correctly; `M` payments stop; payoff expense matches remaining principal.
- `TestMortgageOverpayShortensTerm`: `M + MO` implies earlier payoff; `MP` auto-age shifts; totals match expectation.
- `TestReverseMortgageCapAndAccrual`: `MR` payouts stop at cap; interest accrues; sale settlement caps to proceeds; write-off recorded.
- `TestSaleAttributionBreakdownLoans`: sale attribution includes forward/reverse settlement lines while net cash remains correct.

UI:

- Manual validation checklist (until automated): edit `MO.amount` and verify `MP.age` and `M.toAge` auto-update with highlight.

## Confidence Tests (mandatory)

Add confidence (oracle) tests per `/Users/jhandl/FinSim/docs/confidence-tests-guide.md:1`:

- `ConfidenceTest*_MortgageOverpayPayoffLinking`: proves `MO` → payoff age and `MP.amount` from first principles under the toy ruleset math.
- `ConfidenceTest*_ReverseMortgageCap`: proves `MR` payout cap and interest accrual, including settlement non-recourse write-off attribution.
- `ConfidenceTest*_PropertySaleLoanAttribution`: proves sale attribution breakdown includes loan settlement components while cash uses net proceeds.
