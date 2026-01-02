#!/usr/bin/env node

/**
 * Test Evaluation Pipeline (Resumable)
 * 
 * Uses Codex CLI to run hierarchical test evaluations:
 * - Tier 1: Individual test quality evaluation
 * - Tier 2: Metadata extraction for aggregation
 * - Tier 3: Battery-level analysis
 * 
 * The script maintains state in progress.json to support resumable execution
 * when hitting API quota limits.
 * 
 * Usage:
 *   node run-evaluation.js [options]
 * 
 * Options:
 *   --tests-dir <path>    Path to tests directory (default: ../../tests)
 *   --output-dir <path>   Output directory for results (default: ./results)
 *   --concurrency <n>     Max concurrent Codex calls (default: 1)
 *   --model <model>       Model to use (default: o4-mini)
 *   --skip-tier1          Skip Tier 1 quality evaluation
 *   --skip-tier2          Skip Tier 2 metadata extraction
 *   --skip-tier3          Skip Tier 3 battery analysis
 *   --only <test>         Only evaluate a specific test file
 *   --reset               Clear progress and start fresh
 *   --status              Show current progress and exit
 *   --verbose             Show detailed progress
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  testsDir: path.resolve(__dirname, '../../tests'),
  outputDir: path.resolve(__dirname, './results'),
  promptsDir: __dirname,
  concurrency: 1,  // Default to 1 to be gentle on quota
  model: 'o4-mini',
  skipTier1: false,
  skipTier2: false,
  skipTier3: false,
  only: null,
  reset: false,
  status: false,
  verbose: false,
};

// Progress state
const STATE_FILE = 'progress.json';
let state = {
  startedAt: null,
  lastRunAt: null,
  tier1: {
    completed: [],  // Test files successfully processed
    failed: [],     // Test files that failed (with error)
  },
  tier2: {
    completed: [],
    failed: [],
  },
  tier3: {
    completed: false,
    failed: false,
    error: null,
  },
  quotaExceeded: false,
  quotaExceededAt: null,
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tests-dir':
        CONFIG.testsDir = path.resolve(args[++i]);
        break;
      case '--output-dir':
        CONFIG.outputDir = path.resolve(args[++i]);
        break;
      case '--concurrency':
        CONFIG.concurrency = parseInt(args[++i], 10);
        break;
      case '--model':
        CONFIG.model = args[++i];
        break;
      case '--skip-tier1':
        CONFIG.skipTier1 = true;
        break;
      case '--skip-tier2':
        CONFIG.skipTier2 = true;
        break;
      case '--skip-tier3':
        CONFIG.skipTier3 = true;
        break;
      case '--only':
        CONFIG.only = args[++i];
        break;
      case '--reset':
        CONFIG.reset = true;
        break;
      case '--status':
        CONFIG.status = true;
        break;
      case '--verbose':
        CONFIG.verbose = true;
        break;
      case '--help':
        console.log(`
Test Evaluation Pipeline (Resumable)

Usage: node run-evaluation.js [options]

Options:
  --tests-dir <path>    Path to tests directory (default: ../../tests)
  --output-dir <path>   Output directory for results (default: ./results)
  --concurrency <n>     Max concurrent Codex calls (default: 1)
  --model <model>       Model to use (default: o4-mini)
  --skip-tier1          Skip Tier 1 quality evaluation
  --skip-tier2          Skip Tier 2 metadata extraction
  --skip-tier3          Skip Tier 3 battery analysis
  --only <test>         Only evaluate a specific test file
  --reset               Clear progress and start fresh
  --status              Show current progress and exit
  --verbose             Show detailed progress

State Management:
  Progress is saved to results/progress.json after each test.
  If quota is exceeded, the script exits gracefully and can be resumed later.
  Use --reset to start over from scratch.
  Use --status to see current progress without running anything.
`);
        process.exit(0);
    }
  }
}

// Load state from file
async function loadState() {
  const stateFile = path.join(CONFIG.outputDir, STATE_FILE);
  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    state = JSON.parse(data);
    console.log('Resuming from saved progress...\n');
  } catch (e) {
    // No state file, starting fresh
    state.startedAt = new Date().toISOString();
  }
  state.lastRunAt = new Date().toISOString();
  state.quotaExceeded = false;  // Reset quota flag on new run
}

// Save state to file
async function saveState() {
  const stateFile = path.join(CONFIG.outputDir, STATE_FILE);
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

// Reset state
async function resetState() {
  state = {
    startedAt: new Date().toISOString(),
    lastRunAt: new Date().toISOString(),
    tier1: { completed: [], failed: [] },
    tier2: { completed: [], failed: [] },
    tier3: { completed: false, failed: false, error: null },
    quotaExceeded: false,
    quotaExceededAt: null,
  };
  await saveState();
  console.log('Progress reset.\n');
}

// Show status
async function showStatus(testFiles) {
  console.log('Current Progress');
  console.log('================\n');

  console.log(`Started: ${state.startedAt || 'Never'}`);
  console.log(`Last run: ${state.lastRunAt || 'Never'}`);

  if (state.quotaExceededAt) {
    console.log(`Quota exceeded at: ${state.quotaExceededAt}`);
  }

  console.log('\nTier 1 (Quality Evaluation):');
  console.log(`  Completed: ${state.tier1.completed.length}/${testFiles.length}`);
  console.log(`  Failed: ${state.tier1.failed.length}`);
  console.log(`  Remaining: ${testFiles.length - state.tier1.completed.length - state.tier1.failed.length}`);

  console.log('\nTier 2 (Metadata Extraction):');
  console.log(`  Completed: ${state.tier2.completed.length}/${testFiles.length}`);
  console.log(`  Failed: ${state.tier2.failed.length}`);
  console.log(`  Remaining: ${testFiles.length - state.tier2.completed.length - state.tier2.failed.length}`);

  console.log('\nTier 3 (Battery Analysis):');
  console.log(`  Status: ${state.tier3.completed ? 'Complete' : state.tier3.failed ? 'Failed' : 'Pending'}`);
  if (state.tier3.error) {
    console.log(`  Error: ${state.tier3.error}`);
  }

  // Calculate overall progress
  const totalTasks = testFiles.length * 2 + 1;  // tier1 + tier2 + tier3
  const completedTasks = state.tier1.completed.length + state.tier2.completed.length + (state.tier3.completed ? 1 : 0);
  const progressPercent = Math.round((completedTasks / totalTasks) * 100);

  console.log(`\nOverall Progress: ${completedTasks}/${totalTasks} (${progressPercent}%)`);

  if (state.tier1.failed.length > 0) {
    console.log('\nFailed Tier 1 tests:');
    for (const f of state.tier1.failed) {
      console.log(`  - ${f.file}: ${f.error}`);
    }
  }

  if (state.tier2.failed.length > 0) {
    console.log('\nFailed Tier 2 tests:');
    for (const f of state.tier2.failed) {
      console.log(`  - ${f.file}: ${f.error}`);
    }
  }
}

// Check if error indicates quota exceeded
function isQuotaError(error) {
  const quotaPatterns = [
    /quota/i,
    /rate.?limit/i,
    /too.?many.?requests/i,
    /exceeded/i,
    /throttl/i,
    /429/,
  ];
  return quotaPatterns.some(p => p.test(error));
}

// Run a Codex command and return the output
async function runCodex(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--model', CONFIG.model,
      '--skip-git-repo-check',
    ];

    if (options.outputFile) {
      args.push('--output-last-message', options.outputFile);
    }

    const proc = spawn('codex', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: CONFIG.testsDir,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      if (CONFIG.verbose) {
        process.stdout.write(data);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      if (CONFIG.verbose) {
        process.stderr.write(data);
      }
    });

    // Send the prompt via stdin
    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code !== 0) {
        const error = stderr || stdout || `Exit code ${code}`;
        reject(new Error(error));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// Extract JSON from markdown code blocks or raw text
function extractJson(text) {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      // Continue to try other methods
    }
  }

  // Try to parse the entire text as JSON
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Try to find JSON object/array in the text
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        throw new Error(`Failed to extract JSON from response: ${e2.message}`);
      }
    }
    throw new Error(`No JSON found in response`);
  }
}

// Get list of test files
async function getTestFiles() {
  const files = await fs.readdir(CONFIG.testsDir);
  let testFiles = files.filter(f =>
    f.endsWith('.js') &&
    (f.startsWith('Test') || f.endsWith('.test.js'))
  );

  // Exclude spec files (Playwright) as they're not standard scenario tests
  testFiles = testFiles.filter(f => !f.endsWith('.spec.js'));

  if (CONFIG.only) {
    testFiles = testFiles.filter(f => f.includes(CONFIG.only));
  }

  return testFiles.sort();  // Sort for consistent ordering
}

// Run Tier 1 evaluation for a single test
async function runTier1(testFile, testContent) {
  // Check if already completed
  if (state.tier1.completed.includes(testFile)) {
    return { success: true, file: testFile, skipped: true };
  }

  const promptTemplate = await fs.readFile(
    path.join(CONFIG.promptsDir, 'tier1-individual-quality.md'),
    'utf-8'
  );

  const prompt = `${promptTemplate}

---

## Test File: ${testFile}

\`\`\`javascript
${testContent}
\`\`\`

Analyze this test and provide the JSON evaluation as specified above.`;

  const outputFile = path.join(CONFIG.outputDir, 'tier1', `${testFile.replace('.js', '')}-quality.json`);

  try {
    await runCodex(prompt, { outputFile });

    // Read the output file
    const output = await fs.readFile(outputFile, 'utf-8');
    const json = extractJson(output);

    // Validate and save cleaned JSON
    await fs.writeFile(outputFile, JSON.stringify(json, null, 2));

    // Update state
    state.tier1.completed.push(testFile);
    // Remove from failed if it was there
    state.tier1.failed = state.tier1.failed.filter(f => f.file !== testFile);
    await saveState();

    return { success: true, file: testFile, data: json };
  } catch (error) {
    const errorMsg = error.message;

    // Check for quota exceeded
    if (isQuotaError(errorMsg)) {
      state.quotaExceeded = true;
      state.quotaExceededAt = new Date().toISOString();
      await saveState();
      throw new Error('QUOTA_EXCEEDED');
    }

    // Record failure
    const existingIdx = state.tier1.failed.findIndex(f => f.file === testFile);
    if (existingIdx >= 0) {
      state.tier1.failed[existingIdx].error = errorMsg;
    } else {
      state.tier1.failed.push({ file: testFile, error: errorMsg });
    }
    await saveState();

    return { success: false, file: testFile, error: errorMsg };
  }
}

// Run Tier 2 metadata extraction for a single test
async function runTier2(testFile, testContent) {
  // Check if already completed
  if (state.tier2.completed.includes(testFile)) {
    return { success: true, file: testFile, skipped: true };
  }

  const promptTemplate = await fs.readFile(
    path.join(CONFIG.promptsDir, 'tier2-metadata-extraction.md'),
    'utf-8'
  );

  const prompt = `${promptTemplate}

---

## Test File: ${testFile}

\`\`\`javascript
${testContent}
\`\`\`

Extract the metadata as specified above and provide ONLY the JSON output.`;

  const outputFile = path.join(CONFIG.outputDir, 'tier2', `${testFile.replace('.js', '')}-metadata.json`);

  try {
    await runCodex(prompt, { outputFile });

    // Read the output file
    const output = await fs.readFile(outputFile, 'utf-8');
    const json = extractJson(output);

    // Validate and save cleaned JSON
    await fs.writeFile(outputFile, JSON.stringify(json, null, 2));

    // Update state
    state.tier2.completed.push(testFile);
    // Remove from failed if it was there
    state.tier2.failed = state.tier2.failed.filter(f => f.file !== testFile);
    await saveState();

    return { success: true, file: testFile, data: json };
  } catch (error) {
    const errorMsg = error.message;

    // Check for quota exceeded
    if (isQuotaError(errorMsg)) {
      state.quotaExceeded = true;
      state.quotaExceededAt = new Date().toISOString();
      await saveState();
      throw new Error('QUOTA_EXCEEDED');
    }

    // Record failure
    const existingIdx = state.tier2.failed.findIndex(f => f.file === testFile);
    if (existingIdx >= 0) {
      state.tier2.failed[existingIdx].error = errorMsg;
    } else {
      state.tier2.failed.push({ file: testFile, error: errorMsg });
    }
    await saveState();

    return { success: false, file: testFile, error: errorMsg };
  }
}

// Run Tier 3 battery analysis
async function runTier3() {
  if (state.tier3.completed) {
    console.log('  ⊘ Already completed (skipping)');
    return { success: true, skipped: true };
  }

  const promptTemplate = await fs.readFile(
    path.join(CONFIG.promptsDir, 'tier3-battery-analysis.md'),
    'utf-8'
  );

  // Load all tier2 metadata
  const tier2Dir = path.join(CONFIG.outputDir, 'tier2');
  const metadataFiles = await fs.readdir(tier2Dir);
  const metadataArray = [];

  for (const file of metadataFiles) {
    if (file.endsWith('-metadata.json')) {
      const content = await fs.readFile(path.join(tier2Dir, file), 'utf-8');
      try {
        metadataArray.push(JSON.parse(content));
      } catch (e) {
        console.warn(`  Warning: Could not parse ${file}`);
      }
    }
  }

  if (metadataArray.length === 0) {
    return { success: false, error: 'No tier2 metadata files found' };
  }

  // Load tier1 quality scores for summary
  let tier1Summary = null;
  const tier1Dir = path.join(CONFIG.outputDir, 'tier1');
  try {
    const qualityFiles = await fs.readdir(tier1Dir);
    tier1Summary = [];
    for (const file of qualityFiles) {
      if (file.endsWith('-quality.json')) {
        const content = await fs.readFile(path.join(tier1Dir, file), 'utf-8');
        try {
          const data = JSON.parse(content);
          tier1Summary.push({
            testFile: data.testFile || file.replace('-quality.json', '.js'),
            overallScore: data.overallScore,
            strengths: data.strengths,
            weaknesses: data.weaknesses,
          });
        } catch (e) {
          // Skip invalid files
        }
      }
    }
  } catch (e) {
    // No tier1 data
  }

  let prompt = `${promptTemplate}

---

## Aggregated Test Metadata

\`\`\`json
${JSON.stringify(metadataArray, null, 2)}
\`\`\`
`;

  if (tier1Summary && tier1Summary.length > 0) {
    prompt += `
## Tier 1 Quality Scores Summary

\`\`\`json
${JSON.stringify(tier1Summary, null, 2)}
\`\`\`
`;
  }

  prompt += `
Produce the comprehensive battery-level analysis as specified above.`;

  const outputFile = path.join(CONFIG.outputDir, 'battery-analysis.md');

  try {
    await runCodex(prompt, { outputFile });

    state.tier3.completed = true;
    state.tier3.failed = false;
    state.tier3.error = null;
    await saveState();

    return { success: true };
  } catch (error) {
    const errorMsg = error.message;

    // Check for quota exceeded
    if (isQuotaError(errorMsg)) {
      state.quotaExceeded = true;
      state.quotaExceededAt = new Date().toISOString();
      await saveState();
      throw new Error('QUOTA_EXCEEDED');
    }

    state.tier3.failed = true;
    state.tier3.error = errorMsg;
    await saveState();

    return { success: false, error: errorMsg };
  }
}

// Process tests sequentially with state saving
async function processTier(testFiles, testContents, tierName, processor) {
  const results = [];
  const total = testFiles.length;

  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];

    try {
      const result = await processor(file, testContents[file]);

      if (result.skipped) {
        console.log(`  ⊘ [${i + 1}/${total}] ${file} (already done)`);
      } else if (result.success) {
        console.log(`  ✓ [${i + 1}/${total}] ${file}`);
      } else {
        console.log(`  ✗ [${i + 1}/${total}] ${file}: ${result.error}`);
      }

      results.push(result);
    } catch (error) {
      if (error.message === 'QUOTA_EXCEEDED') {
        console.log(`\n⚠ Quota exceeded after ${i} tests.`);
        console.log('  Run the script again when your quota is replenished.');
        throw error;
      }
      throw error;
    }
  }

  return results;
}

// Generate summary report
async function generateSummaryReport(testFiles) {
  let report = `# Test Evaluation Report

Generated: ${new Date().toISOString()}
Started: ${state.startedAt}

## Progress Summary

`;

  // Tier 1 Summary
  report += `### Tier 1: Quality Evaluation

- **Completed**: ${state.tier1.completed.length}/${testFiles.length} tests
- **Failed**: ${state.tier1.failed.length} tests
- **Remaining**: ${testFiles.length - state.tier1.completed.length - state.tier1.failed.length} tests

`;

  if (state.tier1.completed.length > 0) {
    // Load and calculate averages
    const tier1Dir = path.join(CONFIG.outputDir, 'tier1');
    const avgScores = {};
    const dimensions = ['specificity', 'isolation', 'oracleQuality', 'boundaryCoverage',
      'temporalCoverage', 'mutationResistance', 'maintainability'];
    let overallScores = [];

    for (const file of state.tier1.completed) {
      try {
        const content = await fs.readFile(
          path.join(tier1Dir, `${file.replace('.js', '')}-quality.json`),
          'utf-8'
        );
        const data = JSON.parse(content);

        for (const dim of dimensions) {
          const score = data?.scores?.[dim]?.score;
          if (typeof score === 'number') {
            avgScores[dim] = avgScores[dim] || [];
            avgScores[dim].push(score);
          }
        }

        if (typeof data?.overallScore === 'number') {
          overallScores.push(data.overallScore);
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }

    if (Object.keys(avgScores).length > 0) {
      report += `#### Average Scores by Dimension

| Dimension | Average Score |
|-----------|---------------|
`;
      for (const dim of dimensions) {
        if (avgScores[dim]?.length > 0) {
          const avg = (avgScores[dim].reduce((a, b) => a + b, 0) / avgScores[dim].length).toFixed(1);
          report += `| ${dim} | ${avg}/5 |\n`;
        }
      }
      report += '\n';
    }

    if (overallScores.length > 0) {
      const avgOverall = (overallScores.reduce((a, b) => a + b, 0) / overallScores.length).toFixed(1);
      report += `**Overall Average Score**: ${avgOverall}/5\n\n`;
    }
  }

  if (state.tier1.failed.length > 0) {
    report += `#### Failed Evaluations

`;
    for (const f of state.tier1.failed) {
      report += `- ${f.file}: ${f.error}\n`;
    }
    report += '\n';
  }

  // Tier 2 Summary
  report += `### Tier 2: Metadata Extraction

- **Completed**: ${state.tier2.completed.length}/${testFiles.length} tests
- **Failed**: ${state.tier2.failed.length} tests
- **Remaining**: ${testFiles.length - state.tier2.completed.length - state.tier2.failed.length} tests

`;

  if (state.tier2.failed.length > 0) {
    report += `#### Failed Extractions

`;
    for (const f of state.tier2.failed) {
      report += `- ${f.file}: ${f.error}\n`;
    }
    report += '\n';
  }

  // Tier 3 Summary
  report += `### Tier 3: Battery Analysis

`;
  if (state.tier3.completed) {
    report += `Status: **Complete**

See [battery-analysis.md](./battery-analysis.md) for full report.

`;
  } else if (state.tier3.failed) {
    report += `Status: **Failed**

Error: ${state.tier3.error}

`;
  } else {
    report += `Status: **Pending**

`;
  }

  // Overall progress
  const totalTasks = testFiles.length * 2 + 1;
  const completedTasks = state.tier1.completed.length + state.tier2.completed.length + (state.tier3.completed ? 1 : 0);
  const progressPercent = Math.round((completedTasks / totalTasks) * 100);

  report += `## Overall Progress

**${completedTasks}/${totalTasks} tasks completed (${progressPercent}%)**

`;

  if (state.quotaExceededAt) {
    report += `> ⚠ Quota was exceeded at ${state.quotaExceededAt}. Resume by running the script again.\n`;
  }

  return report;
}

// Main execution
async function main() {
  parseArgs();

  console.log('Test Evaluation Pipeline (Resumable)');
  console.log('====================================\n');
  console.log(`Tests directory: ${CONFIG.testsDir}`);
  console.log(`Output directory: ${CONFIG.outputDir}`);
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Concurrency: ${CONFIG.concurrency}\n`);

  // Ensure output directories exist
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  await fs.mkdir(path.join(CONFIG.outputDir, 'tier1'), { recursive: true });
  await fs.mkdir(path.join(CONFIG.outputDir, 'tier2'), { recursive: true });

  // Handle reset
  if (CONFIG.reset) {
    await resetState();
  } else {
    await loadState();
  }

  // Get test files
  const testFiles = await getTestFiles();
  console.log(`Found ${testFiles.length} test files\n`);

  // Handle status
  if (CONFIG.status) {
    await showStatus(testFiles);
    process.exit(0);
  }

  if (testFiles.length === 0) {
    console.log('No test files found. Exiting.');
    process.exit(1);
  }

  // Load test contents
  const testContents = {};
  for (const file of testFiles) {
    testContents[file] = await fs.readFile(path.join(CONFIG.testsDir, file), 'utf-8');
  }

  let quotaExceeded = false;

  try {
    // Tier 1: Quality Evaluation
    if (!CONFIG.skipTier1) {
      const remaining = testFiles.filter(f => !state.tier1.completed.includes(f));
      if (remaining.length > 0) {
        console.log(`Tier 1: Quality Evaluation (${state.tier1.completed.length} done, ${remaining.length} remaining)`);
        console.log('-'.repeat(60));
        await processTier(testFiles, testContents, 'tier1', runTier1);
        console.log();
      } else {
        console.log('Tier 1: Quality Evaluation - All complete ✓\n');
      }
    }

    // Tier 2: Metadata Extraction
    if (!CONFIG.skipTier2) {
      const remaining = testFiles.filter(f => !state.tier2.completed.includes(f));
      if (remaining.length > 0) {
        console.log(`Tier 2: Metadata Extraction (${state.tier2.completed.length} done, ${remaining.length} remaining)`);
        console.log('-'.repeat(60));
        await processTier(testFiles, testContents, 'tier2', runTier2);
        console.log();
      } else {
        console.log('Tier 2: Metadata Extraction - All complete ✓\n');
      }
    }

    // Tier 3: Battery Analysis
    if (!CONFIG.skipTier3 && state.tier2.completed.length > 0) {
      console.log('Tier 3: Battery Analysis');
      console.log('-'.repeat(60));

      const result = await runTier3();

      if (result.skipped) {
        // Already logged
      } else if (result.success) {
        console.log('  ✓ Battery analysis complete');
      } else {
        console.log(`  ✗ Battery analysis failed: ${result.error}`);
      }

      console.log();
    }
  } catch (error) {
    if (error.message === 'QUOTA_EXCEEDED') {
      quotaExceeded = true;
    } else {
      throw error;
    }
  }

  // Generate summary report
  const summaryReport = await generateSummaryReport(testFiles);
  await fs.writeFile(path.join(CONFIG.outputDir, 'summary.md'), summaryReport);

  // Save aggregated metadata (from all completed tier2)
  if (state.tier2.completed.length > 0) {
    const allMetadata = [];
    const tier2Dir = path.join(CONFIG.outputDir, 'tier2');
    for (const file of state.tier2.completed) {
      try {
        const content = await fs.readFile(
          path.join(tier2Dir, `${file.replace('.js', '')}-metadata.json`),
          'utf-8'
        );
        allMetadata.push(JSON.parse(content));
      } catch (e) {
        // Skip files that can't be read
      }
    }
    await fs.writeFile(
      path.join(CONFIG.outputDir, 'all-metadata.json'),
      JSON.stringify(allMetadata, null, 2)
    );
  }

  // Save aggregated quality scores (from all completed tier1)
  if (state.tier1.completed.length > 0) {
    const allScores = [];
    const tier1Dir = path.join(CONFIG.outputDir, 'tier1');
    for (const file of state.tier1.completed) {
      try {
        const content = await fs.readFile(
          path.join(tier1Dir, `${file.replace('.js', '')}-quality.json`),
          'utf-8'
        );
        allScores.push(JSON.parse(content));
      } catch (e) {
        // Skip files that can't be read
      }
    }
    await fs.writeFile(
      path.join(CONFIG.outputDir, 'all-quality-scores.json'),
      JSON.stringify(allScores, null, 2)
    );
  }

  console.log('Results saved to:');
  console.log(`  - ${path.join(CONFIG.outputDir, 'summary.md')}`);
  console.log(`  - ${path.join(CONFIG.outputDir, 'progress.json')}`);
  if (state.tier2.completed.length > 0) {
    console.log(`  - ${path.join(CONFIG.outputDir, 'all-metadata.json')}`);
  }
  if (state.tier1.completed.length > 0) {
    console.log(`  - ${path.join(CONFIG.outputDir, 'all-quality-scores.json')}`);
  }
  if (state.tier3.completed) {
    console.log(`  - ${path.join(CONFIG.outputDir, 'battery-analysis.md')}`);
  }

  if (quotaExceeded) {
    console.log('\n⚠ Quota exceeded. Run the script again when quota is replenished.');
    process.exit(2);  // Special exit code for quota exceeded
  }

  // Calculate if fully complete
  const isComplete =
    state.tier1.completed.length === testFiles.length &&
    state.tier2.completed.length === testFiles.length &&
    state.tier3.completed;

  if (isComplete) {
    console.log('\n✓ All evaluations complete!');
  }

  // Exit with error if any failures (not counting quota)
  const hasFailures =
    state.tier1.failed.length > 0 ||
    state.tier2.failed.length > 0 ||
    state.tier3.failed;

  process.exit(hasFailures ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
