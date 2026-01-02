# Individual Test Quality Evaluation

You are evaluating a single test file from a financial simulation test suite. 

## Context

This test suite validates a personal finance simulator that models income, taxes, investments, and life events over multi-decade time horizons. Tests define scenarios (parameters + events) and assertions against simulation output.

## Input

You will receive:
1. The contents of one test file
2. (Optional) Project documentation for context

## Task

Analyze the test and produce a JSON evaluation against these criteria:

### Quality Dimensions (score 1-5, with justification)

1. **Specificity**: Does the test focus on one identifiable behavior/calculation, or does it test many things at once?
   - 5 = Tests exactly one thing (e.g., "USC exemption at €13,000 threshold")
   - 1 = Tests dozens of unrelated behaviors in one file

2. **Isolation**: If this test fails, how easy is it to identify the broken component?
   - 5 = Failure pinpoints exact function/calculation
   - 1 = Failure could be caused by any of 10+ components

3. **Oracle Quality**: How confident can we be that the expected values are correct?
   - 5 = Expected values derived from first principles or external specification
   - 3 = Expected values are "golden" outputs (detect change, not correctness)
   - 1 = Expected values appear arbitrary or unexplained

4. **Boundary Coverage**: Does the test exercise edge cases, limits, and thresholds?
   - 5 = Systematically tests boundaries (zero, min, max, threshold ±1)
   - 1 = Only tests "happy path" middle values

5. **Temporal Coverage**: Does the test exercise different simulation phases?
   - 5 = Tests early career, mid-career, retirement, and transitions
   - 3 = Tests only one phase but does it thoroughly
   - 1 = Single point-in-time check

6. **Mutation Resistance**: Would subtle bugs (off-by-one, wrong operator, missing condition) cause this test to fail?
   - 5 = High confidence that bugs would be caught
   - 1 = Coarse-grained checks that would miss subtle errors

7. **Maintainability**: When tax rules or system behavior changes, how easy is it to update this test?
   - 5 = Clear documentation, parameterized expectations, update notes
   - 1 = Magic numbers with no explanation

## Output Format

```json
{
  "testName": "<name from module.exports or filename>",
  "testFile": "<filename>",
  "category": "<category if specified, else 'uncategorized'>",
  "scores": {
    "specificity": { "score": 1-5, "justification": "..." },
    "isolation": { "score": 1-5, "justification": "..." },
    "oracleQuality": { "score": 1-5, "justification": "..." },
    "boundaryCoverage": { "score": 1-5, "justification": "..." },
    "temporalCoverage": { "score": 1-5, "justification": "..." },
    "mutationResistance": { "score": 1-5, "justification": "..." },
    "maintainability": { "score": 1-5, "justification": "..." }
  },
  "overallScore": "<average of scores, 1 decimal>",
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "recommendations": ["...", "..."]
}
```

Provide ONLY the JSON output, no additional commentary.
