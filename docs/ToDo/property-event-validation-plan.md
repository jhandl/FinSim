# Property and Relocation Consistency Validation Plan

## Scope

Event types and relocation metadata in scope:

- `R`: Property purchase/sale
- `M`: Mortgage
- `MO`: Mortgage overpayment
- `MP`: Mortgage payoff
- `MR`: Reverse mortgage
- `RI`: Rental income
- `MV`: Relocation
- relocation metadata: `linkedCountry`, `currency`, split markers, sale markers, relocation rental markers

## Coverage Rules

- Every row in this document must map to one validation rule (implemented or planned).
- Every blocking inconsistency must have one clear user-facing warning.
- Every matrix row must have at least one automated test case once implemented.
- Use user language in warnings (no internal code names).

## Consistency Matrix

| ID | Scenario | Inconsistent condition | Warning message (user-facing) | Field to highlight | Severity |
| --- | --- | --- | --- | --- | --- |
| P01 | Duplicate property purchase name | more than one purchase event has the same property name | There are multiple property purchase events with this name. Keep exactly one. | `name` (`R`) | Error |
| P02 | Property ages inverted | `R.toAge < R.fromAge` | Property sale age cannot be earlier than purchase age. | `toAge` (`R`) | Error |
| P03 | Mortgage without property | `M` exists and matching `R` count is `0` | No property purchase event was found for this property. | `name` (`M`) | Error |
| P04 | Mortgage starts before purchase age | `M.fromAge < R.fromAge` | The mortgage must start at or after the purchase age. | `fromAge` (`M`) | Error |
| P05 | Mortgage continues after property sale | `M.toAge > R.toAge` | The mortgage end age cannot be later than the property sale age. | `toAge` (`M`) | Error |
| P06 | Multiple mortgages | count of `M` for property is `> 1` | Only one mortgage event is allowed for this property. | `name` (`M`) | Error |
| P07 | Mortgage ages inverted | `M.toAge < M.fromAge` | Mortgage end age cannot be earlier than mortgage start age. | `toAge` (`M`) | Error |
| P08 | Mortgage overpayment without mortgage | matching `M` count for `MO` is not `1` | A mortgage overpayment requires exactly one mortgage event for this property. | `name` (`MO`) | Error |
| P09 | Overpayment starts before mortgage | `MO.fromAge < M.fromAge` | Mortgage overpayment cannot start before the mortgage starts. | `fromAge` (`MO`) | Error |
| P10 | Overpayment beyond mortgage | `MO.toAge > M.toAge` | Mortgage overpayment cannot extend beyond the mortgage end age. | `toAge` (`MO`) | Error |
| P11 | Overpayment ages inverted | `MO.toAge < MO.fromAge` | Mortgage overpayment end age cannot be earlier than start age. | `toAge` (`MO`) | Error |
| P12 | Payoff without mortgage | matching `M` count for `MP` is not `1` | A mortgage payoff requires exactly one mortgage event for this property. | `name` (`MP`) | Error |
| P13 | Payoff age not aligned | `MP.fromAge != M.toAge` | The mortgage payoff age must match the mortgage end age. | `fromAge` (`MP`) | Error |
| P14 | Multiple payoffs | count of `MP` for property is `> 1` | Only one mortgage payoff event is allowed for this property. | `name` (`MP`) | Error |
| P15 | Manual payoff amount inconsistent | payoff amount is manually overridden and does not match remaining balance at payoff age | Mortgage payoff amount does not match the remaining mortgage balance at the payoff age. | `amount` (`MP`) | Warning |
| P16 | Reverse mortgage without property | matching `R` count for `MR` is not `1` | A reverse mortgage requires exactly one property purchase event for this property. | `name` (`MR`) | Error |
| P17 | Reverse mortgage before purchase | `MR.fromAge < R.fromAge` | Reverse mortgage cannot start before the property is purchased. | `fromAge` (`MR`) | Error |
| P18 | Reverse mortgage beyond sale | `MR.toAge > R.toAge` | Reverse mortgage cannot extend beyond the property sale age. | `toAge` (`MR`) | Error |
| P19 | Forward and reverse overlap | `[M.fromAge..M.toAge]` overlaps `[MR.fromAge..MR.toAge]` | Reverse mortgage starts before the regular mortgage is fully paid off. | `fromAge` (`MR`) | Error |
| P20 | Overlapping reverse mortgages | more than one `MR` for the property is active at the same age | This property has overlapping reverse mortgage events. Keep only one active reverse mortgage at a time. | overlapping reverse mortgage rows | Error |
| P21 | Rental income without property | matching `R` count for `RI` is `0` | No property event was found for this rental income entry. | `name` (`RI`) | Error |
| P22 | Rental starts before purchase | `RI.fromAge < R.fromAge` | Rental income cannot start before the property is purchased. | `fromAge` (`RI`) | Error |
| P23 | Rental continues after property sale | `RI.toAge > R.toAge` when `RI.toAge` is set | Rental income cannot extend beyond the property sale age. | `toAge` (`RI`) | Error |
| P24 | Overlapping rental events | more than one `RI` for the property is active at the same age | This property has overlapping rental income events. Keep only one active rental period at a time. | overlapping rental rows | Error |
| P25 | Rental ages inverted | `RI.toAge < RI.fromAge` | Rental income end age cannot be earlier than start age. | `toAge` (`RI`) | Error |
| P26 | Overpayment clipped by manual payoff edit | manual payoff age update leaves `MO.toAge > MP.age` | Mortgage overpayment cannot extend beyond the mortgage end age. | `toAge` (`MO`) | Error |
| P27 | Relocation missing destination | relocation destination country is empty | Select a destination country for this relocation. | relocation destination | Error |
| P28 | Relocation age missing/invalid | relocation start age is empty or invalid | Enter a valid relocation age. | `fromAge` (`MV`) | Error |
| P29 | Multiple relocations at same age | more than one relocation has the same age | There are multiple relocations at the same age. Keep one relocation per age. | `fromAge` (`MV`) | Error |
| P30 | No-op relocation | destination equals country already active before the move | This relocation keeps you in the same country and has no effect. Remove it or pick a different destination. | relocation destination | Warning |
| P31 | Relocation before simulation start | relocation age is before current age/start age | This relocation happens before the simulation starts. Move it into the simulation horizon or remove it. | `fromAge` (`MV`) | Warning |
| P32 | Relocation after simulation horizon | relocation age is after target age | This relocation is outside the simulation horizon and has no effect. | `fromAge` (`MV`) | Warning |
| P33 | Rent-out rental country mismatch | rental linked country/currency does not match property jurisdiction after relocation decision | Rental income country/currency does not match the property jurisdiction. | rental row country/currency | Error |

## Notes

- None of these rules use or interact with the Relocation-impact badges remain.
- All consistency issues surface as standard yellow validation warnings which is available in the current codebase.
- All rules marked as "Error" should be simulation blocking (same as the absense of the starting age, for example).
- Rules markes as "Warning" should not simulation blocking, they should only be shown to the user.
- A yellow validation warning is to be removed once the user has resolved the issue, potentially re-enabling the simulation if no other blocking issues remain.
- Cross-consistency rules are first-class and must be validated even when each side looks valid in isolation.
