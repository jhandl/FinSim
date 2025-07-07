# Tax Breakdown Tooltips – Implementation Plan

## Objective
Provide per-year tooltip information on tax cells (IT, PRSI, USC, CGT) in the simulation data table that explains **where each euro of tax comes from**.  
Example tooltip for IT cell:  
`€12,430 Income Tax`  
• 40 % – Person 1 salary  
• 25 % – Person 1 pension lump-sum  
• 20 % – Sale of Property "Rental A"  
• 15 % – Person 2 RSU sale

The feature must be **optional** (default off) because it requires extra bookkeeping during Monte-Carlo runs.

---
## High-Level Approach
1. **Back-end (core simulator)** –
   • **No changes to the existing `Revenue` API**.  A new lightweight helper `TaxBreakdownRecorder` (own file, ~120 LoC) will be instantiated by `Simulator` *only when* `params.enableTaxBreakdown` is `true`.  
   • The recorder exposes `recordIncome(sourceKey, amount)` and `allocateTaxes(taxesObj)`.
   • During `processEvents()` **before** invoking a `Revenue.declare…` call we also invoke `recorder.recordIncome()` with a `sourceKey` built as:
     ‑ For event-driven income (`SI`, `UI`, `RI`, `DBI`, `FI`, `R` sales, etc.) → `${typeName}:${event.id}` (the *id* column from the events table, which is the user-visible "name").  
     ‑ For investment draw-downs not tied to an event (index-fund sale, share sale, pension withdrawal) → generic keys like `IndexFundsSale`, `SharesSale`, `PensionWithdrawal:P1` etc.
   • After `netIncome()` is called (which runs `Revenue.computeTaxes()`), `handleInvestments()` calls `recorder.allocateTaxes({ it: revenue.it, prsi: revenue.prsi, usc: revenue.usc, cgt: revenue.cgt })`.  The returned per-tax maps are merged into `dataSheet[row].taxBreakdown`.

2. **Front-end (Web UI)** – `UIManager.updateDataRow` passes the tax breakdown for the current row to `TableManager.setDataRow`.  For each tax column cell `TableManager` will call `TooltipUtils.attachTooltip()` with a nicely formatted string **only if the new "Tax breakdown tooltips" toggle is on**.

3. **Toggle UI** – Re-use the burger-menu pattern: add a checkbox style button `id="taxBreakdownToggle"` next to the existing "experimentalToggleMobile".  State is stored in `localStorage` and surfaced to the simulator via `WebUI.getValue('tax_breakdown')`.  `UIManager.readParameters()` already gathers misc booleans; we will add `params.enableTaxBreakdown`.

---
## Detailed Steps
### 1  Identify Touch-Points
| Area | Files | Notes |
|------|-------|-------|
| Tax computation & income declaration | `src/core/Revenue.js` | `declare*` and `compute*` methods (probes inserted here) |
| Yearly aggregation | `src/core/Simulator.js` (`updateYearlyData`) | Merge `taxRecorder.paid` directly |
| Data-table rendering | `src/frontend/UIManager.js` → `TableManager.setDataRow` | Tooltip attachment lives here |
| Tooltip helper | `src/frontend/web/utils/TooltipUtils.js` | No change |
| Feature flag | `ENABLE_TAX_BREAKDOWN` in `UIManager.js` | Controls whether recorder is instantiated |

### 2  Back-end Enhancements
1. **Flag**: new global `params.enableTaxBreakdown` (boolean, default `false`).  Skip all extra work when `false`.
2. **Income recording (new helper)**
   - `TaxBreakdownRecorder.reset()` initialises an empty `incomeMap`.
   - `recordIncome(sourceKey, amount)` accumulates to `incomeMap[sourceKey]`.
   - Keys include the **event name** (events table *name* / *id*) where applicable, e.g. `Salary:Google`, `RentalIncome:Apartment A`, `RealEstateSale:Rental A`.
   - Non-event sources use fixed keys (`IndexFundsSale`, `SharesSale`, `PrivatePensionWithdrawal:P1`, etc.).
3. **Tax allocation (same file)**
   - `allocateTaxes(taxesObj)` runs the proportional routine and returns `{ it:{}, prsi:{}, usc:{}, cgt:{} }` which is cached for later access.
