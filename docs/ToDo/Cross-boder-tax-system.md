## Cross-Border Tax System

## Scope

This document describes the current implemented cross-border taxation behavior for investment income and gains.

## Implemented Rules

- Residence country is the active country for the tax year.
- Investment source country is taken from `assetCountry` on the investment type/asset.
- Cross-border withholding is applied only when `assetCountry` differs from residence country.
- Residence-country taxation is still applied by that country's own rules.
- `taxBasis: "worldwide"` includes foreign-source investment flows.
- `taxBasis: "domestic"` excludes foreign-source investment flows from residence tax base.
- Foreign tax credits are applied only when a treaty exists.
- Credit amount is capped at `min(foreign tax paid, residence tax liability)`.

## Configuration Sources

- `src/core/config/tax-rules-global.json` (global source-tax and treaty metadata)
- `src/core/config/tax-rules-ie.json`
- `src/core/config/tax-rules-us.json`
- `src/core/config/tax-rules-ar.json`

## Runtime Flow

1. Investment declarations call `Taxman.declareInvestmentIncome()` and `Taxman.declareInvestmentGains()` with `assetCountry`.
2. `Taxman` computes withholding via `getWithholdingTax()` from global `assetTaxes`.
3. Withholding is materialized during `computeTaxes()`.
4. Residence income tax and capital gains tax are computed under the active residence ruleset.
5. If treaty credits are available, `applyForeignTaxCredit()` reduces residence tax totals.

## Attribution Behavior

Residence and source tax effects are visible via attribution metrics:

- `tax:incomeTax`
- `tax:capitalGains`
- `tax:withholding`
- `tax:withholding:<country>` (example: `tax:withholding:us`)
- negative entries in residence buckets using source label `Foreign Tax Credit`
- country-suffixed foreign tax credit attribution in matching residence buckets (examples: `tax:incomeTax:us`, `tax:capitalGains:us`) with labels like `Foreign Tax Credit (US)`

## Key Files

- `src/core/Taxman.js`
- `src/core/InvestmentAsset.js`
- `src/core/Simulator.js`
- `src/core/AttributionManager.js`

## Test Coverage

Cross-border investment behavior is covered in:

- `tests/TestCrossBorderInvestmentTaxation.js`

Covered scenarios:

- foreign investment with treaty
- foreign investment without treaty
- domestic investment backward compatibility
- mixed domestic/foreign portfolio
- domestic tax-basis filtering
- relocation/timeline residence changes
- no-relocation activation with foreign assets
