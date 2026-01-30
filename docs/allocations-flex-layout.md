# Allocations Panel: Flexible One‑Row Layout (Label + Holds + %)

This document describes the current implementation of the Allocations panel’s “compact row” layout in the web UI: how label text, the optional “Holds” asset selector, and the percentage input are kept aligned on a single row while allowing the label to wrap (up to two lines) only when required.

## Goals / invariants

- **Controls stay aligned**: the `%` input column is fixed-width and never shrinks.
- **No control wrapping**: the `%` input and dropdown controls never wrap onto a new line.
- **Only the label can wrap**: label text is single-line when it fits; otherwise it wraps to (at most) two lines.
- **“Wrap mode” is atomic**: when wrap mode is entered, the label both (a) uses the wrap styling and (b) is force-broken with a `<br>` so the label visibly wraps.
- **Asset selector (“Holds”) is contextual**:
  - Rendered only for investment types that are **baseRef-backed** (they inherit from a global base asset type).
  - Not rendered for standalone local assets like MERVAL (no `baseRef`/`baseKey`).

## Where this lives

- **DOM construction**: `src/frontend/web/WebUI.js`
  - Allocations rebuild: `WebUI._setupAllocationsCountryChips(...)`
  - Holds selector creation: `WebUI._appendHoldsDropdown(...)`
  - Holds width fitting: `WebUI._fitAllocHoldsToggleWidth(...)`
  - Wrap + hard-break logic: `WebUI._refreshAllocationsLabelLayout(...)`
- **Styling**: `src/frontend/web/ifs/css/simulator.css`
  - Scoped rules under `#Allocations .input-wrapper[data-allocations-row="true"] ...`

## Row structure (DOM)

Each “compact” allocations row is built as a flex container:

- `div.input-wrapper[data-allocations-row="true"]`
  - `label` (flex-grow, can wrap vertically)
    - `span.alloc-label-text` (the investment label text)
  - Optional: `div.alloc-holds-control.visualization-control`
    - `span.pseudo-select.alloc-holds-toggle` (DropdownUtils toggle)
    - `div.visualization-dropdown` (DropdownUtils menu)
    - `input[type="hidden"]` (stores the selected baseKey under a persisted parameter id)
  - `div.percentage-container` (fixed-width)
    - `input.percentage` (the allocation percent input)

Notes:

- The **holds dropdown is not inside the `<label>`**. This prevents clicks on the dropdown from focusing the `%` input.
- For pension contribution rows, the same `data-allocations-row="true"` attribute is applied so sizing/alignment rules match, but those rows do not currently embed a holds selector (only the investment allocation rows do).

## CSS: alignment and “only label wraps”

The `input-wrapper` rows are flex containers. In allocations rows:

- **Row never wraps**: `flex-wrap: nowrap`
- **Label grows** to take available space: `label { flex: 1 1 auto; min-width: 0; }`
- **Controls do not shrink**:
  - `%` container is pinned with `flex: 0 0 <width>`
  - holds control and pseudo-select toggles use `flex-shrink: 0`
- **Label text default**:
  - `span.alloc-label-text { white-space: nowrap; overflow: hidden; }`
  - This keeps the label single-line by default.

### Wrap styling

When wrap mode is triggered, JS adds `.alloc-wrap` to `span.alloc-label-text`, and CSS switches:

- `white-space: normal`
- slightly smaller font (configured in the `.alloc-wrap` rule)
- max two visible lines (via max-height + overflow)
- `overflow-wrap: anywhere` / `word-break: break-word` to avoid pathological long tokens

## JS: determining when to wrap (no early font shrink)

Wrapping is driven by `WebUI._refreshAllocationsLabelLayout()`:

1. Runs via `requestAnimationFrame(...)` to measure widths after layout is settled.
2. Fits the holds selector width first (so label width is measured after the holds control takes its final space).
3. Forces the label into **normal mode** before measuring:
   - removes `.alloc-wrap`
   - restores the original text to a single text node
4. Computes `needsWrap` based on a hidden “measurer” span:
   - Applies the label’s computed font/letter-spacing to the measurer
   - Measures `textW` (rendered text width) and compares it to `boxW` (available label width)
5. Only if `textW > boxW` does it enter wrap mode.

This avoids “early wrap triggers” that can happen when using `scrollWidth/clientWidth` directly (which can behave oddly under subpixel rounding and overflow settings).

## JS: making “wrap mode” visible (hard break)

When wrap mode is triggered, it must not be possible to apply wrap styling (smaller font) without the label visibly wrapping.

To guarantee this, the implementation:

- Adds `.alloc-wrap` to the label text span, and
- Inserts a `<br>` at a computed split point:
  - Prefer the last whitespace that keeps line 1 within the available width
  - Otherwise fall back to a character index
  - Worst case: force a mid-string split so a `<br>` is always present in wrap mode

Because a `<br>` is inserted, “wrap mode” always produces a visible wrap (at least two visual lines), keeping the font reduction and wrap behavior structurally tied.

## Holds selector: options, sizing, and persistence

### Options source

The holds selector options are derived from global base types:

- `Config.getInstance().getInvestmentBaseTypes()`
  - backed by `src/core/config/tax-rules-global.json` (`investmentBaseTypes`)

### Which parameter IDs store the selection

The holds selector stores the selected baseKey in existing strategy parameter keys:

- **Global mode (per-country OFF)**: `GlobalMixConfig_<baseKey>_asset1`
  - example: `GlobalMixConfig_indexFunds_asset1 = "globalEquity"`
- **Per-country mode (per-country ON)**: `MixConfig_<country>_<baseKey>_asset1`
  - example: `MixConfig_ie_indexFunds_asset1 = "globalEquity"`

These keys are already persisted by `src/core/Utils.js` via its `[id^="MixConfig_"]` and `[id^="GlobalMixConfig_"]` scanning logic, so the holds choice round-trips through CSV without introducing new key families.

### Width fitting (selected value)

The selected-value “box” for holds is a `pseudo-select` toggle. The width is adjusted dynamically:

- `WebUI._fitAllocHoldsToggleWidth(toggleSpan)` measures the selected label text width and clamps it to a reasonable min/max.
- `_refreshAllocationsLabelLayout()` calls this before label-wrap measurement so the label width reflects the final holds width.

## Per-country vs global allocations rendering

The Allocations panel renders different parameter IDs depending on the Per-Country toggle:

- **Per-country OFF**:
  - Allocation percentages use `GlobalAllocation_<baseKey>`
  - Chips are hidden
- **Per-country ON**:
  - Allocation percentages use `InvestmentAllocation_<country>_<baseKey>`
  - Chips appear only when relocation is enabled and MV-* events are present

The layout rules described in this document apply to the investment allocation rows in both modes.

## Economic Data Source

Investment wrappers displayed in the Allocations panel may inherit economic behavior from global base assets:

- **Inheriting wrappers** (`baseRef` present): Growth/volatility defined by asset-level parameters in Economy panel
- **Local wrappers** (no `baseRef`): Growth/volatility defined per-wrapper in Economy panel (per-country rows)

The "Holds" selector (when present) shows which global asset a wrapper inherits from.

## Notes for future extension

- This layout is currently scoped to the Allocations panel using `data-allocations-row="true"`.
- If the same compact layout is rolled out to other panels, prefer:
  - adding an explicit “compact row” marker attribute, and
  - keeping fixed-width input columns via `flex: 0 0 <width>` so alignment remains stable.