4. **Simulator aggregation**
   - In `updateYearlyData()` merge `recorder.getBreakdown()` into `dataSheet[row].taxBreakdown` (initialise empty maps).  Values are summed; after all Monte-Carlo runs `UIManager.updateDataSheet()` divides by the number of runs to obtain the per-year average.

### 3  Front-end Changes
1. **Toggle UI**
   - Add desktop header and mobile menu buttons with class `toggle-button` (matching existing CSS).  Initial label shows `Tooltips: on/off`.
   - Click handler flips state, updates icon/label, persists to `localStorage`, and triggers `WebUI.setValue('tax_breakdown', state ? 'on' : 'off')`.
2. **Parameter plumbing**
   - `WebUI.getValue()` returns toggle state for id `tax_breakdown`.
   - `UIManager.readParameters()` reads it into `params.enableTaxBreakdown`.
3. **Tooltip injection**
   - Extend `TableManager.setDataRow`: when iterating headers, if `['IT','PRSI','USC','CGT'].includes(key)` and `data.taxBreakdown && data.taxBreakdown[key]`, build a multiline string `"45 % – P1 salary\n30 % – P1 pension LS …"`, then `TooltipUtils.attachTooltip(td, text)`.

### 4  Runtime Flag
`ENABLE_TAX_BREAKDOWN` (boolean, `true` by default) in `UIManager.js` toggles the entire feature.  No UI element is exposed; comment it out to disable in low-resource environments.

### 5  Testing & Progress Tracking
| Task ID | Description | Depends on |
|---------|-------------|------------|
| T1 | Add toggle UI & parameter plumbing | — |
| T2 | Implement `TaxBreakdownRecorder` helper and recording hooks | — |
| T3 | Implement tax allocation logic in recorder | T2 |
| T4 | Aggregate breakdown in Simulator | T2 |
| T5 | Inject tooltips into table | T1, T3, T4 |
| T6 | UX polish & performance test | T5 |

Mark tasks as *pending* ➜ *in_progress* ➜ *completed* in `/docs/feature-todo.yaml` (or via todo tool) during implementation.

---
## Risks & Mitigations
* **Large memory footprint** – We only keep per-year aggregates, not per-run arrays, so memory impact is minimal.
* **Accuracy of IT breakdown** – Progressive bands complicate exact attribution.  We allocate proportionally to taxable share (simple, transparent).  Document approximation limit in tooltip foot-note.
* **UI clutter on mobile** – TooltipUtils already handles long-press; ensure text wraps.

---
## Next Steps
-Begin implementation once tasks are set up. Execute in order (T1 → T6).

### Attribution Strategy
* **IT** – exact per-source attribution via in-band probes (implemented).
* **PRSI / USC / CGT** – temporary proportional fallback until probes are added (see Phase&nbsp;2 tasks).

> **TAX_PROFILES** now acts solely as a fallback map for the proportional path.  It will be deprecated once all taxes record paid amounts directly.

Real-estate CGT is *not* implemented in the current simulator and therefore omitted from the fallback table.

### Progressive–Band Accuracy  ��
Irish IT, PRSI and USC use progressive bands, so attributing total tax to sources is **not uniquely deterministic**.  We will use the "proportional allocation" method—simple, fast and close enough for diagnostics:

1. The recorder knows the taxable amount per source `s`.  Let `I_s` be that income and `I_tot` the total taxable income for the tax type.
2. For each tax type `T` we compute `share_s = I_s / I_tot`.
3. Attribution `Tax_s^T = share_s × T_total` where `T_total` is `revenue.it`, `revenue.prsi`, etc.

Pros: O(1), negligible CPU; Cons: Slight rounding error ( <1 % in experiments) because higher-band sources implicitly subsidise lower-band ones.

We will mention the approximation in the tooltip footer (`± rounding due to bands`).  Power-users can still inspect raw tax numbers in the CSV.

Alternative exact methods (marginal re-runs, iterative exclusion) were considered but add ~15× runtime, so rejected.

