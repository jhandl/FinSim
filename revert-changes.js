#!/usr/bin/env node
/**
 * revert-changes.js
 * 
 * STRICT revert script for Codex transcript diffs
 * 
 * KEY INSIGHT: The Codex diff format has:
 * 1. Multiple HUNKS within a single edit (separated by ⋮)
 * 2. Within a hunk, - lines show old content, + lines show new content
 * 3. Line numbers are relative to their respective file states
 * 
 * This script:
 * 1. Parses hunks separately (split on ⋮)
 * 2. Within each hunk, groups +/- lines into replacement operations  
 * 3. Processes edits in REVERSE order (last edit first)
 * 4. Within each edit, processes hunks from bottom to top
 * 5. Maintains in-memory file state for dry-run accuracy
 * 
 * Usage: node revert-changes.js <changes-file> [--dry-run] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function normalizeLine(line) {
  if (line === undefined || line === null) return '';
  return String(line).replace(/\t/g, '  ').trimEnd();
}

function linesMatch(actual, expected) {
  const normA = normalizeLine(actual);
  const normE = normalizeLine(expected);
  if (normA === normE) return true;

  const collapsedA = normA.replace(/\s+/g, ' ').trim();
  const collapsedE = normE.replace(/\s+/g, ' ').trim();
  return collapsedA === collapsedE;
}

/**
 * Parse Codex transcript to extract Edited/Added entries
 */
function parseChangesFile(content) {
  const lines = content.split('\n');
  const changes = [];
  let current = null;
  let buffer = [];

  function flush() {
    if (current && buffer.length > 0) {
      current.rawDiff = buffer.slice();
      buffer = [];
    }
  }

  for (const line of lines) {
    const editMatch = line.match(/^• Edited (.+?) \(([+-]\d+) ([+-]\d+)\)$/);
    const addMatch = line.match(/^• Added (.+?) \(([+-]\d+) ([+-]\d+)\)$/);

    if (editMatch || addMatch) {
      flush();
      if (current) changes.push(current);
      const m = editMatch || addMatch;
      current = { action: editMatch ? 'Edited' : 'Added', file: m[1], rawDiff: [] };
      continue;
    }

    // End on other entry types
    if (line.startsWith('• ') || line.startsWith('› ') || line.startsWith('■ ') || line.match(/^─/)) {
      if (current && line.startsWith('• ')) {
        flush();
        changes.push(current);
        current = null;
      }
      continue;
    }

    if (line === '') continue;
    if (current) buffer.push(line);
  }

  flush();
  if (current) changes.push(current);
  return changes;
}

/**
 * Split raw diff into separate hunks (separated by ⋮)
 */
