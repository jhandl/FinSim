# FinSim Architecture Quality Report

Date: 2026-01-03  
Scope: repository-level architecture (core engine + web frontend + test harness)  
Method: static review of key modules and cross-cutting patterns; no runtime profiling.

## Executive Summary

FinSim has a strong “static-site, config-driven simulator” architecture with a clear *intentional* separation between `src/core/` (GAS-compatible engine) and `src/frontend/` (UI environments). Several subsystems demonstrate high-quality shared logic (tax rules via JSON + `TaxRuleSet`, FX/CPI/PPP via `EconomicData`, currency-tagged amounts via `Money`, dynamic investments via `InvestmentTypeFactory`, PV via `PresentValueCalculator`).

The main architectural tension is that the core execution path is still largely organized around **module-level global state** (notably `src/core/Simulator.js`) and a UI shim (`src/frontend/UIManager.js`) that is coupled to both core globals and browser DOM. This increases cognitive load and coupling, makes boundaries more porous than intended, and raises the cost of extensibility (especially for multi-country and UI feature growth).

## Cohesion

**Overall: Medium → Strong (varies by module)**

- Strong cohesion in focused domain modules:
  - Currency-tagged money operations: `src/core/Money.js`
  - Tax-rule data wrapper: `src/core/TaxRuleSet.js`
  - FX/CPI/PPP conversion & profiles: `src/core/EconomicData.js`
  - Tax calculation API & attribution integration: `src/core/Taxman.js`
  - PV aggregation extracted into a dedicated unit: `src/core/PresentValueCalculator.js`
  - Dynamic investment-type assets: `src/core/InvestmentTypeFactory.js`
- Lower cohesion in orchestrators that “own everything”:
  - The simulation loop, IO, UI status, and many helper functions share one global context: `src/core/Simulator.js`
  - The web UI root wires many subsystems and contains large UI/state logic: `src/frontend/web/WebUI.js`

**Impact:** cohesive building blocks exist, but large “god” orchestrators reduce maintainability and local reasoning.

## Loose Coupling

**Overall: Medium**

**Where coupling is kept relatively loose**
- Core can run under multiple UI environments by selecting `GasUI` vs `WebUI`: `src/core/Simulator.js` (see `initializeUI()`).
- Country behavior is mostly ruleset-driven (JSON), reducing hard-coded branching: `src/core/config/tax-rules-*.json`, consumed by `src/core/TaxRuleSet.js` and `src/core/Taxman.js`.
- Investment behavior is ruleset-driven via `investmentTypes`: `src/core/InvestmentTypeFactory.js`.

**Where coupling is tight**
- Core depends on numerous globals (`params`, `events`, `dataSheet`, `row`, `year`, `currentCountry`, etc.), making many functions implicitly coupled: `src/core/Simulator.js`.
- `UIManager` couples to:
  - Core globals such as `montecarlo`, `dataSheet`, `row`, `params`: `src/frontend/UIManager.js`
  - Browser DOM (`document.getElementById`, `document.querySelectorAll`), which complicates “UI abstraction” claims: `src/frontend/UIManager.js`
- Web “single source of truth” (events table) is implemented as DOM-canonical. That’s pragmatic, but it couples data logic to specific markup and selectors:
  - Table reads/writes: `src/frontend/web/components/EventsTableManager.js`
  - Accordion sync extracts events from table DOM: `src/frontend/web/components/EventAccordionManager.js`

**Impact:** running in multiple environments works, but refactoring and extending is constrained by implicit dependencies and DOM-canonical state.

## Clear Boundaries

**Overall: Medium**

**Clear boundary signals**
- Directory separation (`src/core/` vs `src/frontend/`) is consistent and matches the project’s stated cross-environment intent.
- Core files explicitly document “GAS compatible” constraints (no ES modules): e.g. `src/core/Config.js`, `src/core/Simulator.js`.

**Boundary leaks**
- `src/frontend/UIManager.js` contains browser DOM calls, despite being used as the cross-environment shim in `src/core/Simulator.js`.
- Some core modules use environment detection (`typeof require`, `module.exports`) to support Node tests, which is pragmatic but blurs “single environment” assumptions: `src/core/Config.js`, `src/core/Money.js`, `src/core/EconomicData.js`.

**Impact:** boundaries exist conceptually and structurally, but enforcement is inconsistent at the interface layer.

## Centralized Shared Logic

**Overall: Strong**