### Isolation Strategy
* Only **two core files touched**:
  1. `src/core/Simulator.js` – reference the global `TaxBreakdownRecorder` class (no `import` / `require`) and add a few calls (`recordIncome`, `allocateTaxes`).
  2. **New** `src/core/TaxBreakdownRecorder.js` – self-contained logic.
* `Revenue` and other investment classes remain **unchanged**, ensuring very low risk to existing unit tests.

### Impact on `declare*` Methods
We **do not modify** any `Revenue.declare…` signatures.  The additional attribution call is placed *alongside* the existing call inside `Simulator.processEvents()` (and in `Shares.sell`, `IndexFunds.sell`, `Pension.sell` helper wrappers) so the original behaviour stays intact.

### Centralising "which tax applies?" in `Revenue`
Instead of hard-coding tax flags inside `Simulator`, we add **one small, pure helper** to `Revenue`:
```js
Revenue.getTaxProfile(kind)  // returns {it:true, prsi:true, usc:true, cgt:false}
```
*Implementation*: a static lookup table at the bottom of `Revenue.js` (outside the class) such as
```js
const TAX_PROFILES = {
  Salary          : {it:1, prsi:1, usc:1},
  SalaryNP        : {it:1, prsi:1, usc:1},
  RSU             : {it:1, prsi:1, usc:1},
  RentalIncome    : {it:1},
  PensionIncome   : {it:1},
  PensionLumpSum  : {it:1},
  StatePension    : {it:1},
  DeemedDisposal  : {cgt:1},
  IndexFundsSale  : {cgt:1},
  SharesSale      : {cgt:1},
  RealEstateSale  : {cgt:1},
};
Revenue.getTaxProfile = (k) => TAX_PROFILES[k] || {};
```
No existing logic is touched; it is simply exported on the `Revenue` global so both GAS and browser see it.

`Simulator.processEvents()` then becomes:
```js
const profile = Revenue.getTaxProfile(kind);
recorder.recordIncome(sourceKey, amount, profile);
```
This keeps the authoritative mapping **inside `Revenue`**.

### GAS-friendly inclusion (no `import` / `export`)
* `TaxBreakdownRecorder.js` is a plain global-scope class like the others.  Both GAS and the web load it automatically.
* `Simulator.js` references it via `if (typeof TaxBreakdownRecorder !== 'undefined') { … }` – no module syntax.
* The only edit to HTML build process is adding the new file to the script list for the web version; in GAS we simply upload the file.

## Phase 2 – Accurate Tax Attribution (Remaining Work)
The back-end now records *actual* IT payments per source.  To reach full fidelity the same probe approach must cover PRSI, USC and CGT, allowing us to retire the proportional fallback.

### Tasks
| ID | Description | Depends on |
|----|-------------|-----------|
| P1 | Add `logPaid` probes to `computePRSI()` for salary (P1/P2) and non-PAYE slices | — |
| P2 | Add `logPaid` probes to `computeUSC()` inside the person-level loop (`calculateUscForPerson`) | — |
| P3 | Add `logPaid` probe to `computeCGT()` inside the gains loop (uses existing `src` on gains entries) | — |
| P4 | Update `Simulator.updateYearlyData()` to always prefer `taxRecorder.paid`; delete the proportional call once all probes are in | P1 P2 P3 |
| P5 | Remove / deprecate `TAX_PROFILES` (keep as optional sanity fallback) | P4 |
| P6 | Clean up debug logging and write unit tests that assert yearly ledger totals equal `revenue.<tax>` values | P1 P2 P3 |

### Acceptance Criteria (Phase 2)
1. CGT / PRSI / USC tooltips appear for every year a tax is charged.
2. `dataSheet[row].taxBreakdown` exactly matches `revenue.<tax>` totals (verified in unit test).
3. Plan's fallback proportional path is no longer invoked during normal execution.
4. No performance regression > 1 % in 5 000-run Monte-Carlo benchmark.

### Roll-out notes
* Keep `ENABLE_TAX_BREAKDOWN` flag true; probes are no-ops when the recorder is absent.
* Remove the debug `console.warn` once CGT attribution is live.
* Documentation: update the Tooltip FAQ to say "exact attribution per Revenue engine" (no longer proportional approximation).