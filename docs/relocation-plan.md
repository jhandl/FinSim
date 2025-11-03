# Multi-Country Relocation: Enhanced Implementation Plan (Revised)

## The Core Challenge: Cascade Impact Management

When a user adds or modifies a relocation event, the system needs to:





**Detect all affected events** in the timeline



**Analyze the nature of each impact** (currency mismatch, validation failure, logical inconsistency)



**Provide contextual guidance** for resolution



**Offer assisted resolution tools** where possible



**Maintain timeline integrity** throughout the process

## Core Architecture Principles

### Runtime Residency Derivation (No Persisted Segments)

**Residency is derived dynamically** at simulation time:
- Start with `StartCountry` parameter from Starting Position
- As simulation loop encounters `MV-*` events, update `currentCountry`
- No separate ResidencySegment structure or persistence
- Prevents inconsistencies between events and derived state

**Tax Rule Persistence Across Borders**:
- Some tax rules from previous country can persist (e.g., Ireland's 3-year domicile rule)
- Tax rules define their own cross-border persistence logic
- `TaxRuleSet` includes `residencyRules` for post-emigration taxation

### Premium Feature Gating

**Configuration-Driven Availability**:
- Premium features flag in `finsim-<version>.json`: `"relocationFeatureEnabled": true/false`
- When disabled: UI shows **zero hints** of relocation capability
- No placeholders, no disabled buttons, no tooltips about premium features
- Completely invisible to non-premium users

### CSV Schema Stability

**No CSV Changes**:
- CSV format remains unchanged
- `StartCountry` persisted as standard parameter (like other Starting Position fields)
- Assistant resolutions stored in `localStorage` only
- Soft warnings when resolution data missing (user can re-resolve)

## Enhanced Event Model & Data Architecture

### Relocation Event Structure

**Event Type**: `MV-XX` where `XX` is ISO-3166 country code (e.g., `MV-IE`, `MV-AR`)
- **name/id**: Destination country display name (e.g., "Argentina (AR)")
- **amount**: One-off relocation cost in destination currency
- **fromAge/fromYear**: Effective relocation time (single point)
- **rate**: **Per-country inflation override** for destination country (optional)
- If set, overrides destination country's default inflation from tax rules
- Applies to all events in that country until next relocation
- **toAge, match**: Hidden for relocation events

### Enhanced SimEvent Class (Core)

Add new fields to `Events.js` (core class, not web layer):
- **currency** field (optional): If null, inferred from country of residence; if set (e.g., "EUR"), event is "pegged" to that currency
- **linkedEventId** field: Used by Relocation Wizard to manage relationships between split events
- **linkedCountry** field (optional): For location-tied events (rental income, property appreciation)

### Location-Tied Event Inflation

**Rental Income & Property Events**:
- If user doesn't specify `rate`, defaults to linked country's inflation
- Linked country inflation persists even after user relocates
- Example: Dublin rental income continues at Irish inflation rate after moving to Argentina
- `linkedCountry` field tracks the country for inflation purposes

## Impact Detection System

### Event Relationship Analysis

The system needs to understand different types of event relationships:

**Temporal Relationships**:
- Events that span across relocation boundaries (mortgages, long-term salaries)
- Events that occur after relocation (new country context)
- Events that reference assets from before relocation (property sales)

**Logical Dependencies**:
- Salary continuity (same job before/after move)
- Asset ownership (properties, investments in original country)
- Financial obligations (mortgages, loans that continue post-move)

**Currency Context Conflicts**:
- Events with amounts that become unrealistic in new currency context
- Cross-border financial flows (paying EUR mortgage from ARS salary)
- Investment returns in original currency while living elsewhere

**Location-Tied Inflation**:
- Rental income from properties in original country
- Property appreciation in original country
- Location-specific recurring expenses

### Enhanced Impact Classification

**Category 1: Validation Failures**
- Salary amounts that are unrealistic in new country (€40k → ARS 40k)
- Property purchases in countries where user no longer lives
- Currency mismatches that break logical flow

**Category 2: Ambiguous Situations**
- Jobs that span relocation (does salary change currency/amount?)
- Rental income from properties in original country
- Investment strategies that may need adjustment

**Category 3: Cross-Border Complexities**
- Mortgage payments in original currency from new country salary
- Tax implications of maintaining assets in multiple countries
- Currency conversion assumptions and risks

**Category 4: Pension System Conflicts**
- Destination country doesn't support private pensions (state_only)
- Different employer matching schemes and contribution caps
- Pension portability restrictions

## Delta-Only Relocation Impact Assistant

### Smart Delta Detection

**Trigger Conditions**:
- On inserting `MV-*` event or changing its `fromAge`/`fromYear`
- On pressing Run, if unresolved impacts exist
- When user modifies existing events that cross relocation boundaries

**Delta Logic**:
- For move boundary `B`, classify events as `pre`, `post`, or `crosses`
- On date change from `B_old` to `B_new`, detect newly impacted events
- Show only items that changed status: `pre↔post`, `pre→crosses`, etc.
- Propose rejoin for previously split events that now fall on one side

### Persistence & Fingerprinting

**Decision Storage**:
- Store in `localStorage` with key: `relocationResolutions:<scenarioHash>:<mvEventId>`
- Each decision includes: `{ status, action, details, fingerprint }`
- Fingerprint captures structural fields to detect user edits
- Invalidate stored decisions when fingerprint changes
- **Soft warnings** when resolution data missing (not blocking, just informational)

### Simulation Gating

**Run Blocking**:
- Before `run()` in `WebUI.handleRunSimulation`, call `ensureResolvedOrPrompt()`
- If unresolved items exist, open assistant scoped to those items
- On completion, proceed to `run()` automatically
- Show "Needs Review" badges on impacted rows until resolved

## User Guidance & Resolution Framework

### Progressive Disclosure Approach

**Level 1: Impact Overview**
When relocation event is added/modified, show a summary:
- "3 events need attention due to your move to Argentina"
- "2 salary events may need currency adjustment"
- "1 mortgage payment will involve currency conversion"

**Level 2: Event-Specific Guidance**
For each affected event, provide:
- **What's the issue**: "This €40,000 salary continues after your move to Argentina"
- **Why it matters**: "This amount may not reflect realistic Argentine wages"
- **Suggested actions**: Multiple resolution options with trade-offs

**Level 3: Assisted Resolution**
Contextual tools and wizards to help resolve each issue.

### Enhanced Resolution Actions

**Smart Suggestions Engine**:
- Analyze comparable events in the destination country
- Suggest realistic salary ranges based on country economic data
- Propose currency conversion strategies with different assumptions
- Use PPP (Purchasing Power Parity) hints for salary adjustments

**Event Splitting Wizard**:
For events that span relocation:
- "Split this salary into two events: before and after move"
- Pre-populate reasonable values for each segment
- Maintain logical continuity via `linkedEventId`
- Auto-apply category defaults per post-move segment

**Cross-Border Asset Manager**:
For properties, investments, and ongoing obligations:
- "Keep paying Dublin mortgage from Argentine salary"
- Show currency conversion implications
- Set `linkedCountry` for location-tied events
- Apply asset retention policies (currency pegging)

**Pension System Adapter**:
- Convert `SI` to `SInp` when moving to state-only pension countries
- Clamp contribution rates/matches to destination country limits
- Offer foreign private contribution as plain expense option
- Hide pension inputs in salary wizard when residency disallows

**Timeline Impact Visualizer**:
- Show before/after comparison of affected years
- Highlight currency conversion points
- Display cumulative impact on financial projections

## Enhanced Currency & Inflation System

### Currency Interpretation Defaults

**Rebase to Destination Local Currency** (no split by default):
- Salaries, generic living expenses

**Retain Original Asset Currency**:
- Mortgages, property-linked rent, security payouts
- Set via `currency` field on event

**Location-Tied Inflation**:
- Rental income, property appreciation
- Set via `linkedCountry` field
- Continues using original country inflation after relocation

**One-off Relocation Costs**:
- Destination local currency, no indexation by default

### Enhanced Tax Rules Schema

Extend `tax-rules-*.json` to include:
- **currency** (e.g., "EUR")
- **inflationRate** (default rate, e.g., 0.025)
- **residencyRules** (optional): Post-emigration taxation rules
```json
{
"residencyRules": {
"postEmigrationTaxYears": 3,
"taxesForeignIncome": true,
"description": "Ireland taxes domiciled individuals for 3 years after emigration"
}
}
```
- **pensionSystem** configuration:
```json
{
"pensionSystem": {
"type": "state_only | private_only | mixed",
"supportsPrivatePayroll": true,
"employeeContributionModes": ["percent_gross", "percent_net", "fixed_amount"],
"defaultEmployeeContributionPct": 0.05,
"employerMatch": {
"supported": true,
"scheme": "matching | none",
"matchPercentOfSalary": 0.05
},
"annualContributionCaps": {
"employeePctOfSalary": 0.4,
"employeeAmount": 0
},
"portability": {
"allowForeignPrivate": false
}
}
}
```

### Currency Conversion Service

**Core Features**:
- Cache year-indexed CPI and FX data for fast conversions
- Expose `convert(value, fromCurrency, toCurrency, year)` API
- Handle CPI-first then FX conversions
- Support manual FX rate overrides in Settings
- Provide PPP suggestions for salary adjustments
- **Memoization**: Cache conversions per year/currency pair for performance

## Core Simulation Architecture Changes

### Config.initialize Enhancements

**Preload All Referenced TaxRuleSets**:
- Scan scenario for all `MV-*` events
- Extract destination country codes
- Preload all required `TaxRuleSet` JSON files
- Makes them available synchronously for Monte Carlo runs
- Ensures reproducibility across runs

### Simulator.js Loop Changes

**Per-Year Residency Context**:
- Initialize `currentCountry` with `StartCountry` parameter
- As loop encounters `MV-*` events, update `currentCountry`
- Pass `currentCountry` and year to `Taxman` at start of each year
- Apply country-specific inflation rates per event
- Handle location-tied events with `linkedCountry` inflation

**Inflation Logic**:
- Check if event has `linkedCountry` → use that country's inflation
- Check if event has explicit `rate` → use that
- Check if current `MV-*` event has `rate` override → use that for country default
- Otherwise use `currentCountry` default inflation from tax rules

**Currency Handling**:
- Check if event has `currency` field set → use that (pegged)
- Otherwise use `currentCountry` currency from tax rules

### Taxman.js Enhancements

**Per-Year Country Context**:
- Accept `currentCountry` and `year` parameters
- Load appropriate `TaxRuleSet` for that country/year
- Apply cross-border tax rules (e.g., post-emigration taxation)
- Track which tax rules apply from previous countries

**Cross-Border Taxation**:
- Check if previous country has `residencyRules.postEmigrationTaxYears`
- Apply overlapping tax obligations from multiple countries
- Coordinate tax credits and treaty benefits

### AttributionManager.js Enhancements

**Per-Year Residency Context**:
- Accept `currentCountry` and `year` parameters
- Track original currency for each attribution entry
- Store FX rates used for conversions

**Base Currency Normalization**:
- Normalize all aggregates to base currency (home country)
- Retain metadata about original currencies
- Store FX rates used for each conversion
- Enable drill-down to see original currency values

### Performance Optimizations

**Memoization Strategy**:
- Cache currency conversions per year/currency pair
- Cache inflation calculations per country/year
- Cache tax rule lookups per country/year
- Invalidate caches only when relevant data changes
- Critical for Monte Carlo performance with multiple countries

## Premium Feature Integration Strategy

### Configuration-Driven Gating

**finsim-<version>.json**:
```json
{
"latestVersion": "2.0",
"relocationFeatureEnabled": false,
"defaultCountry": "ie",
"applicationName": "Ireland Financial Simulator"
}
```

**UI Behavior**:
- When `relocationFeatureEnabled: false`:
- No "Relocation" option in event type dropdown
- No `MV-*` event types visible
- No currency badges or selectors
- No impact assistant
- No multi-country UI elements whatsoever
- When `relocationFeatureEnabled: true`:
- All relocation features become available
- Existing single-country scenarios work unchanged

### Feature Gating Approach

**Core Simulation Engine**: Handles multi-country logic always (no branching)
**Event Processing**: Processes `MV-*` events if present
**UI Components**: Show/hide based on `relocationFeatureEnabled` flag
**Validation System**: Validates `MV-*` events if present

## Enhanced Data Visualization Strategy

### Chart Currency Management

**Primary Display Currency Selection**:
- User chooses a "reporting currency" for charts (EUR, ARS, USD, etc.)
- All values get converted to this currency for consistent visualization
- Currency selector prominently displayed above charts
- Default to user's starting country currency (base currency)

**Visual Currency Transition Indicators**:
- Vertical line or shaded region marking relocation points
- Subtle background color changes to indicate currency context shifts
- Tooltip information showing original currency values on hover
- Legend indicating active currency conversion rates used
- Annotations for flagged events (mortgage in EUR while income in ARS)

**Scale Continuity Management**:
- Automatic scaling adjustments when switching reporting currencies
- Smooth transitions between currency views (no jarring jumps)
- Consistent Y-axis formatting regardless of currency magnitude
- Option to show dual-axis charts (original + converted values)
- "Natural currency" mode vs unified currency mode with smoothed FX

### Enhanced Data Table Currency Display

**Default Behavior - Natural Currency Mode**:
- Each value displays in its "natural" currency (EUR for Irish salary, ARS for Argentine expenses)
- Currency symbols clearly visible for each cell
- Color coding or subtle styling to distinguish currencies
- Totals and calculations show currency mix clearly
- Currency badges with tooltips showing conversion details

**Unified Currency Mode**:
- Toggle to convert entire table to selected currency
- Dropdown selector for target currency (limited to currencies present in scenario)
- Conversion rates and date assumptions clearly displayed
- Original currency values available via hover or secondary display
- Memoized view model for converted values to keep scrolling performant

**Enhanced Currency Context Indicators**:
- Column headers show active currency context for each time period
- Visual indicators (flags, currency codes) for country transitions
- Clear demarcation of when currency context changes
- Tooltips explaining conversion assumptions and rates
- Residency timeline bands in table background to visually delineate country changes
- Inline warnings when event values breach validation profiles

### User Experience Flow

**Initial Setup**:
- When first relocation event is added, prompt user to select preferred reporting currency
- Explain implications of currency display choices
- Allow easy switching between modes during analysis

**Ongoing Usage**:
- Persistent currency selector in chart/table headers
- Quick toggle between "natural" and "unified" currency modes
- Clear visual feedback when switching between views
- Consistent currency formatting throughout the interface

**Data Export Considerations**:
- CSV exports include both original and converted values
- Clear column headers indicating currency and conversion assumptions
- Metadata about exchange rates and conversion dates included
- Respect user's chosen display currency while embedding native amounts

## Workflow: Adding a Mid-Timeline Relocation

### Step 1: Event Creation
User adds "Move to Argentina at age 35" via enhanced event wizard with country picker
- Optionally set per-country inflation override in `rate` field

### Step 2: Impact Detection
System scans timeline and identifies:
- Salary event (age 30-40) that spans the move
- Mortgage event (age 32-62) for Dublin property
- Rental income event (age 30-50) from Dublin property
- Property purchase planned for age 37 (now in Argentina context)

### Step 3: Impact Presentation
Show enhanced impact dashboard:
```
⚠️ Your relocation affects 4 events:

🏠 Dublin Property Mortgage (Age 32-62)
Impact: You'll pay EUR mortgage from ARS salary
→ Review currency conversion strategy

💼 Software Engineer Salary (Age 30-40)
Impact: EUR 45,000 may not reflect Argentine wages
→ Split event or adjust for local market

🏡 Dublin Rental Income (Age 30-50)
Impact: Should continue in EUR with Irish inflation
→ Set location-tied inflation

🏡 Property Purchase (Age 37)
Impact: Planned for Dublin, but you'll be in Argentina
→ Change location or timing

💰 Pension Contributions
Impact: Argentina has state-only pension system
→ Convert to non-pensionable salary
```

### Step 4: Guided Resolution
For each event, provide enhanced resolution wizard:

**Salary Event Resolution**:
- Option A: "Keep same job remotely" (maintain EUR salary, peg currency)
- Option B: "Find new job in Argentina" (split event, suggest ARS range using PPP)
- Option C: "Gradual transition" (reduce EUR salary, add ARS salary)
- Option D: "Convert to non-pensionable" (if pension system incompatible)

**Mortgage Resolution**:
- Option A: "Pay from foreign salary" (show conversion costs, peg to EUR)
- Option B: "Sell property before move" (adjust sale timing)
- Option C: "Rent out property" (add rental income event with `linkedCountry: IE`)

**Rental Income Resolution**:
- Option A: "Keep in EUR with Irish inflation" (set `linkedCountry: IE`, peg currency)
- Option B: "Convert to ARS" (unlikely but possible)

**Property Purchase Resolution**:
- Option A: "Buy in Argentina instead" (adjust location and currency)
- Option B: "Buy before moving" (adjust timing)
- Option C: "Cancel purchase" (remove event)

### Step 5: Validation & Confirmation
- Show updated timeline with resolved events
- Highlight remaining currency conversion points
- Confirm user understanding of cross-border implications

### Step 6: Currency Display Setup
- Prompt user to select preferred reporting currency for charts
- Explain data table currency display options
- Set up default visualization preferences

## Workflow: Changing Relocation Date

### Dynamic Impact Recalculation
When user changes move date from age 35 to 32:





**Re-scan timeline** for new impact boundaries



**Update affected event list** (more events now affected)



**Preserve previous resolutions** where still applicable



**Flag new conflicts** that arise from date change



**Show delta impact**: "Moving your relocation earlier affects 2 additional events"

### Intelligent Conflict Resolution
- Maintain user's previous choices where possible
- Auto-adjust event splits based on new timeline
- Warn about new logical inconsistencies
- Suggest timeline optimizations
- Propose rejoin for events that no longer cross boundaries

## Implementation Principles

### User-Centric Design
- Never leave users stranded with broken scenarios
- Always provide clear next steps
- Make complex decisions feel manageable through progressive disclosure
- Block simulation until conflicts are resolved

### Graceful Complexity Management
- Start with simple cases, build to complex scenarios
- Provide escape hatches for edge cases
- Allow manual overrides when automation falls short
- Events table remains single source of truth

### Premium Value Proposition
- Free tier provides complete single-country experience with zero hints of premium features
- Premium tier adds sophisticated multi-country capabilities
- Clear value demonstration through impact analysis tools

### Currency Display Consistency
- Maintain visual coherence across all data presentations
- Provide clear context for all currency conversions
- Allow user control over display preferences
- Ensure export functionality preserves currency context

### Backwards Compatibility & Persistence
- CSV schema remains unchanged
- `StartCountry` persisted as standard parameter
- Assistant resolutions in `localStorage` with soft warnings when missing
- Graceful degradation when premium features unavailable

### Performance & Reproducibility
- Preload all TaxRuleSets in `Config.initialize`
- Memoize conversions and calculations per year
- Ensure Monte Carlo runs are synchronous and reproducible
- Optimize for scenarios with multiple relocations

## Enhanced UI Integration Points

### Starting Position Panel
- Add "Start Country" dropdown populated via IP geolocation
- Default selection with "Select a country" placeholder fallback
- Persisted as standard parameter in CSV

### Event Type Dropdown (Premium Only)
- Add top-level "Relocation" category with country submenu
- Options use values like `MV-IE`, labels like "Relocation → Ireland"
- Populate from available `tax-rules-*.json` files
- **Completely hidden** when `relocationFeatureEnabled: false`

### Events Table & Accordion (Premium Only)
- Currency badges next to amount inputs with dropdown for currency pegging
- "Needs Review" badges on impacted rows until resolved
- Quick filter: "Show unresolved only"
- Field visibility driven by `UIManager.getRequiredFields(eventType)`
- **No currency UI elements** when `relocationFeatureEnabled: false`

### Enhanced Validation
- `MV-*` same year conflict errors
- Plausibility checks for amounts in destination currency
- Pension system compatibility warnings
- Cross-border asset taxation guidance
- Location-tied inflation validation

This revised approach maintains the simplicity of runtime derivation, leverages the existing event system, and provides a clean premium feature gate while ensuring performance and reproducibility for Monte Carlo simulations.