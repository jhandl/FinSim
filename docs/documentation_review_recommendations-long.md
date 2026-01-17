# Documentation Review Recommendations

This document translates the findings in `docs/documentation_review_report.md` into an actionable documentation cleanup + re-organization plan.

Notes:
- The review report contains **31** “Document:” entries (not 30). The recommendations below cover all 31, plus a small number of additional paths mentioned incidentally (e.g., prompt duplicates and generated artifacts).
- Goals: (1) delete/archive what’s no longer useful, (2) remove redundancy + contradictions, (3) update what remains to match current code, (4) group docs by audience + purpose.

## 1) Proposed Documentation Structure (Target State)

Use folders that reflect *audience* and *lifecycle* (active reference vs historical plan vs report):

- `docs/README.md` (new): the entrypoint index + “where to look first”.
- `docs/architecture/`: “as-built” system docs (how the code works today).
- `docs/reference/`: stable schemas and reference material (e.g., tax rules JSON).
- `docs/testing/`: how to run/write tests; test-evaluation tooling docs live here.
- `docs/bugs/`: user-visible or architectural bugs tracked as docs (ideally mirrors GitHub issues); each doc must state current status + repro + expected fix.
- `docs/plans/active/`: plans that are still intended work.
- `docs/plans/completed/`: plans that were implemented; keep only as historical record and ensure they are clearly labeled “Completed”.
- `docs/reports/`: completion reports and one-off retrospectives with reproducible commands.
- `docs/prompts/`: content-generation prompts (NotebookLM/AI Studio/etc).
- `docs/archive/`: anything kept only for history that should not be treated as current guidance (legacy v1 notes, external feedback dumps).

If you don’t want to move files immediately, a lower-friction first step is to keep paths as-is but add a **standard header** to every doc (see section 2) and add `docs/README.md` that links to each doc under the right category.

## 2) Standards to Eliminate Drift/Contradictions

Apply these rules to every document you keep:

1) **Add a standard header** (top of file):
   - `Status:` `Active | Completed | Draft | Archived | Obsolete`
   - `Audience:` `User | Developer | Contributor | Internal`
   - `Last verified:` date + commit hash (or “unknown” until updated)
   - `Source of truth:` pointers to code files and/or tests
2) **One canonical doc per topic.** If two docs cover the same thing (e.g., economic-data v1/v2; prompts duplicated), pick one canonical location and turn the other into a stub that links to it (or delete it).
3) **Plans vs reality separation.** Plans must explicitly state whether they are implemented and link to the PR/test that validates completion.
4) **Generated artifacts are not docs.** Anything under `docs/**/results/` or similar must be labeled “generated” and excluded from “how-to” documentation (or moved out of `docs/`).
5) **Prefer tests and code pointers over prose.** When behavior is subtle (FX base year, PV deflation scope, wizard validation), the doc should link to the tests that encode the contract.

## 3) High-Value Consolidations (Reduce Redundancy)

These merges/deprecations remove the largest contradictions:

- **Economic data + FX docs:** Consolidate `docs/economic-data-v1-info.md`, `docs/economic-data-v2-plan.md`, and `docs/dynamic-fx-plan.md` into:
  - `docs/architecture/economic-data-and-fx.md` (as-built behavior + determinism requirements), and
  - `docs/plans/active/economic-data-time-series.md` (only if time-series CPI/FX ingestion is still planned).
- **Prompt docs:** Make `docs/prompts/` the canonical home, and remove duplicates (`docs/NotebookLM.md` vs `docs/prompts/NotebookLM.md`; `docs/AIStudio.md` vs `docs/AIStudio-podcast-prompt.md`).
- **Money perf docs:** Treat `docs/money-refactor-test-report.md` and `docs/money-performance-baseline.md` as *reports/contracts* that must be reproducible from `./run-tests.sh` outputs; move them under `docs/reports/` (or `docs/testing/performance/`) and update them to match the current thresholds in `tests/`.
- **Relocation + event-management docs:** Keep “as-built” docs under `docs/architecture/` and remove aspirational/roadmap language unless explicitly labeled as future work.

## 4) Per-File Recommendations (All Reported Documents)

Each entry includes: **Action** (Keep/Update/Move/Delete/Merge) and the key changes needed to meet the project goals.

### Implementation Plans

1. `docs/asset-plan.md`
   - **Action:** Update → Move to `docs/plans/completed/` (or mark as Completed in-place).
   - **Fix:** Update IE defaults (`residenceScope`, `contributionCurrencyMode`) to match `src/core/config/tax-rules-ie.json`; add “Implemented in code” links (`src/core/InvestmentTypeFactory.js`, `src/core/Simulator.js`, `src/core/PresentValueCalculator.js`); remove/flag “no defensive fallbacks” language if not true.

2. `docs/multi-country-assets-plan.md`
   - **Action:** Update → Move to `docs/plans/completed/`.
   - **Fix:** Replace `fxMode: 'constant'` language with actual evolved-FX behavior; update pension/investment PV rules to match per-pot/per-type deflation; split any remaining “future” work into a separate active plan.

