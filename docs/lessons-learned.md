# Multi‑Country Assets – Lessons Learned (Nov 2025)

This document captures what went wrong in the first attempt to implement  
`docs/multi-country-assets-plan.md`, so a future session can avoid repeating
the same mistakes. The intent is to **start from a clean git state** and
re‑approach the plan with these lessons in mind.

---

## 1. High‑Level Problems

- **Too many moving parts at once**
  - Touched core PV logic, real‑estate nominal growth, FX behaviour, table
    export, and chart rendering in a single chain of edits.
  - Result: regressions became hard to localise; fixes for one layer (charts)
    introduced new issues in others (tables, index.html, loader errors).

- **UI and core responsibilities blurred**
  - The plan explicitly says PV should be “exact by construction” in the
    core and the UI should **only choose between nominal vs `*PV` fields**.
  - I reintroduced non‑trivial inflation / FX decisions in `TableManager` and
    `ChartManager` (e.g. per‑asset “source country”), which:
    - Conflicted with the core semantics.
    - Made it much harder to reason about why asset PV looked wrong.

- **Insufficient respect for existing baselines**
  - `TestChartValues.js` and the existing `demo3.csv` baselines were designed
    to catch the sort of “another galaxy” spikes that appeared.
  - I changed behaviour until those tests still passed but the real scenario
    (your demo3) behaved very differently, instead of using the tests as an
    explicit contract and only moving them with a clear, measured rationale.

- **Weak feedback loop with the browser**
  - Early console errors (`ChartManager.updateChartsRow error: …`,
    “Identifier 'Phases' has already been declared”) were symptoms of
    fundamental wiring problems (duplicate scripts, undefined variables).
  - I fixed these iteratively but only after making other changes, which
    compounded user confusion and broke trust.

---

## 2. Specific Technical Mistakes

### 2.1 PV Layer in `Simulator.updateYearlyData()`

- **What went wrong**
  - Introduced `deflationFactorAssetHome` and applied it to:
    - `realEstateCapitalPV`, `pensionFundPV`,
      `indexFundsCapitalPV`, `sharesCapitalPV`, `worthPV`.
    - `investmentCapitalByKeyPV`.
  - For demo3, `StartCountry = ie`, while the relocation country AR has very
    high inflation and extreme FX evolution. Mixing these deflators and then
    converting to unified EUR produced:
    - Astronomically large assets in PV+EUR (trillions).
    - Visual cliffs at relocation / retirement.

- **Why it was wrong**
  - The plan *does* call for asset‑country PV, but it must be introduced with
    clear, tested semantics and consistent FX treatment, not as a quick swap
    of factors in a complex aggregate.
  - The relationship between nominal and PV must stay monotonic:
    `PV <= nominal` for positive inflation, and changes must be explainable.

- **What to do differently**
  - Start from the existing, passing PV layer and:
    1. Add **one new PV field** or **one asset type** at a time with
       asset‑country semantics.
    2. Add a targeted core test that compares:
       - `nominal` vs `PV` for that asset around relocations.
       - `worth` vs sum of components.
    3. Only then, propagate to charts/tables.
  - Keep `worthPV` composition **explicit** (sum of PV components), and assert
    that in tests instead of inferring deflators from ratios.

### 2.2 Real‑Estate Nominal Growth (`RealEstate.js`)

- **What changed**
  - Adjusted `Property.getValue()` to:
    - Honour explicit `Rate` on the `R` event.
    - Otherwise derive an implicit appreciation rate via
      `InflationService.resolveInflationRate(assetCountry, currentYear, …)`
      where `assetCountry` is `linkedCountry` → `StartCountry` → fallback.

- **This was actually a good change**, but:
  - It must be **kept independent** of PV/FX work and validated in isolation
    (e.g., via a dedicated real‑estate test) before entangling it with
    multi‑country PV semantics.
  - Rolling multiple conceptual changes together (nominal growth + PV +
    FX + charts) made it hard to see that this part was correct while others
    were not.

### 2.3 Chart/FX Logic (`ChartManager.js`)

- **What went wrong**
  - Added `_resolveSourceCountryForField(age, field, rowCountry)` and used it
    to vary the FX source country per field:
    - Treat funds/shares as StartCountry/EUR assets.
    - Treat everything else as row‑country assets.
  - Mixed that with PV mode’s “use start‑year FX” rule and state‑pension
    special‑cases.
  - Introduced a bug (`sourceCurrency` undefined in dynamic block), which:
    - Triggered `ChartManager.updateChartsRow error` and left charts blank.
  - Later, I tried to back out parts of this and ended up oscillating between
    behaviours instead of restoring the **original, known‑good** logic.

- **Why it was wrong**
  - The multi‑country assets plan explicitly says:
    - PV is computed in the core.
    - Charts **use the `*PV` fields** and then apply nominal FX.  
    - Per‑asset FX source countries are a *later phase*.
  - I pulled that “later phase” into this pass, without:
    - A clear UX requirement.
    - Matching tests / baselines.
    - A toggle or scoped experiment flag.