function splitIntoHunks(rawDiff) {
  const hunks = [];
  let currentHunk = [];

  for (const line of rawDiff) {
    if (line.includes('⋮')) {
      if (currentHunk.length > 0) {
        hunks.push(currentHunk);
        currentHunk = [];
      }
      continue;
    }
    currentHunk.push(line);
  }

  if (currentHunk.length > 0) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Parse a single hunk's lines into { adds, removes }
 */
function parseHunk(hunkLines) {
  const adds = [];
  const removes = [];

  for (const line of hunkLines) {
    const match = line.match(/^\s+(\d+)\s*([+-])?(.*)$/);
    if (!match) continue;

    const lineNum = parseInt(match[1]);
    const type = match[2];
    const content = match[3] || '';

    if (type === '+') {
      adds.push({ lineNum, content });
    } else if (type === '-') {
      removes.push({ lineNum, content });
    }
    // Ignore context lines for now
  }

  return { adds, removes };
}

function getFileLines(filePath, fileCache, projectDir) {
  const fullPath = path.join(projectDir, filePath);
  if (!fileCache.has(filePath)) {
    if (!fs.existsSync(fullPath)) return null;
    fileCache.set(filePath, fs.readFileSync(fullPath, 'utf8').split('\n'));
  }
  return fileCache.get(filePath);
}

/**
 * Revert a single hunk
 * Returns true on success, false on verification failure
 */
function revertHunk(fileLines, adds, removes) {
  // TO REVERT:
  // - The file currently contains the + lines at their specified positions
  // - We need to remove the + lines and insert the - lines

  if (adds.length > 0) {
    // Verify + lines exist where expected
    for (const add of adds) {
      const idx = add.lineNum - 1;
      if (idx < 0 || idx >= fileLines.length) {
        console.log(`  ❌ Line ${add.lineNum} out of range (file has ${fileLines.length} lines)`);
        return false;
      }
      if (!linesMatch(fileLines[idx], add.content)) {
        console.log(`  ❌ Line ${add.lineNum} mismatch`);
        console.log(`     Expected: "${add.content.substring(0, 55)}${add.content.length > 55 ? '...' : ''}"`);
        console.log(`     Actual:   "${fileLines[idx].substring(0, 55)}${fileLines[idx].length > 55 ? '...' : ''}"`);
        return false;
      }
    }

    // Sort adds by line number descending for safe removal
    const sortedAdds = [...adds].sort((a, b) => b.lineNum - a.lineNum);

    for (const add of sortedAdds) {
      if (DRY_RUN) {
        console.log(`  [DRY-RUN] Remove L${add.lineNum}: "${fileLines[add.lineNum - 1].substring(0, 45)}..."`);
      }
      fileLines.splice(add.lineNum - 1, 1);
    }

    // Insert removes at the position of the FIRST add (smallest line number)
    if (removes.length > 0) {
      const insertAt = Math.min(...adds.map(a => a.lineNum)) - 1;
      const toInsert = removes.map(r => r.content);

      for (let i = 0; i < toInsert.length; i++) {
        if (DRY_RUN) {
          console.log(`  [DRY-RUN] Insert L${insertAt + 1 + i}: "${toInsert[i].substring(0, 45)}..."`);
        }
      }

      fileLines.splice(insertAt, 0, ...toInsert);
    }
  } else if (removes.length > 0) {
    // Only removals - these lines were deleted, need to restore
    const insertAt = removes[0].lineNum - 1;
    const toInsert = removes.map(r => r.content);

    for (let i = 0; i < toInsert.length; i++) {
      if (DRY_RUN) {
        console.log(`  [DRY-RUN] Insert L${insertAt + 1 + i}: "${toInsert[i].substring(0, 45)}..."`);
      }
    }

    fileLines.splice(insertAt, 0, ...toInsert);
  }

  return true;
}

function revertChange(change, projectDir, fileCache) {
  console.log(`\n📝 ${change.action} ${change.file}`);

  if (change.action === 'Added') {
    const fullPath = path.join(projectDir, change.file);
    if (!fs.existsSync(fullPath) && !fileCache.has(change.file)) {
      console.log(`  ⚠ File doesn't exist (already deleted?)`);
      return true;
    }
    fileCache.delete(change.file);
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would delete file`);
    } else {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      console.log(`  ✓ Deleted`);
    }
    return true;
  }

  let fileLines = getFileLines(change.file, fileCache, projectDir);
  if (!fileLines) {
    console.log(`  ❌ File not found`);
    return false;
  }
  fileLines = [...fileLines]; // Clone for modification

  const hunks = splitIntoHunks(change.rawDiff);
  if (hunks.length === 0) {
    console.log(`  ⚠ No hunks`);
    return true;
  }

  if (VERBOSE) {
    console.log(`  [DEBUG] ${hunks.length} hunk(s)`);
  }

  // Parse all hunks first
  const parsedHunks = hunks.map(parseHunk);

  // Sort hunks by their starting line number (descending) to process bottom-up
  parsedHunks.sort((a, b) => {
    const aLine = a.adds.length > 0 ? a.adds[0].lineNum : (a.removes.length > 0 ? a.removes[0].lineNum : 0);
    const bLine = b.adds.length > 0 ? b.adds[0].lineNum : (b.removes.length > 0 ? b.removes[0].lineNum : 0);
    return bLine - aLine;
  });

  for (const hunk of parsedHunks) {
    if (!revertHunk(fileLines, hunk.adds, hunk.removes)) {
      return false;
    }

    if (!DRY_RUN && (hunk.adds.length > 0 || hunk.removes.length > 0)) {
      const line = hunk.adds.length > 0 ? hunk.adds[0].lineNum : hunk.removes[0].lineNum;
      console.log(`  ✓ Hunk at L${line}: -${hunk.adds.length} +${hunk.removes.length}`);
    }
  }

  fileCache.set(change.file, fileLines);
  return true;
}

function writeAllFiles(fileCache, projectDir) {
  for (const [filePath, lines] of fileCache) {
    const fullPath = path.join(projectDir, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, lines.join('\n'));
    console.log(`  ✓ ${filePath}`);
  }
}

function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));

  if (args.length === 0) {
    console.log('Usage: node revert-changes.js <changes-file> [--dry-run] [--verbose]');
    console.log('\nSTRICT mode - lines must match exactly at specified positions');
    console.log('IN-MEMORY - tracks file state as edits are applied');
    process.exit(1);
  }

  const changesFile = path.resolve(args[0]);
  const projectDir = path.resolve(path.dirname(changesFile), '..');

  if (!fs.existsSync(changesFile)) {
    console.error(`❌ Not found: ${changesFile}`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  REVERT CHANGES (STRICT MODE)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📂 ${changesFile}`);
  if (DRY_RUN) console.log('⚠️  DRY-RUN');

  const changes = parseChangesFile(fs.readFileSync(changesFile, 'utf8'));
  console.log(`\n📋 ${changes.length} edit(s):`);

  const reversed = [...changes].reverse();
  reversed.forEach((c, i) => console.log(`  ${i + 1}. ${c.action} ${c.file}`));

  console.log('\n═══════════════════════════════════════════════════════════════');

  const fileCache = new Map();
  let failed = null;

  for (let i = 0; i < reversed.length; i++) {
    console.log(`\n─── ${i + 1}/${reversed.length} ───`);
    if (!revertChange(reversed[i], projectDir, fileCache)) {
      failed = i + 1;
      break;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');

  if (!failed) {
    if (DRY_RUN) {
      console.log(`✅ Dry run OK (${fileCache.size} files)`);
    } else {
      writeAllFiles(fileCache, projectDir);
      console.log('\n✅ All reverted');
    }
  } else {
    console.log(`⛔ Failed at ${failed}/${reversed.length}`);
    process.exit(1);
  }
}

main();
