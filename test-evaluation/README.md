# Test Evaluation System

A hierarchical prompt system for evaluating the FinSim test suite using AI agents.

## Overview

This system decomposes test evaluation into three tiers that can be run independently and in parallel where possible:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Test Evaluation Pipeline                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                     │
│  │ Test 1   │   │ Test 2   │   │ Test N   │                     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                     │
│       │              │              │                            │
│       ▼              ▼              ▼                            │
│  ┌─────────────────────────────────────────┐                    │
│  │     Tier 1: Quality Evaluation          │  (parallel)        │
│  │     Tier 2: Metadata Extraction         │  (parallel)        │
│  └─────────────────────────────────────────┘                    │
│       │              │              │                            │
│       ▼              ▼              ▼                            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                     │
│  │ T1 JSON  │   │ T1 JSON  │   │ T1 JSON  │                     │
│  │ T2 JSON  │   │ T2 JSON  │   │ T2 JSON  │                     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                     │
│       │              │              │                            │
│       └──────────────┼──────────────┘                            │
│                      ▼                                           │
│            ┌─────────────────┐                                   │
│            │  Aggregate JSONs │                                  │
│            └────────┬────────┘                                   │
│                     ▼                                            │
│         ┌────────────────────────┐                               │
│         │ Tier 3: Battery Analysis│                              │
│         └────────────────────────┘                               │
│                     │                                            │
│                     ▼                                            │
│         ┌────────────────────────┐                               │
│         │  Final Report (MD)      │                              │
│         └────────────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prompt Files

| File | Purpose | Input | Output |
|------|---------|-------|--------|
| [tier1-individual-quality.md](tier1-individual-quality.md) | Evaluate individual test quality | One test file | Quality scores JSON |
| [tier2-metadata-extraction.md](tier2-metadata-extraction.md) | Extract test metadata for aggregation | One test file | Metadata JSON |
| [tier3-battery-analysis.md](tier3-battery-analysis.md) | Analyze complete test suite | Array of Tier 2 JSONs | Analysis report (MD) |

## Usage

### Step 1: Run Tier 1 & 2 in Parallel

For each test file in `tests/`:
1. Feed the test file contents to an agent with the Tier 1 prompt → save as `<testname>-quality.json`
2. Feed the test file contents to an agent with the Tier 2 prompt → save as `<testname>-metadata.json`

These can run in parallel across all test files.

### Step 2: Aggregate Tier 2 Outputs

Combine all `*-metadata.json` files into a single array:
```bash
jq -s '.' tests/evaluation/*-metadata.json > tests/evaluation/all-metadata.json
```

### Step 3: Run Tier 3 Analysis

Feed the aggregated metadata to an agent with the Tier 3 prompt. Optionally include a summary of Tier 1 scores.

Output: A comprehensive battery analysis report in markdown.

## Automated Pipeline

The `run-evaluation.js` script automates the entire evaluation process using Codex CLI.

### Prerequisites

- Node.js installed
- Codex CLI installed and authenticated (`codex login`)

### Basic Usage

```bash
# Run full evaluation (all tiers, all tests)
node docs/test-evaluation/run-evaluation.js

# Check current progress without running anything
node docs/test-evaluation/run-evaluation.js --status

# Reset progress and start fresh
node docs/test-evaluation/run-evaluation.js --reset
```

### Resumable Execution

The script saves progress to `results/progress.json` after each test. When you hit a quota limit, it exits gracefully and can be resumed later:

```bash
# First run - processes until quota exceeded
$ node docs/test-evaluation/run-evaluation.js
...
⚠ Quota exceeded after 12 tests.
  Run the script again when your quota is replenished.

# Later - resume from where you left off
$ node docs/test-evaluation/run-evaluation.js
Resuming from saved progress...
Tier 1: Quality Evaluation (12 done, 73 remaining)
...
```

### Options

```bash
# Use a specific model
node docs/test-evaluation/run-evaluation.js --model o3

# Evaluate only a specific test
node docs/test-evaluation/run-evaluation.js --only TestBoundaryConditions

# Skip specific tiers
node docs/test-evaluation/run-evaluation.js --skip-tier1  # Skip quality evaluation
node docs/test-evaluation/run-evaluation.js --skip-tier3  # Only run individual analyses

# Verbose output (see Codex responses)
node docs/test-evaluation/run-evaluation.js --verbose

# Custom paths
node docs/test-evaluation/run-evaluation.js \
  --tests-dir ./tests \
  --output-dir ./evaluation-results
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (all complete, or complete with no failures) |
| 1 | Completed with failures (some tests failed to evaluate) |
| 2 | Quota exceeded (resume later) |

### Output Structure

```
docs/test-evaluation/results/
├── progress.json                # State file for resumable execution
├── tier1/
│   ├── TestBoundaryConditions-quality.json
│   ├── TestRegression-quality.json
│   └── ...
├── tier2/
│   ├── TestBoundaryConditions-metadata.json
│   ├── TestRegression-metadata.json
│   └── ...
├── all-quality-scores.json      # Aggregated Tier 1 results
├── all-metadata.json            # Aggregated Tier 2 results
├── battery-analysis.md          # Tier 3 comprehensive report
└── summary.md                   # Execution summary with progress
```

---

## Quality Dimensions (Tier 1)

| Dimension | What it measures |
|-----------|------------------|
| Specificity | Focus on one behavior vs. testing many things |
| Isolation | Ease of identifying broken component on failure |
| Oracle Quality | Confidence that expected values are correct |
| Boundary Coverage | Edge cases, limits, thresholds tested |
| Temporal Coverage | Lifecycle phases exercised |
| Mutation Resistance | Would subtle bugs be caught? |
| Maintainability | Ease of updating when rules change |

## Coverage Dimensions (Tier 3)

| Dimension | Examples |
|-----------|----------|
| Feature Coverage | Income tax, PRSI, USC, pension, CGT, FX, relocation |
| Country Coverage | IE, AR, IE→AR relocation |
| Lifecycle Coverage | Early career, mid-career, retirement |
| Boundary Coverage | Tax thresholds, age thresholds, zero/max values |
| Test Pyramid | Unit vs. integration vs. system tests |