3. `docs/chat-system-implementation-09fe792c.plan.md`
   - **Action:** Decide → Delete *or* move to `docs/plans/backlog/` (mark “Not implemented”).
   - **Fix (if kept):** Add a clear scope decision (in-repo Worker vs external), list required endpoints/secrets, and remove any implication it exists in the current UI.

4. `docs/feedback-form-plan.md`
   - **Action:** Decide → Delete *or* move to `docs/plans/backlog/` (mark “Not implemented”).
   - **Fix (if kept):** Update wiring assumptions to match current burger-menu plumbing; explicitly note required UI hooks/config and that nothing is implemented yet.

5. `docs/dynamic-fx-plan.md`
   - **Action:** Merge into a single economic-data/FX canonical doc; then archive this as Completed (or delete after merge).
   - **Fix:** Emphasize determinism requirement (explicit `baseYear`); align the plan text with current `EconomicData.convert()` defaults and call sites (notably `Money.convertTo(...)`).

6. `docs/multi-country-pv-fix-plan.md`
   - **Action:** Update → Move to `docs/plans/completed/`.
   - **Fix:** Mark Stages 0–4 completed, point to `tests/TestPVMultiCountryDeflation.js`, and update any stale comments in `PresentValueCalculator` referenced by the plan.

7. `docs/dynamic-sections-generalization.plan.md`
   - **Action:** Keep as Active plan → Move to `docs/plans/active/`.
   - **Fix:** Update “current state” to match Deductions-only implementation; explicitly list the next concrete steps (registry, multi-section manager, config-driven membership) and the exact current hard-coded pivots to remove.

8. `docs/economic-data-v2-plan.md`
   - **Action:** Merge into the canonical economic-data doc; then archive this plan (Completed/Partially completed).
   - **Fix:** Clarify base-year behavior and what is “ledger” vs “analytics” in today’s API; remove any statements that assume time-series CPI/FX exists if it does not.

9. `docs/monetization-plan.md`
   - **Action:** Decide → Delete *or* move to `docs/plans/backlog/` (mark “Not implemented”).
   - **Fix (if kept):** Strip vendor speculation, define an explicit gating matrix and minimal vertical slice, and clearly state “not implemented” to avoid misleading readers.

### Bug Reports

10. `docs/bug-pension-contribution-per-country.md`
   - **Action:** Keep → Update.
   - **Fix:** Split into “Fixed” vs “Still open”, update current known gaps (single-pot aggregation + lump-sum behavior), and link to the tests that should exist once fixed (or track as TODOs).

11. `docs/linkedcountry-age-change-bugs.md`
   - **Action:** Keep → Update.
   - **Fix:** Convert into an actionable bug spec: repro steps, expected vs actual, and acceptance criteria aligned to `RelocationImpactDetector.clearResolvedImpacts()` and `EventsTableManager.linkPropertyToCountry()` behavior.

12. `docs/currency-country-inference-findings.md`
   - **Action:** Keep → Update.
   - **Fix:** Add a minimal failing scenario/test outline and explicitly document the intended precedence rule: `linkedCountry` defines *country context*, `currency` defines *FX currency*; recommend aligning cache semantics to prevent overrides.

### System Descriptions (Architecture)

13. `docs/events-accordion-system.md`
   - **Action:** Keep → Rewrite as “as-built” → Move to `docs/architecture/events/accordion.md`.
   - **Fix:** Update identifiers/selectors/UX behaviors to match `EventAccordionManager` + `EventSummaryRenderer`; move aspirational accessibility/perf claims to a labeled “Future” section.

14. `docs/events-wizard-system.md`
   - **Action:** Keep → Rewrite as “as-built” → Move to `docs/architecture/events/wizard.md`.
   - **Fix:** Document actual component responsibilities (`WizardManager` vs `WizardRenderer` vs `EventsWizard`), correct YAML schema (`EventWizards:` root), and document current validation/default-value behavior (including what is unused).

15. `docs/relocation-system.md`
   - **Action:** Keep → Rewrite as “as-built” → Move to `docs/architecture/relocation.md`.
   - **Fix:** Align impact categories and resolution semantics with current detector/assistant; remove modal language; document the truth about when impacts clear (currency vs linkedCountry vs split/review), and standardize how `investmentContext` is passed.

### Reports / Reference

16. `docs/money-refactor-completion.md`
   - **Action:** Keep → Update → Move to `docs/reports/` (or `docs/testing/performance/`).
   - **Fix:** Replace placeholders with reproducible commands/outcomes and align performance claims with the real assertions in `tests/TestMoneyPerformance.js`.

17. `docs/money-architecture.md`
   - **Action:** Keep → Update → Move to `docs/architecture/money.md`.
   - **Fix:** Correct the `Money.create` (struct) vs `Money` instance distinction; align error-handling semantics; call out the `baseYear` determinism risk explicitly.

18. `docs/economic-data-v1-info.md`
   - **Action:** Archive or rewrite.
   - **Option A (preferred):** Move to `docs/archive/economic-data-v1.md` and mark Obsolete/Superseded.
   - **Option B:** Rewrite into `docs/architecture/economic-data-and-fx.md` and remove any claims about time-series CPI/FX until implemented.

