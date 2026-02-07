# Relocation System

## Scope
Relocation allows multi-country scenarios with runtime residency changes (`MV-*` events), currency-aware events, and cross-border tax handling.

Core event fields used by relocation:
- `currency`: amount denomination for the event
- `linkedCountry`: country tie for inflation/source-country behavior
- `linkedEventId`: split-chain linkage for boundary resolutions

## Resolution Actions
Relocation impacts are detected by `RelocationImpactDetector` and resolved through `RelocationImpactAssistant` + `EventsTableManager`.

Supported actions include:
- `Split Event`: split boundary-crossing events at relocation age
- `Keep Original Currency` (`peg`): preserve original event currency
- `Link To Country` (property): set `linkedCountry`, update property/mortgage pair country context
- `Link To Country` (salary/pension): set `linkedCountry` for source-country taxation without PPP conversion
- `Mark As Reviewed`: store explicit resolution override

For salary/pension link actions, `EventsTableManager.linkIncomeToCountry(rowId, country)` sets `event.linkedCountry` and re-runs impact detection.

## Source-Country Taxation
### Salary
`Simulator.processEvents()` determines salary source country as:
- `event.linkedCountry` when present
- otherwise the salary bucket country

Salary attribution uses:
- domestic: `incomesalaries`
- foreign source: `incomesalaries:<country>`

### Private Pension Income
`Simulator.calculatePensionIncome()` records per-country pension attribution using pension-pot country:
- domestic: `incomeprivatepension`
- foreign source: `incomeprivatepension:<country>`

## Foreign Tax Credits
`Taxman.computeIT()` computes source-country income tax for foreign salary/private pension attribution buckets and records:
- `tax:incomeTax:<country>`

Residence-country income tax is computed normally, then foreign tax credits are applied when treaty conditions are met (`TaxRuleSet.hasTreatyWith`).

Credit behavior:
- treaty exists: credit capped by residence-country income tax (`applyForeignTaxCredit`)
- no treaty: no credit (double taxation remains)

Country-level credit attribution is recorded under:
- `tax:incomeTax:<country>` with `Foreign Tax Credit (<COUNTRY>)`

## Attribution Keys
Common relocation tax keys:
- `incomesalaries:<country>`
- `incomeprivatepension:<country>`
- `tax:incomeTax:<country>`
- `tax:incomeTax` (residence-country bucket, includes aggregate credit line)
