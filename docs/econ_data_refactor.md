## Economic Data Refactor Test Context

The new test suite (`TestFXConversions.js`, `TestRelocationCurrency.js`, `TestChartValues.js`) exists to guard the EconomicData overhaul through every phase. The shared goal is to capture **timeless invariants** rather than brittle formulas, so that we can refactor the FX/CPI pipeline in stages while keeping directionality, sanity ranges, and scenario “shape” intact. All three tests run against the current deterministic output and treat those numbers as the ground truth until the refactor intentionally updates them.

### TestFXConversions.js
Focuses on the raw `EconomicData.convert()` API. It asserts directional behavior (strong→weak currencies multiply, weak→strong divide), 1% round-trip idempotency, same-currency identity, sign/zero preservation, finite outputs (<1e15), and expected divergence between constant/PPP/reversion modes. It is intentionally strict on arithmetic invariants but flexible on absolute values—tolerances are relative so the test survives recalibration of FX series. Any new conversion mode or change in inflation lookup must still pass these invariants.

### TestRelocationCurrency.js
Runs a relocation scenario (IE→AR) and compares the rows surrounding the move (ages 34–36) against baselines captured from the current simulator. Instead of hard-coding “52000 EUR” etc., it checks that each nominal ledger field stays within a percentage band (5–20% depending on the year) and that attribution buckets still show IE salary/rent before the move and AR salary/rent afterward. The test is tolerant to moderate drifts introduced by future FX smoothing but fails if values blow up, flip sign, or lose the expected currency metadata. Treat it as a regression guard for “no discontinuity, no mixing,” not a demand for bitwise identical euros.

### TestChartValues.js
This test has two halves. The synthetic scenario checks general chart integrity: no NaN/Inf, no >50% YoY jumps except at relocation age, PV < nominal, and relocation continuity within 50%. The second half runs `docs/demo3.csv`, forcing deterministic (zero-volatility) growth and capturing net-worth/cash/net-income slices at ages 40/65/80 in addition to the final/max worth. A 20% baseline tolerance allows the upcoming refactor to tweak FX projections while still flagging catastrophic shifts (zero flattening, 10e15 spikes, etc.). Only update the stored baselines when we deliberately accept new deterministic output, and document why.

### Strictness vs Flexibility
* **Strict** on mathematics and direction: conversions must be finite, round trips should land within 1%, relocation should not erase or mix currencies, and chart data cannot contain giant spikes except where explicitly allowed.
* **Flexible** on exact magnitudes: most comparisons use relative tolerances (5–50%). When expected values are ~0, the tests merely require actual ≈ 0, not exact zero.
* **Baseline updates**: treat them like snapshots—only refresh when the deterministic simulator output legitimately changes (e.g., after updating FX series) and record the reason in the commit message or this doc.

Use this document as the canonical reference for why the tests exist and how to tune them without losing coverage while the EconomicData refactor proceeds.

## Current Status

- **Done:** Rebuilt `TestFXConversions.js`, `TestRelocationCurrency.js`, and `TestChartValues.js` with invariant-focused assertions and deterministic demo3 baselines. Verified `TestFXConversions` and `TestRelocationCurrency` pass with the new logic.
- **In Progress:** `TestChartValues.js` still needs a passing run after the deterministic baseline update; the test currently fails due to net-worth drift > tolerance in the demo3 regression.
- **Next Steps:** 1) finish stabilizing `TestChartValues.js` (update tolerance or reconcile the remaining drift). 2) Re-run the three custom tests together and, once green, capture the results in this doc/commit message before moving on to the next phase of the EconomicData refactor.