- **What to do differently**
  - For the next attempt:
    - Keep `ChartManager` as thin as possible: read `*PV` fields, then call
      `EconomicData.convert` once per row using **row country**.
    - Do **not** introduce per‑asset FX in charts until:
      1. Core nominal + PV semantics are stable and tested.
      2. There is an explicit design for per‑asset FX (with tests).
    - Any new UI logic should be guarded by tests (e.g. Jest chart tests)
      and manual demos checked **before** touching index.html or core files.

### 2.4 Data Table Currency Logic (`TableManager.js`)

- **What went wrong**
  - Mirrored the per‑field FX behaviour from charts into the data table
    export path, via `_resolveSourceCountryForField`.
  - This made the unified EUR table disagree with both:
    - The original behaviour.
    - The core `TestChartValues` expectations.
  - In one iteration, export showed near‑zero EUR assets after relocation
    (because everything was converted using AR→EUR from already‑converted
    nominal values).

- **What to do differently**
  - Treat the data table as a **diagnostic view**:
    - It should always reflect the same values the charts use, not a new
      interpretation.
  - Keep unified‑mode logic simple:
    - Use row country → reporting currency via evolution FX.
    - Avoid any per‑field heuristics unless there is a strong, tested reason.

### 2.5 Index HTML / Loader Errors

- **What went wrong**
  - While trying to “fix” the blank charts, I added a second
    `<script src="/src/core/Simulator.js">` after `</html>`.
  - This caused: `SyntaxError: Identifier 'Phases' has already been declared`
    and broke the core completely for a while.

- **What to do differently**
  - Never add or move core script tags in `ifs/index.html` unless:
    - There is a clear, documented need (e.g. new core file).
    - It is done once, with a diff that is small and easy to revert.
  - If a loader error appears (`Identifier … already declared`), the first
    action should be to:
    - Search for duplicate `<script>` tags for that file.
    - Fix the duplication **before** changing any JS logic.

---

## 3. Process / Workflow Lessons

1. **Work in thin, vertical slices**
   - Example sequence for the next attempt:
     1. Add a helper in `Simulator` to compute a deflator for an arbitrary
        country; test it.
     2. Apply it only to **one asset type’s PV** (e.g. property) and add a
        targeted test around relocation.
     3. Wire that PV into charts/tables, ensuring:
        - Nominal results are unchanged.
        - PV results have an explainable, bounded change.

2. **Use existing tests and demo3 as guardrails**
   - Run:
     - `./run-tests.sh TestChartValues ChartManagerPresentValue`
     - Any new core tests specific to PV / real‑estate / relocation.
   - Manually re‑check `demo3.csv` (both nominal + PV, natural + EUR) after
     each meaningful change.

3. **Always watch the browser console**
   - Any error from `ChartManager`, `TableManager`, or duplicate identifiers
     is a sign that the issue is structural, not just numeric.
   - Fix those loader/runtime errors first before reasoning about chart shape.

4. **Minimise UI rewrites**
   - The plan’s core goal is PV semantics in the engine. The UI should:
     - Show nominal or PV values from the core.
     - Apply FX for unified views.
   - Only refine UI behaviour (per‑asset FX, tooltips, etc.) *after* the
     engine is correct and stable.

5. **Communicate scope clearly**
   - When a change veers outside the plan (e.g. per‑asset FX, index.html
     edits), call that out explicitly and either:
     - Park it for a future phase, or
     - Gate it behind a clearly documented rationale and tests.

---

## 4. Recommended Fresh-Start Approach

When the repo is reset to a clean state and a new session starts:

1. **Confirm starting point**
   - Run `./run-tests.sh TestChartValues ChartManagerPresentValue TestCorePresentValueLayer`.
   - Manually check demo3 in:
     - Nominal + EUR
     - PV + EUR
     to have a clear mental picture of “good” behaviour.

2. **Implement multi‑country assets in the core only**
   - Add a small, well‑tested helper in `Simulator` for per‑country PV
     factors.
   - Apply it to one asset type at a time (probably real estate first),
     updating only the relevant `*PV` fields.

3. **Keep UI consumption simple**
   - Charts:
     - Use `*PV` fields.
     - Use row‑country → reporting‑currency FX (evolution mode).
   - Tables:
     - Display nominal or PV as provided.
     - Keep unified currency behaviour consistent with charts.

4. **Use demo3 as the sanity benchmark**
   - The assets stack in PV+EUR for demo3 should remain within the same order
     of magnitude as the pre‑change chart, with:
     - No cliffs at relocation.
     - No trillions.
     - Assets behaving intuitively relative to properties/pensions.

This document should be read **before** making any new changes along the
multi‑country assets axis, so that the next implementation can be deliberate,
incremental, and test‑driven rather than exploratory and brittle.*** End Patch ***!
