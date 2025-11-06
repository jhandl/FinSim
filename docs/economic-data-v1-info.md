## Economic Data Time Series: Year-by-Year Usage

### Overview
FinSim embeds per‑country economic profiles in the tax rules. Each profile includes:
- Inflation (CPI)
- Purchasing Power Parity (PPP)
- Foreign Exchange (FX)

These are provided as year‑indexed time series (when available) and normalized at startup so the simulator can query a value for any simulation year. The simulator also keeps a configurable base year (the simulation start) to ensure coherent conversions across the full run.

### Data definitions and units
- **CPI (inflation)**: year‑over‑year percentage rate for the consumer price index; units are percent (e.g., 3.1 means 3.1%). When used in formulas, CPI is converted to a decimal rate (e.g., 0.031).
- **PPP**: price‑level ratio for relative purchasing power between countries; unitless. A PPP cross‑rate for A→B is interpreted as “units of B per 1 unit of A in PPP terms.”
- **FX**: nominal exchange rates are stored as “local units per 1 EUR.” Cross‑rates for A→B in a given year are computed as FX_B(year) / FX_A(year).
- **Series coverage**: each series declares first/last years; updates may be partial. When years are missing, lookup/projection rules below apply.
- **Base year and reproducibility**: the conversion base year is the simulation start year captured at app initialization for the session. It is used consistently across all yearly conversions in that run to ensure coherent scaling. If you start a new session in a different calendar year, the base year will reflect that session’s start.

### Year‑By‑Year Series Selection and Projection
When the simulator asks for a series value for a given year:
- If there is an exact observation for that year, it’s used.
- If the target year falls between two observations, the most recent prior value is used (step function behavior).
- If the year is earlier than the first observation, the earliest value is used.
- If the year is later than the last observation, a projection is used: a weighted average of recent years (default window of 5 years) to provide a stable forward value.

This lookup behavior is applied independently for CPI, PPP, and FX series.

Notes:
- The behavior is explicitly a step function between observations; it does not linearly interpolate.
- Forward projections beyond the last observed year use a weighted average of the last N years (default 5), emphasizing more recent observations.

### Applying Inflation to Event Amounts
For each simulation year, every event amount is adjusted for inflation using a country‑specific rate selected in this precedence order:
1. An explicit rate on the event (when provided)
2. The CPI for the event’s linked country for the current year
3. The CPI for the current residence country for the current year
4. Fallbacks from tax rules or scenario parameters when series data is not available

The selected inflation rate for the current year is then used to compound the base amount up to the current simulation year. Important nuance: the compounding assumes a single effective rate for the elapsed period rather than applying a different CPI for each historical year. This is an intentional simplification to maintain consistency and performance.

Implications and edge cases:
- Deflation (negative CPI) is allowed; compounding with a negative rate reduces amounts accordingly.
- Event currency does not affect the choice of inflation country; it affects only conversion/display. The inflation country is determined by explicit `event.rate`, then `event.linkedCountry`, then current residence country.

### Currency Conversion of Yearly Flows
Each year’s monetary flows are first aggregated by currency. For non‑residence currencies, the simulator converts the net amount into the active residence currency using the economic time series:
- Default conversion mode is PPP‑based.
- The simulation start year is used as the base year to anchor conversions.
- For the target year, if a PPP cross‑rate is available, it is used directly. If it is not available, the system falls back to an anchor (base‑year PPP or FX) and scales it by the relative CPI growth between source and target countries over the elapsed years.

Alternative supported modes include:
- Constant: use the FX cross‑rate for the specific year (falling back to the base FX when missing).
- Reversion: start from the base‑year anchor and move toward each year’s PPP target at a configured reversion speed; when PPP targets are missing for future years, they are synthesized from CPI differentials.

This approach provides coherent per‑year conversions that still behave well when parts of the series are missing or only partially populated.

