# FinSim Economic Data and Currency Conversion: Requirements for Ledger vs Analytics Alignment

## Purpose

Align the simulator’s authoritative ledger (tax- and accounting-relevant numbers) with standard industry practice while preserving FinSim’s educational analytics. This document specifies changes to use nominal FX for the ledger and use PPP only to suggest values when splitting relocation-impacted events.

## Scope

- Switch ledger conversion to nominal FX (year-specific cross rates) across core tax/accounting flows.
- Use PPP only for suggestions in relocation event split workflows (pre-fills), not for ledger math.
- Keep current yearly net-then-convert flow consolidation behavior.

## Definitions

- Ledger: the authoritative values that feed `Taxman`, account balances, and the data sheet metrics used for tax and budgeting decisions.
- Analytics: optional displays for purchasing-power comparisons (PPP).
- Base Year: scenario-stored integer year anchoring conversions and analytics for that scenario.

## Functional Requirements

1) Ledger conversions use nominal FX
   - R1.1 The simulator must convert monetary amounts for taxation and ledger totals using nominal FX cross-rates for the specific year (i.e., `fxMode = "constant"` which already pulls year FX when available, falls back to base FX).
   - R1.2 Existing PPP and reversion modes remain available but must not be used in ledger paths.
   - R1.3 Yearly consolidation (net‑then‑convert per currency) is retained.

2) PPP only for relocation split suggestions
   - R2.1 In inline relocation resolution panels, when splitting boundary-crossing events, compute and pre-fill suggested amounts for the destination segment using PPP-based cross-country adjustments.
   