# Bug: Pension Contribution Per-Country System

## ⚠️ IMPORTANT: Private Pension vs State Pension

**These are completely different things:**

| Aspect | Private Pension | State Pension |
|--------|-----------------|---------------|
| Source | Employee/employer contributions from salary | Government payment at retirement |
| Funding | Self-funded through `Pension.buy()` | Defined benefit, not tracked as an asset |
| Tracking | `person.pension` (Equity subclass) | `statePensionWeekly` parameter |
| Affected by this bug? | **YES** | No |

This bug is **ONLY about private pension contributions** made from salary income.

---

## The Actual Issue

There is only **ONE private pension pot per person**, tied to StartCountry. When a person works in multiple countries that each have private pension systems, all contributions incorrectly go to the StartCountry's pension pot.


### Current Architecture (Buggy)

```
Person 1
  └── pension: Pension (single instance)
        ├── _getBaseCurrency() → always StartCountry currency
        └── _getAssetCountry() → always StartCountry
```

When Person 1 works in Ireland (StartCountry), then moves to USA and works there:
- **Expected**: Two separate pension pots (Irish pension in EUR, US pension in USD)
- **Actual**: All contributions go to the single Irish pension pot, converted to EUR

### What Should Happen

If residence country has a private pension system (`pensionSystem.type = "mixed"`):
1. Contributions should go to a **separate pension pot for that country**
2. Each pot tracks its own currency and growth
3. At retirement, each pot pays out based on **that country's rules** (drawdown rates, lump sum %, retirement age)

If residence country has NO private pension (`pensionSystem.type = "state_only"`):
1. **No contributions** should be made (P.Contrib = 0)
2. This is SEPARATE from state pension (which still pays out if defined)

### Relevant Code

In `Simulator.js` lines 994-1034, pension contributions always use StartCountry:
```javascript
var startCountry = normalizeCountry(params.StartCountry || config.getDefaultCountry());
var startCountryCurrency = getCurrencyForCountry(startCountry);
// ... contributions converted to startCountryCurrency ...
salaryPerson.pension.buy(totalContrib, startCountryCurrency, startCountry);
```

In `Equities.js` lines 690-697, Pension class is hardcoded to StartCountry:
```javascript
_getBaseCurrency() {
  return getCurrencyForCountry(normalizeCountry(params.StartCountry || config.getDefaultCountry()));
}
_getAssetCountry() {
  return normalizeCountry(params.StartCountry || config.getDefaultCountry());
}
```

---

## Secondary Bugs: 

### getRateForKey Returns 100% for Empty Bands

In `Utils.js` lines 765-768:
```javascript
function getRateForKey(key, rateBands) {
  if (!rateBands || typeof rateBands !== 'object' || Object.keys(rateBands).length === 0) {
    return 1.0;  // BUG: Returns 100% instead of 0%
  }
  // ...
}
```

For countries with `pensionSystem.type = "state_only"` (like Argentina), `getPensionContributionAgeBands()` returns `{}`. The current code returns 1.0 (100% contribution rate) instead of 0.

#### Verified Behavior

```
getRateForKey(35, {})  →  1.0  (should be 0)
getRateForKey(35, {"0": 0.15, "30": 0.20})  →  0.2  (correct)
```

#### Mitigation

The frontend (`EventsTableManager.js`) works around this by auto-converting `SI`/`SI2` events to `SInp`/`SI2np` when the destination country is `state_only`. But this is a UI workaround, not a core fix.

### PV Deflation for Pension Fund

The `PresentValueCalculator.js` incorrectly uses StartCountry inflation to deflate `pensionFundPV`:
```javascript
var pensionOriginCountry = params.StartCountry.toLowerCase();
var pensionDeflator = getDeflationFactorForCountry(pensionOriginCountry, ...);
dataRow.pensionFundPV += pensionFundNominal * pensionDeflator;
```

It should use the inflation rate of the country where the pension pot is located.

---

## NON-Issues (Do Not Confuse)

### ❌ State Pension Handling

