# Confidence Tests Guide

## 1. Purpose

Confidence tests provide independently-verifiable proof that the simulator produces correct numbers. Every expected value is derived from first principles using the toy ruleset math, never copied from simulator output.

## 2. Test Layers

| Layer | Name | What it tests | Harness |
|---|---|---|---|
| A | Invariant | Pure math, no simulator loop (e.g. cash conservation, NaN guard) | `isCustomTest: true`, manual assertions |
| B | Component | Single subsystem in isolation (e.g. `Taxman` rates, event cashflow) | `isCustomTest: true`, 1-year micro-scenario |
| C | Integration | Cross-subsystem seams (e.g. FX + tax, couple mode + relocation) | `isCustomTest: true`, 1–3 year micro-scenario |

All three layers use the same `isCustomTest: true` pattern; the distinction is conceptual (scope of what is exercised), not mechanical.

## 3. File Naming Convention

Naming rules:

- Files are named `ConfidenceTest<Section>_<ID>.js` — e.g. `ConfidenceTestB_SI.js`, `ConfidenceTestD_TaxFlatRate.js`.
- Section letters map to catalog sections: `A` = invariants, `B` = event semantics, `C` = FX/PV, `D` = single-country tax, `E` = cross-border tax, `F` = investments, `G` = pensions, `H` = serialization, `I` = couple mode.
- The `name` field inside the module uses a stable ID string like `'C_B-SI'` or `'C_D-IT-FLAT'` — this is what appears in test output.
- The `category` field is always `'confidence'`.

## 4. Toy Countries

The three toy countries defined in `tests/helpers/CoreConfidenceFixtures.js`:

| Field | `aa` (TOY_AA) | `bb` (TOY_BB) | `cc` (TOY_CC) |
|---|---|---|---|
| Currency | `AAA` | `BBB` | `CCC` |
| Income Tax | 10% flat | 15% flat | 20% flat |
| Social Contribution | 5% flat | 3% flat | 8% flat |
| CGT rate | 20%, exemption 1000 | 25%, exemption 500 | 30%, no exemption |
| Exit Tax | 40% | 35% | 30% |
| FX (per EUR) | 1.0 | 2.0 | 3.0 |
| PPP | 1.0 | 2.0 | 3.0 |
| Inflation | 0% | 0% | 0% |
| Pension system | `mixed` | `mixed` | `none` |
| Tax basis | `worldwide` | `worldwide` | `domestic` |
| Post-emigration tail | 0 years | 0 years | 0 years |

Two pre-built rule maps:

- `TOY_RULES_TREATY` = `{ aa, bb }` — AA and BB have a treaty (`TREATY_PAIRS = [['aa','bb']]`).
- `TOY_RULES_NO_TREATY` = `{ aa, cc }` — AA and CC have no treaty.

FX arithmetic: since AA is 1.0/EUR and BB is 2.0/EUR, 1 AAA = 2 BBB (or 1 BBB = 0.5 AAA). Since CC is 3.0/EUR, 1 AAA = 3 CCC.

## 5. The Math Contract

Core rule: every numeric assertion must be derivable by hand from the toy ruleset, with the derivation written as a comment in the test. Pattern used in every test:

```
// IT = 10,000 * 0.10 = 1,000
// SC = 10,000 * 0.05 = 500
// Net income = 10,000 - 1,000 - 500 = 8,500
```

Do not run the simulator and copy its output into assertions. If you cannot compute the expected value by hand with the chosen toy rules, redesign the test until you can.

## 5.1 Non-Negotiable: No Output-Fitting Ever

This section is mandatory for all confidence tests.

- Confidence tests are **oracle tests**, not regression snapshots.
- The simulator is the **system under test**, never the source of truth.
- You must **never**:
  - run the simulator,
  - read its numeric output,
  - then edit expected values to make the test pass.

If you do that, the test is invalid and must be rewritten.

Hard acceptance criteria for each confidence test:

1. Every asserted number has a comment showing hand math from toy rules, including the toy ruleset values used.
2. The comment must stand on its own (a human can verify with a calculator).
3. If expected values are hard to derive, simplify the scenario until derivation is trivial.
4. If behavior depends on timing/order, document the timing assumption explicitly in comments.
5. If no clean derivation is possible, delete/redesign the test. Do not “tune” the expected value.

Code-review rejection rules (automatic fail):

- “Adjusted expected from X to Y because simulator changed.”
- “Updated tolerance/expected to match current output.”
- Any assertion without derivation comments.

Required remediation when this rule is violated:

1. Revert fitted assertions.
2. Re-derive from first principles.
3. Add derivation comments above each assertion.
4. Re-run the confidence suite.

## 6. The `microParams` Helper

`microParams(overrides)` is defined in `tests/helpers/CoreConfidenceFixtures.js`. Defaults:

- `startingAge: 30`, `targetAge: 32`, `retirementAge: 65`
- All initial balances zero
- All growth rates and volatilities zero
- `simulation_mode: 'single'`, `economy_mode: 'deterministic'`
- `StartCountry: 'aa'`, `fxMode: 'constant'`
- `inflation: 0`