19. `docs/tax-rules-reference.md`
   - **Action:** Keep → Update → Move to `docs/reference/tax-rules-json.md`.
   - **Fix:** Update `investmentTypes` section to match current rules and consuming code; add a “field optionality” section that reflects `tax-rules-us.json`; clarify `economicData.inflation.cpi` semantics and versioning convention.

20. `docs/economic-data-v1-feedback.txt`
   - **Action:** Archive (keep for provenance).
   - **Fix:** Move to `docs/archive/external-reviews/economic-data-v1-feedback.txt` (or convert to `.md` with a 1-page summary) and add a short header explaining why it’s kept and which recommendations were adopted vs rejected.

### Test Documentation

21. `docs/test-evaluation/README.md`
   - **Action:** Keep → Update → Move to `docs/testing/test-evaluation/README.md` (or keep path but add an index under `docs/testing/`).
   - **Fix:** Make scope explicit (core vs Jest vs Playwright), fix output paths/examples, and either correct or remove “parallel” language unless concurrency exists.

22. `docs/test-evaluation/tier1-individual-quality.md`
   - **Action:** Keep → Update.
   - **Fix:** Add guidance for test archetypes (scenario vs regression vs stochastic vs perf vs UI/e2e) so the rubric matches the suite’s reality.

23. `docs/test-evaluation/tier2-metadata-extraction.md`
   - **Action:** Keep → Update.
   - **Fix:** Make the schema valid JSON types, add `testType`, and update examples to include US + relocation currency metadata + dynamic investment types.

24. `docs/test-evaluation/tier3-battery-analysis.md`
   - **Action:** Keep → Update.
   - **Fix:** Make it state evaluation scope explicitly and adjust the prompt to handle non-scenario tests (if Jest remains included).

25. `docs/econ_data_refactor.md`
   - **Action:** Keep → Update → Move to `docs/testing/core/economic-data-refactor.md` (or `docs/testing/economic-data.md`).
   - **Fix:** Update status section (notably `TestChartValues` passing) and add a prominent determinism note about `baseYear`.

26. `docs/money-refactor-test-report.md`
   - **Action:** Keep → Update → Move to `docs/reports/` (or `docs/testing/performance/`).
   - **Fix:** Replace placeholders with exact `./run-tests.sh` commands + totals + environment metadata; make Monte Carlo perf a concrete pass/fail contract if intended.

27. `docs/money-performance-baseline.md`
   - **Action:** Keep → Update → Move to `docs/testing/performance/money-performance-baseline.md`.
   - **Fix:** Distinguish “test-enforced thresholds” vs “machine snapshots”; add capture metadata and optionally store JSON baselines under `docs/baselines/` for diffing.

28. `docs/frontend-testing.md`
   - **Action:** Keep → Update → Move to `docs/testing/e2e/frontend-testing.md`.
   - **Fix:** Align runner instructions with `run-tests.sh`, prefer Playwright `baseURL` and shared helpers, document spec discovery scope, and reframe fixed sleeps as last resort.

### External Tool Notes (Prompts)

29. `docs/AIStudio.md`
   - **Action:** Delete or convert into a stub; canonicalize under `docs/prompts/`.
   - **Fix:** Since the content is a prompt (not tooling integration), either:
     - Move/rename it to `docs/prompts/AIStudio-podcast-prompt.md` (and delete `docs/AIStudio.md`), or
     - If `docs/AIStudio-podcast-prompt.md` already exists, delete `docs/AIStudio.md` and ensure the prompt has a short “how to use” header.

30. `docs/NotebookLM.md`
   - **Action:** Delete or convert into a stub; canonicalize under `docs/prompts/NotebookLM.md`.
   - **Fix:** Remove duplication with `docs/prompts/NotebookLM.md` by picking one canonical file; add “inputs/outputs/where to store transcript/audio” guidance; align naming (“FinSim” vs “Ireland Financial Simulator”) with landing-page copy.

### Lessons & Retrospectives

31. `docs/lessons-learned.md`
   - **Action:** Keep → Update → Move to `docs/reports/retrospectives/multi-country-lessons-learned.md` (or similar).
   - **Fix:** Add a short “change checklist” pointing to the canonical tests (`TestChartValues`, PV relocation tests, FX conversion tests) and the preferred manual sanity checks (e.g., `docs/demo3.csv` views).

## 5) Additional Paths Mentioned (Non-Document Entries)

These are referenced in the report but not listed as “Document:” entries; handle them to eliminate redundancy:

- `docs/prompts/NotebookLM.md`: make this the canonical NotebookLM prompt location (see item 30).
- `docs/AIStudio-podcast-prompt.md`: if this file already exists, make it canonical and delete/replace `docs/AIStudio.md` (see item 29).
- `docs/test-evaluation/results/all-metadata.json` and other `docs/test-evaluation/results/**` artifacts: mark as generated (add a short `README.md` in that folder) or move out of `docs/` so they don’t pollute “documentation” navigation.

