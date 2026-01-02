# Money Performance Baseline

## Microbenchmarks (Money hot paths)

### `TestMoneyUnitOps` (adaptive iterations, 7 trials)
- Plain numbers: 131ms (64,000,000 iters)
- Plain object `.amount`: 171ms (64,000,000 iters)
- Money struct `.amount`: 171ms (64,000,000 iters)
- Money static helpers (`Money.add`/`Money.multiply`): 163ms (800,000 iters)

## Simulation Benchmarks

### `TestMoneyMCPerformance` (100 MC runs × 5 years)
- Total: 83ms
- Avg per run: 0.83ms

### `TestMonteCarloValidation` (8 runs × 2500 sims per run)
- Total: 11,969ms
- Simulations: 20,000
- Avg per simulation: 0.5985ms

## Conclusion
Money refactor meets performance thresholds in the existing benchmark suite.