#### Order of operations (per simulation year)
1. Select the inflation country for each event (precedence above), pick that year’s CPI (or fallback), and compute the inflated amount using constant‑rate compounding from base to current year.
2. Record all resulting flows into currency buckets and compute per‑currency net flows (income minus expenses) before conversion.
3. Convert each non‑residence currency net into the current residence currency using the per‑year conversion factor derived below.
4. Declare converted amounts for taxation and accounting.

#### Formulas and selection logic
Let baseYear be the session’s simulation start year, and let nYears = (targetYear − baseYear).

- **PPP mode (default)**
  - If a PPP cross‑rate exists for the target year, use it: \( fx_{A\to B}(t) = \frac{PPP_B(t)}{PPP_A(t)} \).
  - Else anchor to base PPP if available, otherwise base FX: \( anchor = PPP_{A\to B}(base) \) or \( FX_{A\to B}(base) \).
  - Scale the anchor by CPI growth differentials: \( fx_{A\to B}(t) = anchor \times \frac{(1+\pi_B)^{nYears}}{(1+\pi_A)^{nYears}} \), where \(\pi\) are headline CPI rates (decimals).

- **Constant mode**
  - Use the nominal FX cross‑rate for the target year when available: \( fx_{A\to B}(t) = \frac{FX_B(t)}{FX_A(t)} \); otherwise fall back to base FX.

- **Reversion mode**
  - Initialize \( fx_{level} = FX_{A\to B}(base) \) if available, else the base PPP anchor.
  - For each step \( \tau = 1..nYears \): target toward PPP for year \( base+\tau \) if available; when missing, synthesize \( PPP_{A\to B}(base+\tau) = anchor \times \frac{(1+\pi_B)^{\tau}}{(1+\pi_A)^{\tau}} \).
  - Update: \( fx_{level} \leftarrow fx_{level} + \lambda \cdot (PPP\_target - fx_{level}) \) with default \( \lambda = 0.33 \).
  - Final \( fx_{A\to B}(t) = fx_{level} \).

Conversion then is simply: converted = value × \( fx_{A\to B}(t) \).

### Relocation and Country Context
When relocation events change the residence country:
- A relocation expense is inflated using the relevant country’s CPI for that year and then converted into the pre‑move residence currency.
- The active residence currency may change after the relocation year, affecting subsequent conversions and display.
- Inflation selection for events continues to respect explicit event rates and linked countries, keeping location‑tied adjustments consistent across moves.

### Fallbacks and Limits
- If series data is missing for a year, the nearest prior observation is used; beyond the last available year, a weighted recent‑years average is used.
- If CPI/PPP/FX are not available from time series, the simulator falls back to values defined in the tax rules or scenario parameters.
- Inflation compounding uses a single effective rate for the elapsed period rather than a year‑by‑year path of varying CPIs. This is a deliberate trade‑off between simplicity and realism.

#### Explicit fallback hierarchies
- **CPI for inflation**: per‑year CPI series → headline CPI in rules → ruleset `inflationRate` → user scenario parameter → 2% default.
- **PPP cross‑rate**: year PPP → base PPP → CPI‑scaled anchor (with base PPP or base FX).
- **FX cross‑rate**: year FX → base FX.

#### Edge cases and robustness
- Division‑by‑zero is guarded when forming cross‑rates; if a needed denominator is zero or missing, the system falls back to the next anchor.
- If conversion cannot be determined, the amount passes through unchanged for that year, and a warning may be surfaced in the UI.
- This layer does not impose rounding; numerical formatting is handled at the UI/reporting layers.

### Worked example (concise)
- Base year: 2025. Event amount in A: 1,000 (base‑year value).
- CPI: \(\pi_A=2%\), \(\pi_B=3%\). Years ahead: 5 (target year 2030).
- Inflation (constant‑rate compounding with current‑year CPI choice): amount in A for 2030 = \(1000 \times 1.02^5 = 1104.08\).
- PPP (base) for A→B: 0.80; year‑2030 PPP missing.
- PPP mode conversion factor for 2030: \( 0.80 \times \frac{1.03^5}{1.02^5} \approx 0.80 \times 1.0499 \approx 0.84 \).
- Converted net flow (after netting in currency A): value × 0.84.