Examples of centralization that reduce duplication and enable consistency:
- **Configuration & ruleset caching**: `src/core/Config.js` (`getTaxRuleSet`, cached rulesets, version chaining).
- **Rule access normalization**: `src/core/TaxRuleSet.js` provides stable getters and normalization for raw JSON.
- **Currency correctness**: `src/core/Money.js` enforces currency+country tagging and prevents silent mixing.
- **Economic conversions**: `src/core/EconomicData.js` consolidates FX/CPI/PPP modes (`constant`, `evolution`, `ppp`, `reversion`) behind one API.
- **PV semantics**: `src/core/PresentValueCalculator.js` centralizes PV rules and throws when invariants are violated (e.g., missing investment type metadata).
- **Dynamic investments**: `src/core/InvestmentTypeFactory.js` centralizes creation of per-ruleset investment assets.

**Impact:** this is a core strength—many “hard parts” are centralized and testable (see extensive coverage under `tests/`).

## Low Cognitive Load

**Overall: Medium → Weak on the hot path**

**What keeps load lower**
- Strong documentation within modules for semantics (e.g., PV semantics and numeric boundary contracts): `src/core/PresentValueCalculator.js`.
- Tests cover many nuanced scenarios, giving engineers confidence when changing core logic: `tests/` (notably multi-currency, relocation, PV, tax).

**What increases load**
- The simulation orchestration is built around implicit global state; understanding any function often requires knowing many “ambient” variables:
  - Example globals: `src/core/Simulator.js` top-level `var ...` list.
- “UI abstraction” is not purely an abstraction; core-adjacent code can access DOM (`UIManager`), while UI components can call deep core singletons (`Config.getInstance()`), and both rely on global state.
- Mixed contracts (sometimes throw, sometimes return `null`, sometimes set global `errors = true`) require careful caller understanding:
  - Example: `convertCurrencyAmount()` returns `null` in strict mode, otherwise returns original value on failure: `src/core/Simulator.js`.

**Impact:** day-to-day modification cost is dominated by the orchestrator/global-state model rather than by the modular subsystems.

## Injected Dependencies

**Overall: Medium**

**Good examples**
- `Config.initialize(ui)` takes a UI abstraction for fetch/persistence/alerts: `src/core/Config.js`.
- `Taxman.reset(person1, person2, attributionManager, currentCountry, year)` injects the attribution manager and scenario context: `src/core/Taxman.js`.
- Web components receive `webUI` (a façade) as a constructor dependency: e.g. `src/frontend/web/components/EventsTableManager.js`, `src/frontend/web/components/EventAccordionManager.js`.

**Gaps / inconsistencies**
- Core code frequently reaches for singletons/globals instead of constructor injection (e.g., `Config.getInstance()`, global `currentCountry`/`year`).
- Some “injection” is partially undermined by ambient globals:
  - `UIManager` is constructed with `ui`, but still reads `document` and core globals: `src/frontend/UIManager.js`.
  - `GenericInvestmentAsset` behavior uses globals (`residenceCurrency`, `currentCountry`, `year`, `revenue`) rather than injected context: `src/core/InvestmentTypeFactory.js`.

**Impact:** the codebase has the *shape* of DI, but not consistently; many dependencies are “hidden”.

## Fail Fast

**Overall: Medium → Strong in core validation; mixed in glue**

**Fail-fast strengths**
- `Config.getInstance()` throws if used before initialization: `src/core/Config.js`.
- Monetary declarations validate `Money` shape and enforce residence currency at input boundaries: `src/core/Taxman.js`.
- Many normalization helpers throw on invalid inputs: `src/core/Simulator.js` (`normalizeCountry`, `normalizeCurrency`).
- PV layer explicitly throws when invariants are broken (good for correctness): `src/core/PresentValueCalculator.js`.

**Non-fail-fast patterns that add ambiguity**
- Some exceptions are intentionally swallowed to allow cross-environment shims (especially around `require`): `src/core/Config.js`.
- Some conversions return `null` or fallback values rather than uniformly throwing, shifting error handling into callers:
  - `EconomicData.convert()` returns `null` on invalid conversion: `src/core/EconomicData.js`.
  - `convertCurrencyAmount()` optionally returns original value in non-strict mode: `src/core/Simulator.js`.

**Impact:** core correctness checks are good, but glue layers mix fail-fast and “best effort”, which can surprise callers.

## Reduced Shared State

**Overall: Weak**

