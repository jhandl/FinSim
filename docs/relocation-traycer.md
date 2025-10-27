# Multi-Country Relocation: Impact Management & Data Visualization

## The Core Challenge: Cascade Impact Management

When a user adds or modifies a relocation event, the system needs to:

1. **Detect all affected events** in the timeline
2. **Analyze the nature of each impact** (currency mismatch, validation failure, logical inconsistency)
3. **Provide contextual guidance** for resolution
4. **Offer assisted resolution tools** where possible
5. **Maintain timeline integrity** throughout the process

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

### Impact Classification

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

### Resolution Assistance Tools

**Smart Suggestions Engine**:
- Analyze comparable events in the destination country
- Suggest realistic salary ranges based on country economic data
- Propose currency conversion strategies with different assumptions

**Event Splitting Wizard**:
For events that span relocation:
- "Split this salary into two events: before and after move"
- Pre-populate reasonable values for each segment
- Maintain logical continuity

**Cross-Border Asset Manager**:
For properties, investments, and ongoing obligations:
- "Keep paying Dublin mortgage from Argentine salary"
- Show currency conversion implications
- Suggest hedging strategies or early payoff scenarios

**Timeline Impact Visualizer**:
- Show before/after comparison of affected years
- Highlight currency conversion points
- Display cumulative impact on financial projections

## Premium Feature Integration Strategy

### Seamless UI Degradation

**Free Tier Experience**:
- Single country simulation (current functionality)
- Relocation events appear as "Premium Feature" placeholders
- Clear upgrade prompts when attempting to add relocation events

**Premium Tier Activation**:
- Existing scenarios remain fully functional
- Relocation events become available in event wizard
- Impact detection system activates automatically

### Feature Gating Approach

**Core Simulation Engine**: Remains country-agnostic
**Event Processing**: Handles relocation events but only in premium mode
**UI Components**: Show/hide relocation options based on subscription
**Validation System**: Provides basic validation for free, advanced impact analysis for premium

## Data Visualization Strategy

### Chart Currency Management

**Primary Display Currency Selection**:
- User chooses a "reporting currency" for charts (EUR, ARS, USD, etc.)
- All values get converted to this currency for consistent visualization
- Currency selector prominently displayed above charts
- Default to user's starting country currency

**Visual Currency Transition Indicators**:
- Vertical line or shaded region marking relocation points
- Subtle background color changes to indicate currency context shifts
- Tooltip information showing original currency values on hover
- Legend indicating active currency conversion rates used

**Scale Continuity Management**:
- Automatic scaling adjustments when switching reporting currencies
- Smooth transitions between currency views (no jarring jumps)
- Consistent Y-axis formatting regardless of currency magnitude
- Option to show dual-axis charts (original + converted values)

### Data Table Currency Display

**Default Behavior - Natural Currency Mode**:
- Each value displays in its "natural" currency (EUR for Irish salary, ARS for Argentine expenses)
- Currency symbols clearly visible for each cell
- Color coding or subtle styling to distinguish currencies
- Totals and calculations show currency mix clearly

**Unified Currency Mode**:
- Toggle to convert entire table to selected currency
- Dropdown selector for target currency (limited to currencies present in scenario)
- Conversion rates and date assumptions clearly displayed
- Original currency values available via hover or secondary display

**Currency Context Indicators**:
- Column headers show active currency context for each time period
- Visual indicators (flags, currency codes) for country transitions
- Clear demarcation of when currency context changes
- Tooltips explaining conversion assumptions and rates

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

## Workflow: Adding a Mid-Timeline Relocation

### Step 1: Event Creation
User adds "Move to Argentina at age 35" via event wizard

### Step 2: Impact Detection
System scans timeline and identifies:
- Salary event (age 30-40) that spans the move
- Mortgage event (age 32-62) for Dublin property
- Property purchase planned for age 37 (now in Argentina context)

### Step 3: Impact Presentation
Show impact dashboard:
```
⚠️ Your relocation affects 3 events:

🏠 Dublin Property Mortgage (Age 32-62)
Impact: You'll pay EUR mortgage from ARS salary
→ Review currency conversion strategy

💼 Software Engineer Salary (Age 30-40)
Impact: EUR 45,000 may not reflect Argentine wages
→ Split event or adjust for local market

🏡 Property Purchase (Age 37)
Impact: Planned for Dublin, but you'll be in Argentina
→ Change location or timing
```

### Step 4: Guided Resolution
For each event, provide resolution wizard:

**Salary Event Resolution**:
- Option A: "Keep same job remotely" (maintain EUR salary)
- Option B: "Find new job in Argentina" (split event, suggest ARS range)
- Option C: "Gradual transition" (reduce EUR salary, add ARS salary)

**Mortgage Resolution**:
- Option A: "Pay from foreign salary" (show conversion costs)
- Option B: "Sell property before move" (adjust sale timing)
- Option C: "Rent out property" (add rental income event)

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
1. **Re-scan timeline** for new impact boundaries
2. **Update affected event list** (more events now affected)
3. **Preserve previous resolutions** where still applicable
4. **Flag new conflicts** that arise from date change
5. **Show delta impact**: "Moving your relocation earlier affects 2 additional events"

### Intelligent Conflict Resolution
- Maintain user's previous choices where possible
- Auto-adjust event splits based on new timeline
- Warn about new logical inconsistencies
- Suggest timeline optimizations

## Implementation Principles

### User-Centric Design
- Never leave users stranded with broken scenarios
- Always provide clear next steps
- Make complex decisions feel manageable through progressive disclosure

### Graceful Complexity Management
- Start with simple cases, build to complex scenarios
- Provide escape hatches for edge cases
- Allow manual overrides when automation falls short

### Premium Value Proposition
- Free tier provides complete single-country experience
- Premium tier adds sophisticated multi-country capabilities
- Clear value demonstration through impact analysis tools

### Currency Display Consistency
- Maintain visual coherence across all data presentations
- Provide clear context for all currency conversions
- Allow user control over display preferences
- Ensure export functionality preserves currency context