State pension uses completely separate logic in `Person.calculateYearlyPensionIncome()` and is not affected by this bug. State pension:
- Is a defined benefit (not self-funded)
- Uses `statePensionWeekly` parameter
- Has its own country/currency tracking via `statePensionCountryParam`
- Is correctly deflated using its source country's inflation

### ❌ TestPensionSystemConflicts Passing

This test passes because it uses `SInp` (non-pensionable salary) for salary in state-only countries, avoiding the contribution path entirely. It does NOT test the scenario of pensionable salary in state-only countries.

---

## Required Changes

### 1. Fix getRateForKey for Empty Bands

In `Utils.js`, change the empty bands return value:
```javascript
if (!rateBands || typeof rateBands !== 'object' || Object.keys(rateBands).length === 0) {
  return 0;  // No bands = no contribution allowed
}
```

### 2. Implement Per-Country Pension Pots

Use a **pensions map** instead of a single Pension instance per Person:

```javascript
class Person {
  constructor() {
    this.pensions = {};  // Map of countryCode → Pension instance
  }
  
  getPensionForCountry(countryCode) {
    if (!this.pensions[countryCode]) {
      // Note: Pension constructor needs new 4th param for countryCode
      this.pensions[countryCode] = new Pension(growth, stdev, this, countryCode);
    }
    return this.pensions[countryCode];
  }
}
```

**Pension constructor change** in `Equities.js`:
```javascript
class Pension extends Equity {
  constructor(growth, stdev, person, countryCode) {  // Add countryCode param
    super(0, growth, stdev);
    this.person = person;
    this.countryCode = countryCode;  // Store for _getBaseCurrency/_getAssetCountry
    // Load ruleset for THIS country, not StartCountry
    this._ruleset = Config.getInstance().getCachedTaxRuleSet(countryCode);
  }
  
  _getBaseCurrency() {
    return getCurrencyForCountry(this.countryCode);
  }
  
  _getAssetCountry() {
    return this.countryCode;
  }
}
```

### 3. Update Simulator.js Contribution Logic

Check if residence country has private pension system before contributing:
```javascript
var rsSalary = Config.getInstance().getCachedTaxRuleSet(currentCountry);
var pensionSystemType = rsSalary.getPensionSystemType();

if (pensionSystemType === 'state_only') {
  // No private pension contributions in this country
  continue;
}
// Make contributions to currentCountry's pension pot, not StartCountry
```

### 4. Fix PV Deflation to Use Per-Pot Country Inflation

In `PresentValueCalculator.js`, change the pension PV calculation to use each pot's country inflation:

```javascript
// Current (buggy): Uses single StartCountry for all pension PV
var pensionOriginCountry = params.StartCountry.toLowerCase();
var pensionDeflator = getDeflationFactorForCountry(pensionOriginCountry, ...);

// Fixed: Iterate over each pension pot and use its specific country's inflation
var totalPensionPV = 0;
for (var countryCode in person1.pensions) {
  var pot = person1.pensions[countryCode];
  var potDeflator = getDeflationFactorForCountry(countryCode, ageNum, startYear, {...});
  totalPensionPV += pot.capital() * potDeflator;
}
// Repeat for person2 if exists
```

This ensures Irish pension contributions are deflated by Irish inflation, US pension contributions by US inflation, etc.

---

## Files Affected

- `src/core/Utils.js` (getRateForKey fix)
- `src/core/Person.js` (per-country pension pots)
- `src/core/Equities.js` (Pension class constructor and methods)
- `src/core/Simulator.js` (contribution logic)
- `src/core/PresentValueCalculator.js` (per-pot PV deflation)
- `src/core/TaxRuleSet.js` (reference only - use `getPensionSystemType()`)

---

## Test Coverage

- `TestPensionSystemConflicts.js` - Tests state_only vs mixed systems (uses SInp workaround)
- `TestSeparatePensionPots.js` - Tests P1/P2 separate contributions (single country)
- **Needed**: Test for multi-country pension pots with pensionable salary in both