- The primary simulation execution uses many module-level globals that act as a shared mutable state container: `src/core/Simulator.js`.
- Web UI has additional shared state via:
  - Singletons (`WebUI.getInstance()`): `src/frontend/web/WebUI.js`
  - Persistent feature flags/preferences in `localStorage` across multiple components and `src/frontend/web/ifs/index.html`.
- Some caches are appropriately localized:
  - Config ruleset cache: `src/core/Config.js`
  - FX evolution cache inside `EconomicData`: `src/core/EconomicData.js`
- But there are also module-level caches that outlive a simulation run unless explicitly reset:
  - `fxConversionCache` in `src/core/Simulator.js` (cleared on init, but still global-by-design).

**Impact:** shared mutable state is a major coupling vector and makes reentrancy, concurrency, and local reasoning harder.

## Extensibility

**Overall: Strong in configuration-driven domains; Medium elsewhere**

**Strong extensibility points**
- Adding/changing country tax behavior mostly goes through JSON rules + `TaxRuleSet`/`Taxman`: `src/core/config/tax-rules-*.json`, `src/core/TaxRuleSet.js`, `src/core/Taxman.js`.
- Investment types can be extended via ruleset `investmentTypes` without introducing new hard-coded classes: `src/core/InvestmentTypeFactory.js`.
- Relocation feature is feature-gated and has dedicated impact detection/resolution tooling: `src/frontend/web/components/RelocationImpactDetector.js`, `src/frontend/web/components/RelocationImpactAssistant.js`, feature gate in `src/core/Config.js` (`isRelocationEnabled()`).

**Where extensibility is constrained**
- Extending the simulation loop often requires touching the global-orchestrator context, increasing risk of unintended interactions: `src/core/Simulator.js`.
- Web-side “events are the source of truth” works, but DOM-canonical state makes deeper refactors (e.g., virtualized rendering, model-first approaches) more expensive: `src/frontend/web/components/EventsTableManager.js`.

## Configurability

**Overall: Strong**

- Versioned simulator config with “latestVersion” chaining and persistence: `src/core/config/finsim-*.json`, `src/core/Config.js`.
- Country behavior and economic metadata live in rulesets: `src/core/config/tax-rules-*.json`, accessed via `src/core/TaxRuleSet.js`.
- UI feature flags/preferences are persisted (wizard toggle, PV mode, view mode, etc.), though they are scattered across components and HTML: `src/frontend/web/ifs/index.html`, `src/frontend/web/components/EventsTableManager.js`, `src/frontend/web/WebUI.js`.

**Main tradeoff:** configuration exists at multiple layers (JSON config vs localStorage flags), and there isn’t a single, typed/validated source of truth for *UI configuration*.

## Low Surprise Factor

**Overall: Medium**

**Predictable patterns**
- Clear “rules-driven tax engine” and explicit rule wrappers.
- Extensive tests reduce “behavioral surprise” for core changes.
- Several functions explicitly document semantics and contracts (PV, Money).

**Surprising / non-obvious patterns**
- Ambient globals heavily influence behavior; code that looks “pure” often isn’t (depends on global `currentCountry`, `year`, `params`, etc.): `src/core/Simulator.js`.
- `UIManager`’s name suggests a pure abstraction, but it directly touches DOM and core globals: `src/frontend/UIManager.js`.
- Mixed error semantics (throw vs `null` vs fallback values vs setting global `errors`) can surprise new contributors.

## Recommendations (Prioritized)

1. **Make the core execution context explicit.** Introduce a minimal `SimContext` object (even if not a class) that holds `params/events/config/year/currentCountry/residenceCurrency/dataSheet/errors` and pass it through hot-path helpers in `src/core/Simulator.js`. This can be incremental and preserve GAS compatibility.
2. **Tighten the UI boundary.** Move DOM-dependent functions out of `src/frontend/UIManager.js` into `src/frontend/web/WebUI.js` (or a web-only helper) so the cross-environment shim does not depend on `document`.
3. **Standardize error contracts at boundaries.** Pick consistent patterns for:
   - FX conversion failure (`throw` vs `null` vs “best-effort fallback”), and
   - validation errors (`errors` flag vs exceptions),
   then apply them to a small number of high-impact boundary functions (e.g., conversion helpers).
4. **Centralize UI feature flag access.** Wrap `localStorage` access behind a small `Preferences` utility (web-only) to reduce scatter and improve discoverability.
5. **Continue the “extract to focused modules” approach.** `PresentValueCalculator` is a good precedent; similar extractions from `src/core/Simulator.js` (one at a time) will steadily reduce cognitive load without large rewrites.