Overrides are merged with `Object.assign`. Common overrides: `targetAge`, `simulation_mode: 'couple'`, `relocationEnabled: true`, `initialShares`, `fxMode`.

## 7. Writing a Confidence Test — Step by Step

Anatomy of a complete test file (pattern used in `ConfidenceTestB_SI.js` and `ConfidenceTestD_TaxFlatRate.js`):

1. Require `TestFramework` from `src/core/TestFramework.js` and the needed fixtures from `tests/helpers/CoreConfidenceFixtures.js`.
2. Export an object with `name`, `description`, `category: 'confidence'`, `isCustomTest: true`, and `async runCustomTest()`.
3. Build params with `microParams(overrides)`.
4. Build events as a plain array of objects with `type`, `id`, `amount`, `fromAge`, `toAge`, and any relocation fields (`currency`, `linkedCountry`).
5. Construct a `scenarioDef` with `name`, `scenario: { parameters, events }`, and `assertions: []` (assertions are done manually, not via the framework's assertion engine).
6. Instantiate `new TestFramework()`, call `framework.loadScenario(scenarioDef)`, then `installTestTaxRules(framework, { aa: TOY_AA })`.
7. Run `await framework.runSimulation()`.
8. Assert by finding the relevant row in `results.dataSheet` with `.find(r => r && r.age === N)` and comparing fields with `Math.abs(actual - expected) > tolerance`.
9. Return `{ success: errors.length === 0, errors }`.

## 8. Accessing Internal State via VM

Some tests inspect state not surfaced in `dataSheet` — e.g. attribution maps or tax totals. Use `vm.runInContext(expr, framework.simulationContext)` after the simulation has run. Common patterns:

- `revenue.taxTotals` — object keyed by tax type and country (e.g. `incomeTax:cc`).
- `revenue.getAllTaxesTotal()` — sum of all taxes in residence currency.
- `revenue.attributionManager.yearlyAttributions` — object keyed by `'tax:<type>:<country>'`, each with a `slices` sub-object.

`framework.simulationContext` is the live VM sandbox and is only valid after `loadScenario` + `installTestTaxRules` have been called (they both write into it).

## 9. Injecting Toy Rules — How `installTestTaxRules` Works

`installTestTaxRules(framework, rulesByCode)` (from `tests/helpers/RelocationTestHelpers.js`) does the following:

- Writes the rule map into `framework.simulationContext.__testTaxRules`.
- Monkey-patches `Config.prototype.getTaxRuleSet`, `getCachedTaxRuleSet`, `getCountryMap`, `listCachedRuleSets`, and `syncTaxRuleSetsWithEvents` inside the VM so they serve toy rules instead of loading real JSON files.
- Must be called after `framework.loadScenario()` (which initializes the VM context) and before `framework.runSimulation()`.

`installTreatyPairs(framework, TREATY_PAIRS)` from `CoreConfidenceFixtures.js` patches `Config.prototype.getGlobalTaxRules` to inject the treaty list, enabling the cross-border credit path.

## 10. Key `dataSheet` Fields

Most-used fields asserted in confidence tests:

| Field | Meaning |
|---|---|
| `age` | Simulation year (used to find the right row) |
| `incomeSalaries` | Total gross salary income for the year |
| `netIncome` | After-tax take-home income |
| `pensionContribution` | Employee pension contribution |
| `pensionFund` | Pension pot balance at year end |
| `cash` | Cash balance at year end |
| `Tax__incomeTax` | Income tax paid (residence country) |
| `Tax__sc` | Social contribution paid (tax IDs are normalized to lowercase) |
| `taxByKey` | Per-type tax breakdown (e.g. `capitalGains:aa`) |

## 11. Running Confidence Tests

Commands:

- `./run-tests.sh -t confidence` — runs all `ConfidenceTest*.js` files.
- `./run-tests.sh ConfidenceTestB_SI` — runs a single confidence test by name.
- `./run-tests.sh -t fast` — runs all fast-eligible tests (confidence tests are included unless tagged slow).

`// @finsim-test-speed: slow` tag: add it near the top of any confidence test that takes more than ~2.5 s (e.g. multi-year Monte Carlo scenarios). The `fast` gate target is < 10 s total for the untagged set. Use `./run-tests.sh --classify-fast` to auto-tag based on measured timing.

## 12. Adding a New Confidence Test

Checklist:

1. Pick the right section letter from the catalog.
2. Name the file `ConfidenceTestX_<ShortID>.js`.
3. Choose the minimal toy ruleset (usually just `{ aa: TOY_AA }`).
4. Write the hand-derived expected values as comments before the assertions.
5. Keep the scenario to 1–3 years and 0–3 events.
6. Run `./run-tests.sh ConfidenceTestX_<ShortID>` to verify it passes.
7. If it takes > 2.5 s, add `// @finsim-test-speed: slow` near the top.
