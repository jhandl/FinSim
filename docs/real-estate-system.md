# Real Estate System Documentation

## Overview

The real estate system models property ownership, mortgages, and sales as first-class simulation events. It supports forward mortgages, overpayment and payoff schedules, reverse mortgages with interest accrual, rental income, and property gains tax with primary-residence rules. Properties are multi-currency aware and remain tied to their asset country for inflation and tax calculations.

## Event Model

Real estate is represented by a set of event types that share a common property identifier (`event.id`):

- **`R` (Property Purchase/Sale)**: Purchases occur at `fromAge`; if `toAge` is set, a sale is processed at that age.
- **`M` (Mortgage)**: Defines a forward mortgage (term, rate, payment). Created alongside a purchase when financing is chosen.
- **`MO` (Mortgage Overpay)**: Extra principal paid per year during a period.
- **`MP` (Mortgage Payoff)**: One-off payoff at a specific age.
- **`MR` (Reverse Mortgage)**: Yearly cash payout with an interest rate, accruing against property equity.
- **`RI` (Rental Income)**: Rental cash flow linked to the property.

Each property must have a unique name; mortgage, overpay, payoff, reverse, and rental events link by that name.

## Core Engine

`src/core/RealEstate.js` implements `RealEstate` and `Property`:

- **Single-currency invariant**: All monetary fields for a property must share the same currency and country.
- **Purchase basis**: Tracks paid + borrowed amounts to calculate gain basis.
- **Appreciation**: Uses an explicit rate when provided; otherwise resolves inflation from the asset’s country.
- **Amortization**: Computes remaining principal and monthly payments from term, rate, and payment.
- **Reverse mortgage**: Tracks balance and interest accrual, capped by property equity.

## Mortgage Mechanics

- **Forward mortgage setup**: `M` events calculate implied principal from term, rate, and payment.
- **Overpay**: `MO` reduces remaining principal and resets the remaining term to months left.
- **Payoff**: `MP` settles the remaining balance at `fromAge`.
- **Implicit payoff**: If a mortgage ends without an explicit payoff event, the remaining balance is settled at `M.toAge`.

## Reverse Mortgages

Reverse mortgage payouts are limited by available equity:

- **Headroom** is calculated as gross market value minus current reverse balance.
- **Payouts** are capped to headroom and accrue interest each year.
- **Sale payoff** settles forward and reverse balances, with any reverse write-off recorded when sale proceeds are insufficient.

## Sales, Gains, and Tax

When a property is sold:

- **Sale breakdown** computes gross value, forward payoff, reverse payoff, reverse write-off, and net proceeds.
- **Property gains** are declared through `Taxman.declarePropertyGain()` using the active ruleset’s `propertyGainsTax`.
- **Primary residence proportion** is derived from residency timelines and rental periods, enabling proportional exemptions.

Reverse mortgage payouts are classified by `realEstate.reverseMortgage.payoutTaxTreatment` in the active tax ruleset.

## Currency and Relocation

- **Property currency** is derived from purchase/mortgage setup and stored in `Money` instances.
- **Linked country** drives inflation and tax source-country logic.
- **Relocation** keeps property and mortgage flows in their native currency where possible, with conversion applied to net residence-currency flows.

## UI and Wizards

The web UI provides dedicated wizards for:

- Property purchase (cash vs mortgage financing).
- Mortgage overpay and payoff schedules.
- Reverse mortgages.

Validation ensures unique property names and consistent linking across `R`, `M`, `MO`, `MP`, `MR`, and `RI` events.

## Relevant Files

- Core engine: `src/core/RealEstate.js`, `src/core/Simulator.js`
- Tax hooks: `src/core/Taxman.js`, `src/core/TaxRuleSet.js`
- UI events: `src/frontend/web/components/EventsTableManager.js`, `src/frontend/web/components/EventAccordionManager.js`
- Wizards: `src/frontend/web/components/EventsWizard.js`, `src/frontend/web/assets/events-wizard.yml`
- Tests: `tests/TestMortgageAmortization.js`, `tests/TestMortgageOverpayShortensTerm.js`, `tests/TestReverseMortgageCapAndAccrual.js`, `tests/TestPropertySaleTaxation.js`
