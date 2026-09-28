#!/usr/bin/env node
'use strict';

/**
 * Pre-commit hook for guardrails enforcement
 * Prevents commits that violate project guardrails
 *
 * Checks:
 * - Protected paths: blocks commits to paths requiring approval
 * - Forbidden actions: blocks commits containing dangerous patterns (e.g., hard-coded credentials)
 * - Minimum checks before merge
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync, spawnSync } = require('child_process');

const projectRoot = process.cwd();
const guardrailsPath = path.join(projectRoot, '.agent-room', 'guardrails.json');

// Allow override via env variable
const ALLOW_GUARDRAILS_BYPASS = process.env.GUARDRAILS_BYPASS || process.env.SKIP_GUARDRAILS_CHECK;

// A GUARDRAILS_BYPASS commit correctly prints a warning, but a terminal
// scrollback is not a durable record - the moment it scrolls, there's no
// trace of who overrode a guardrail, when, or what was being overridden.
// This log closes that gap. Not added to protectedPaths deliberately: the
// hook auto-stages its own edit to this file below, and protecting it would
// create a bypass-loop (staging the log entry would itself trip a
// protected-path violation on the same commit).
const BYPASS_LOG_REL = path.join('.agent-room', 'guardrails-bypass-log.md');
const BYPASS_LOG_HEADER = `# Guardrails Bypass Log — create-agent-room

Append-only, machine-written record of every commit that used
\`GUARDRAILS_BYPASS=1\` (or \`SKIP_GUARDRAILS_CHECK=1\`) to override a blocked
commit. Written automatically by \`.agent-room/hooks/guardrails-check.js\` -
do not edit by hand; edits here don't reflect what actually happened.

Review this periodically (or in code review) so bypasses stay visible
instead of scrolling off a terminal and being forgotten.

<!-- Entries below this line, newest first, appended automatically. -->
`;

function getGitIdentity() {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim() || 'unknown';
    const email = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim() || 'unknown';
    return `${name} <${email}>`;
  } catch (err) {
    return 'unknown';
  }
}

// Appends one entry and stages the log file itself, so the record becomes
// part of the very commit it's documenting rather than an orphaned
// working-tree change. Never lets a logging failure block the commit it's
// trying to record.
function logBypass(reasons) {
  try {
    const logPath = path.join(projectRoot, BYPASS_LOG_REL);
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, BYPASS_LOG_HEADER);
    }
    const reasonSuffix = process.env.GUARDRAILS_BYPASS_REASON ? ` | reason: ${process.env.GUARDRAILS_BYPASS_REASON}` : '';
    const entry = `- ${new Date().toISOString()} | author: ${getGitIdentity()}${reasonSuffix} | bypassed: ${reasons.join('; ')}\n`;
    fs.appendFileSync(logPath, entry);
    execFileSync('git', ['add', BYPASS_LOG_REL], { cwd: projectRoot });
  } catch (err) {
    // Logging the bypass must never be the reason a commit fails.
  }
}

if (!fs.existsSync(guardrailsPath)) {
  const headGuardrails = getHeadGuardrails();
  if (headGuardrails) {
    console.error('');
    console.error('❌ Anti-tamper violation: .agent-room/guardrails.json was deleted.');
    console.error('Commits that remove active guardrails are blocked to prevent rule tampering.');
    console.error('');
    console.error('To bypass guardrails (requires approval), use:');
    console.error('  GUARDRAILS_BYPASS=1 git commit');
    console.error('');
    if (!ALLOW_GUARDRAILS_BYPASS) {
      process.exit(1);
    }
    console.warn('⚠️  Guardrails bypass enabled - proceeding with commit');
    logBypass(['Anti-tamper violation: .agent-room/guardrails.json was deleted']);
    process.exit(0);
  }
  // No guardrails file, allow commit
  process.exit(0);
}

let guardrails = {};
try {
  guardrails = JSON.parse(fs.readFileSync(guardrailsPath, 'utf8'));
} catch (err) {
  console.error('');
  console.error(`❌ .agent-room/guardrails.json is broken and could not be parsed: ${err.message}`);
  console.error('Commits are blocked until this file is fixed (failing closed, since a');
  console.error('corrupted config must not silently disable guardrail enforcement).');
  console.error('');
  console.error('To bypass while you fix it, use:');
  console.error('  GUARDRAILS_BYPASS=1 git commit');
  console.error('');
  if (!ALLOW_GUARDRAILS_BYPASS) {
    process.exit(1);
  }
  console.warn('⚠️  Guardrails bypass enabled - proceeding with commit despite broken config');
  logBypass([`.agent-room/guardrails.json is broken and could not be parsed: ${err.message}`]);
  process.exit(0);
}

// Get staged files
let stagedFiles = [];
try {
  const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  stagedFiles = output.trim().split('\n').filter(Boolean);
} catch (err) {
  // Not a git repo or no staged files
  process.exit(0);
}

const protectedPaths = guardrails.protectedPaths || [];
const forbiddenPatterns = guardrails.forbiddenActions || [];

let violations = [];

// A repository's very first commit has nothing established yet to protect -
// the scaffolding tool creates the protected paths (e.g. CI workflows) in
// the same commit as guardrails.json itself. Protected-path review exists to
// gate *changes* to already-established infrastructure, not its initial
// creation, so it's skipped only for this one commit. Forbidden-pattern
// (secret) scanning below still applies regardless.
if (!isInitialCommit()) {
  for (const file of stagedFiles) {
    for (const protectedPath of protectedPaths) {
      if (isPathProtected(file, protectedPath)) {
        violations.push(`Protected path violation: ${file}`);
      }
    }
  }
}

// Self-protect & anti-tamper guardrails.json: the check above only evaluates staged files
// against the protectedPaths in the version of guardrails.json being committed.
// Compare staged rules against HEAD's guardrails configuration across all rule categories
// (protectedPaths, forbiddenActions, scopeGuidance, importBoundaries, scopeBoundaries,
// and verifyOnCommit) so that rule weakening or self-weakening is caught.
const guardrailsRelPath = path.relative(projectRoot, guardrailsPath).replace(/\\/g, '/');
if (stagedFiles.includes(guardrailsRelPath)) {
  const headGuardrails = getHeadGuardrails();
  if (headGuardrails) {
    const weakeningViolations = detectRuleWeakening(headGuardrails, guardrails, guardrailsRelPath);
    for (const wv of weakeningViolations) {
      violations.push(wv);
    }
  }
}

// The guardrails config/docs themselves legitimately contain the forbidden-
// pattern strings as data (that's how they're defined) - scanning their own
// content would always self-trigger, so they're exempt from this check.
const guardrailsSelfPaths = new Set(
  [guardrailsPath, path.join(projectRoot, '.agent-room', 'guardrails.md')].map((p) =>
    path.relative(projectRoot, p).replace(/\\/g, '/')
  )
);

// Check for forbidden patterns in staged content
for (const file of stagedFiles) {
  if (!fs.existsSync(file)) continue;
  if (guardrailsSelfPaths.has(file.replace(/\\/g, '/'))) continue;

  // Skip binary files and very large files
  if (isBinaryFile(file) || fs.statSync(file).size > 1000000) {
    continue;
  }

  try {
    // Get staged content (not working tree)
    const stagedContent = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' });

    for (const entry of forbiddenPatterns) {
      const { pattern, type, label } = normalizeForbiddenEntry(entry);
      if (!pattern) continue;

      if (type === 'regex') {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(stagedContent)) {
            violations.push(`Forbidden pattern found in ${file}: ${label}`);
          }
        } catch (regexErr) {
          // Invalid regex, skip
        }
      } else {
        // Literal string
        if (stagedContent.includes(pattern)) {
          violations.push(`Forbidden pattern found in ${file}: ${label}`);
        }
      }
    }
  } catch (err) {
    // File might not exist in index yet
  }
}

// scopeGuidance: a large, unreviewed change is itself a risk regardless of
// what it contains - it doesn't replace protectedPaths/forbiddenActions,
// it catches everything else: an agent-generated commit that "just works"
// but touched far more than anyone actually reviewed. Optional field -
// existing guardrails.json files without it get no new enforcement.
// Exempt on the genesis commit for the same reason protectedPaths is: a
// normal `init --tools git --git` commit is 25 files / 1569 lines,
// already over the shipped defaults (20 files / 500 lines) - without this
// exemption the tool would block its own onboarding flow.
const scopeGuidance = guardrails.scopeGuidance;
if (scopeGuidance && !isInitialCommit()) {
  const maxFiles = scopeGuidance.maxFilesPerChange;
  const maxLines = scopeGuidance.maxLinesPerChange;

  if (typeof maxFiles === 'number' && stagedFiles.length > maxFiles) {
    violations.push(`Change scope exceeds guidance: ${stagedFiles.length} files changed (limit ${maxFiles})`);
  }

  if (typeof maxLines === 'number') {
    let totalLines = 0;
    try {
      const numstat = execSync('git diff --cached --numstat', { encoding: 'utf8' });
      for (const line of numstat.trim().split('\n')) {
        if (!line) continue;
        const [added, deleted] = line.split('\t');
        totalLines += (parseInt(added, 10) || 0) + (parseInt(deleted, 10) || 0);
      }
    } catch (err) {
      totalLines = 0;
    }
    if (totalLines > maxLines) {
      violations.push(`Change scope exceeds guidance: ${totalLines} lines changed (limit ${maxLines})`);
    }
  }
}

// scopeBoundaries: architectural boundary and blast radius enforcement.
// Blocks commits touching files outside allowedPaths or crossing conflicting boundaries.
const scopeBoundaries = guardrails.scopeBoundaries;
const envAllowedScope = process.env.CAR_ALLOWED_SCOPE;

const nonScaffoldStaged = stagedFiles.filter(
  (p) =>
    !p.startsWith('.agent-room/') &&
    !p.startsWith('docs/plans/') &&
    !p.startsWith('docs/research/') &&
    !p.startsWith('.claude/') &&
    !p.startsWith('.cursor/') &&
    p !== 'AGENTS.md' &&
    p !== 'CLAUDE.md' &&
    p !== '.agent-room.json'
);

if (!isInitialCommit() && (scopeBoundaries || envAllowedScope)) {
  const allowedPaths = envAllowedScope
    ? envAllowedScope.split(',').map((s) => s.trim()).filter(Boolean)
    : (scopeBoundaries && Array.isArray(scopeBoundaries.allowedPaths) ? scopeBoundaries.allowedPaths : null);

  if (allowedPaths && allowedPaths.length > 0) {
    for (const file of nonScaffoldStaged) {
      const isAllowed = allowedPaths.some((pattern) => isPathProtected(file, pattern));
      if (!isAllowed) {
        violations.push(
          `Scope boundary violation: "${file}" is outside allowed scope [${allowedPaths.join(', ')}]`
        );
      }
    }
  }

  const disallowedCross =
    scopeBoundaries && Array.isArray(scopeBoundaries.disallowedCrossBoundaries)
      ? scopeBoundaries.disallowedCrossBoundaries
      : [];

  for (const group of disallowedCross) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const matchedPatterns = [];
    for (const pattern of group) {
      const matched = nonScaffoldStaged.some((file) => isPathProtected(file, pattern));
      if (matched) {
        matchedPatterns.push(pattern);
      }
    }
    if (matchedPatterns.length > 1) {
      violations.push(
        `Scope boundary violation: change touches multiple isolated boundaries: ${matchedPatterns.join(' AND ')}`
      );
    }
  }
}

// strictWaivers config resolution
const isStrictWaivers =
  guardrails.strictWaivers === true ||
  (guardrails.verifyOnCommit && guardrails.verifyOnCommit.strict === true);

// planGate: mechanical seatbelt for RPI execution.
// If staged changes touch >5 non-scaffold files across >1 distinct directories,
// mandate an active plan in docs/plans/ or an explicit waiver in decisions.md.
if (!isInitialCommit() && isPlanGateEnabled(guardrails)) {
  const minFiles =
    guardrails.planGate && typeof guardrails.planGate.minFiles === 'number'
      ? guardrails.planGate.minFiles
      : 5;

  const dirs = new Set(nonScaffoldStaged.map((p) => path.dirname(p).replace(/\\/g, '/')));

  if (nonScaffoldStaged.length > minFiles && dirs.size > 1) {
    const waiver = hasPlanWaiver(projectRoot, stagedFiles);
    if (!waiver.waived) {
      const activePlan = findActivePlanFile(projectRoot, stagedFiles);
      if (!activePlan) {
        violations.push(
          `RPI plan gate violation: staged change touches ${nonScaffoldStaged.length} non-scaffold files across ${dirs.size} directories without an active plan in docs/plans/. Either create an implementation plan in docs/plans/ or record a waiver in .agent-room/decisions.md (e.g. <!-- no-plan: <reason> -->).`
        );
      }
    } else if (isStrictWaivers) {
      const hasAuditRef = /(?:approved-by|waiver-approved|ticket|issue|ref|jira|#\d+)/i.test(waiver.reason);
      if (waiver.reason.length < 40 || !hasAuditRef) {
        violations.push(
          `Strict waiver audit failed for plan waiver: "${waiver.reason}" must be at least 40 characters and include an audit reference (ticket: #123, approved-by:, ref:, or waiver-approved:)`
        );
      }
    }
  }
}

// importBoundaries: architectural import boundary enforcement.
// Blocks commits where files matching a source pattern import modules matching disallowed patterns.
const importBoundaries = guardrails.importBoundaries;
if (!isInitialCommit() && Array.isArray(importBoundaries) && importBoundaries.length > 0) {
  for (const file of stagedFiles) {
    if (isBinaryFile(file)) continue;
    const matchingRules = importBoundaries.filter(
      (rule) => rule && rule.source && isPathProtected(file, rule.source)
    );
    if (matchingRules.length === 0) continue;

    let addedLines = '';
    try {
      const diff = execFileSync('git', ['diff', '--cached', '-U0', '--', file], {
        cwd: projectRoot,
        encoding: 'utf8'
      });
      addedLines = diff
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.slice(1))
        .join('\n');
    } catch (err) {
      try {
        addedLines = fs.readFileSync(path.join(projectRoot, file), 'utf8');
      } catch (readErr) {
        continue;
      }
    }

    if (!addedLines) continue;

    // JavaScript / TypeScript / general require & import matches
    const jsImportRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
    let match;
    while ((match = jsImportRegex.exec(addedLines)) !== null) {
      const importTarget = match[1];
      const normalizedTarget = importTarget.replace(/\\/g, '/');
      const targetPathFromRoot = importTarget.startsWith('.')
        ? path.join(path.dirname(file), importTarget).replace(/\\/g, '/')
        : normalizedTarget;

      for (const rule of matchingRules) {
        const disallowed = rule.disallowed || rule.forbiddenImports || [];
        for (const disPattern of disallowed) {
          if (
            isPathProtected(normalizedTarget, disPattern) ||
            isPathProtected(targetPathFromRoot, disPattern)
          ) {
            const desc = rule.description ? ` (${rule.description})` : '';
            violations.push(
              `Import boundary violation in "${file}": imports "${importTarget}" which matches disallowed pattern "${disPattern}"${desc}`
            );
          }
        }
      }
    }

    // Python import matches (e.g. `from tests.foo import bar` or `import tests.foo`)
    if (file.endsWith('.py')) {
      const pyImportRegex = /(?:^|\n)\s*(?:from|import)\s+([a-zA-Z0-9_.]+)/g;
      while ((match = pyImportRegex.exec(addedLines)) !== null) {
        const importTarget = match[1].replace(/\./g, '/');
        for (const rule of matchingRules) {
          const disallowed = rule.disallowed || rule.forbiddenImports || [];
          for (const disPattern of disallowed) {
            if (isPathProtected(importTarget, disPattern)) {
              const desc = rule.description ? ` (${rule.description})` : '';
              violations.push(
                `Import boundary violation in "${file}": imports "${match[1]}" which matches disallowed pattern "${disPattern}"${desc}`
              );
            }
          }
        }
      }
    }
  }
}

// strictWaivers: strict waiver audit enforcement
if (isStrictWaivers && !isInitialCommit()) {
  // 1. Audit bypasses: if GUARDRAILS_BYPASS is used, require GUARDRAILS_BYPASS_REASON
  if (ALLOW_GUARDRAILS_BYPASS) {
    const bypassReason = (process.env.GUARDRAILS_BYPASS_REASON || '').trim();
    if (!bypassReason || bypassReason.length < 20) {
      console.error('');
      console.error('❌ Strict Waiver Audit Failed: GUARDRAILS_BYPASS requires GUARDRAILS_BYPASS_REASON');
      console.error('In strict governance mode, bypasses must include an auditable explanation (>= 20 chars).');
      console.error('Example: GUARDRAILS_BYPASS=1 GUARDRAILS_BYPASS_REASON="ticket #123: hotfix deployment" git commit');
      console.error('');
      process.exit(1);
    }
  }

  // 2. Audit no-log waivers in decisions.md / anti-patterns.md
  const stagedLogs = stagedFiles.filter(
    (p) => p === '.agent-room/decisions.md' || p === '.agent-room/anti-patterns.md'
  );
  for (const logFile of stagedLogs) {
    let diff = '';
    try {
      diff = execFileSync('git', ['diff', '--cached', '-U0', '--', logFile], {
        cwd: projectRoot,
        encoding: 'utf8'
      });
    } catch (err) {
      // ignore
    }
    const addedContent = diff
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .join('\n');

    const waiverMatch = addedContent.match(/<!--\s*no-log:\s*(.*?)\s*-->/s);
    if (waiverMatch) {
      const reason = waiverMatch[1].trim();
      const hasAuditRef = /(?:approved-by|waiver-approved|ticket|issue|ref|jira|#\d+)/i.test(reason);
      if (reason.length < 40 || !hasAuditRef) {
        violations.push(
          `Strict waiver audit failed in "${logFile}": waiver "${reason}" must be at least 40 characters and include an audit reference (ticket: #123, approved-by:, ref:, or waiver-approved:)`
        );
      }
    }
  }
}

// verifyOnCommit: optional test verification gate before commit.
// Runs the project's test command (from guardrails.json, .agent-room.json, or
// auto-detected) and blocks the commit if tests fail, unless bypassed.
if (!isInitialCommit() && isVerifyEnabled(guardrails)) {
  const verifyCmd = resolveVerificationCommand(projectRoot, guardrails);
  if (verifyCmd) {
    const timeoutMs =
      (guardrails.verifyOnCommit && guardrails.verifyOnCommit.timeout) ||
      (process.env.CAR_VERIFY_TIMEOUT ? parseInt(process.env.CAR_VERIFY_TIMEOUT, 10) : 60000);

    let res;
    try {
      res = spawnSync(verifyCmd, {
        cwd: projectRoot,
        shell: true,
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (err) {
      res = { status: 1, error: err, stdout: '', stderr: err.message || String(err) };
    }

    if (res.error && res.error.code === 'ETIMEDOUT') {
      violations.push(`Pre-commit verification failed: "${verifyCmd}" timed out after ${timeoutMs}ms`);
    } else {
      const exitCode = res.status !== null && res.status !== undefined ? res.status : (res.signal ? 1 : 0);
      if (exitCode !== 0) {
        const output = [(res.stdout || ''), (res.stderr || '')].filter(Boolean).join('\n').trim();
        const snippet = output.length > 500 ? output.slice(-500) + ' (truncated)' : output;
        violations.push(
          `Pre-commit verification failed: "${verifyCmd}" exited with code ${exitCode}${snippet ? `\n    Output:\n    ` + snippet.replace(/\n/g, '\n    ') : ''}`
        );
      }
    }
  } else if (guardrails.verifyOnCommit && guardrails.verifyOnCommit.strict) {
    violations.push('Pre-commit verification failed: No test command configured or detected');
  }
}

if (violations.length > 0) {
  console.error('');
  console.error('❌ Guardrails Check Failed: Commit violates project guardrails');
  console.error('');
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  console.error('');
  console.error('To bypass guardrails (requires approval), use:');
  console.error('  GUARDRAILS_BYPASS=1 git commit');
  console.error('');

  if (!ALLOW_GUARDRAILS_BYPASS) {
    process.exit(1);
  }

  console.warn('⚠️  Guardrails bypass enabled - proceeding with commit');
  logBypass(violations);
}

process.exit(0);

// forbiddenActions entries are normally { pattern, type: "regex"|"literal",
// description } objects. Flat strings from the pre-schema config format are
// still accepted (inferring regex-vs-literal the old, best-effort way) so
// existing projects aren't silently left unprotected until they migrate.
function normalizeForbiddenEntry(entry) {
  if (typeof entry === 'string') {
    const looksLikeRegex = entry.match(/^\/.*\/[gimuy]*$/) || entry.startsWith('(?:') || entry.includes('(?:');
    return { pattern: entry, type: looksLikeRegex ? 'regex' : 'literal', label: entry };
  }
  if (entry && typeof entry === 'object' && typeof entry.pattern === 'string') {
    return {
      pattern: entry.pattern,
      type: entry.type === 'regex' ? 'regex' : 'literal',
      label: entry.description || entry.pattern
    };
  }
  return { pattern: null, type: null, label: null };
}

function isInitialCommit() {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { stdio: 'ignore' });
    return false;
  } catch (err) {
    return true;
  }
}

function isPathProtected(filePath, protectedPattern) {
  // Normalize paths for comparison
  const normalized = filePath.replace(/\\/g, '/');
  const pattern = protectedPattern.replace(/\\/g, '/');

  // Handle glob patterns
  if (pattern.includes('*')) {
    const regexPattern = pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${regexPattern}$`).test(normalized);
  }

  // Direct match or prefix match
  return normalized === pattern || normalized.startsWith(pattern + '/');
}

function getHeadGuardrails() {
  let headContent;
  try {
    headContent = execFileSync('git', ['show', 'HEAD:.agent-room/guardrails.json'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (err) {
    // No HEAD yet (genesis commit) or guardrails.json didn't exist at HEAD -
    // nothing to compare against.
    return null;
  }
  try {
    return JSON.parse(headContent);
  } catch (err) {
    // HEAD's guardrails.json doesn't parse cleanly - treat as no prior
    // protection to compare against rather than crashing the hook.
    return null;
  }
}

function detectRuleWeakening(headGuardrails, currentGuardrails, guardrailsRelPath) {
  const violations = [];
  if (!headGuardrails || typeof headGuardrails !== 'object') {
    return violations;
  }
  const curr = currentGuardrails || {};

  // 1. protectedPaths: detect dropped or removed protected paths
  const headProtected = (headGuardrails.protectedPaths || []).map((p) => String(p).replace(/\\/g, '/'));
  const currProtected = Array.isArray(curr.protectedPaths)
    ? curr.protectedPaths.map((p) => String(p).replace(/\\/g, '/'))
    : [];

  if (guardrailsRelPath) {
    const wasProtected = headProtected.some((p) => isPathProtected(guardrailsRelPath, p));
    const isStillProtected = currProtected.some((p) => isPathProtected(guardrailsRelPath, p));
    if (wasProtected && !isStillProtected) {
      violations.push(
        `Protected path violation: ${guardrailsRelPath} (removed from protectedPaths in the same commit that edits it)`
      );
    }
  }

  for (const hp of headProtected) {
    if (!currProtected.includes(hp)) {
      if (
        guardrailsRelPath &&
        isPathProtected(guardrailsRelPath, hp) &&
        violations.some((v) => v.includes('(removed from protectedPaths in the same commit that edits it)'))
      ) {
        continue;
      }
      violations.push(
        `Rule weakening violation: protected path "${hp}" was removed from protectedPaths in .agent-room/guardrails.json`
      );
    }
  }

  // 2. forbiddenActions: detect dropped patterns or downgraded pattern types
  const getPatternString = (item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object' && typeof item.pattern === 'string') {
      return item.pattern.trim();
    }
    return '';
  };

  const headForbidden = Array.isArray(headGuardrails.forbiddenActions) ? headGuardrails.forbiddenActions : [];
  const currForbidden = Array.isArray(curr.forbiddenActions) ? curr.forbiddenActions : [];
  const currPatterns = currForbidden.map(getPatternString);

  for (const item of headForbidden) {
    const pattern = getPatternString(item);
    if (!pattern) continue;
    if (!currPatterns.includes(pattern)) {
      violations.push(
        `Rule weakening violation: forbidden action pattern "${pattern}" was removed from forbiddenActions in .agent-room/guardrails.json`
      );
    } else if (typeof item === 'object' && item.type === 'regex') {
      const currentItem = currForbidden.find((ci) => getPatternString(ci) === pattern);
      if (currentItem && typeof currentItem === 'object' && currentItem.type === 'literal') {
        violations.push(
          `Rule weakening violation: forbidden action pattern "${pattern}" type was downgraded from regex to literal in .agent-room/guardrails.json`
        );
      }
    }
  }

  // 3. scopeGuidance: detect loosened file or line limits
  if (headGuardrails.scopeGuidance && typeof headGuardrails.scopeGuidance === 'object') {
    const headMaxFiles = headGuardrails.scopeGuidance.maxFilesPerChange;
    const headMaxLines = headGuardrails.scopeGuidance.maxLinesPerChange;

    if (typeof headMaxFiles === 'number' && headMaxFiles > 0) {
      if (!curr.scopeGuidance || typeof curr.scopeGuidance.maxFilesPerChange !== 'number') {
        violations.push(
          'Rule weakening violation: scopeGuidance.maxFilesPerChange was removed from .agent-room/guardrails.json'
        );
      } else if (curr.scopeGuidance.maxFilesPerChange > headMaxFiles) {
        violations.push(
          `Rule weakening violation: scopeGuidance.maxFilesPerChange was increased from ${headMaxFiles} to ${curr.scopeGuidance.maxFilesPerChange} in .agent-room/guardrails.json`
        );
      }
    }

    if (typeof headMaxLines === 'number' && headMaxLines > 0) {
      if (!curr.scopeGuidance || typeof curr.scopeGuidance.maxLinesPerChange !== 'number') {
        violations.push(
          'Rule weakening violation: scopeGuidance.maxLinesPerChange was removed from .agent-room/guardrails.json'
        );
      } else if (curr.scopeGuidance.maxLinesPerChange > headMaxLines) {
        violations.push(
          `Rule weakening violation: scopeGuidance.maxLinesPerChange was increased from ${headMaxLines} to ${curr.scopeGuidance.maxLinesPerChange} in .agent-room/guardrails.json`
        );
      }
    }
  }

  // 4. importBoundaries: detect dropped source boundaries or dropped disallowed patterns
  if (Array.isArray(headGuardrails.importBoundaries) && headGuardrails.importBoundaries.length > 0) {
    const currImportRules = Array.isArray(curr.importBoundaries) ? curr.importBoundaries : [];
    for (const headRule of headGuardrails.importBoundaries) {
      if (!headRule || typeof headRule.source !== 'string') continue;
      const headSource = headRule.source.replace(/\\/g, '/');
      const matchingCurrRule = currImportRules.find(
        (r) => r && typeof r.source === 'string' && r.source.replace(/\\/g, '/') === headSource
      );
      if (!matchingCurrRule) {
        violations.push(
          `Rule weakening violation: importBoundaries rule for source "${headRule.source}" was removed from .agent-room/guardrails.json`
        );
      } else {
        const headDisallowed = (headRule.disallowed || headRule.forbiddenImports || []).map((p) =>
          String(p).replace(/\\/g, '/')
        );
        const currDisallowed = (matchingCurrRule.disallowed || matchingCurrRule.forbiddenImports || []).map((p) =>
          String(p).replace(/\\/g, '/')
        );
        for (const disPattern of headDisallowed) {
          if (!currDisallowed.includes(disPattern)) {
            violations.push(
              `Rule weakening violation: importBoundaries for source "${headRule.source}" dropped disallowed import "${disPattern}" in .agent-room/guardrails.json`
            );
          }
        }
      }
    }
  }

  // 5. scopeBoundaries: detect removed allowedPaths or weakened cross boundary groups
  if (headGuardrails.scopeBoundaries && typeof headGuardrails.scopeBoundaries === 'object') {
    if (
      Array.isArray(headGuardrails.scopeBoundaries.allowedPaths) &&
      headGuardrails.scopeBoundaries.allowedPaths.length > 0
    ) {
      if (
        !curr.scopeBoundaries ||
        !Array.isArray(curr.scopeBoundaries.allowedPaths) ||
        curr.scopeBoundaries.allowedPaths.length === 0
      ) {
        violations.push(
          'Rule weakening violation: scopeBoundaries.allowedPaths was removed or emptied in .agent-room/guardrails.json'
        );
      }
    }

    if (
      Array.isArray(headGuardrails.scopeBoundaries.disallowedCrossBoundaries) &&
      headGuardrails.scopeBoundaries.disallowedCrossBoundaries.length > 0
    ) {
      const currCross =
        curr.scopeBoundaries && Array.isArray(curr.scopeBoundaries.disallowedCrossBoundaries)
          ? curr.scopeBoundaries.disallowedCrossBoundaries
          : [];
      for (const group of headGuardrails.scopeBoundaries.disallowedCrossBoundaries) {
        if (!Array.isArray(group) || group.length < 2) continue;
        const headGroupNorm = group.map((p) => String(p).replace(/\\/g, '/'));
        const matched = currCross.some((cg) => {
          if (!Array.isArray(cg)) return false;
          const cgNorm = cg.map((p) => String(p).replace(/\\/g, '/'));
          return headGroupNorm.every((hp) => cgNorm.includes(hp));
        });
        if (!matched) {
          violations.push(
            `Rule weakening violation: scopeBoundaries.disallowedCrossBoundaries group [${headGroupNorm.join(', ')}] was removed or weakened in .agent-room/guardrails.json`
          );
        }
      }
    }
  }

  // 6. verifyOnCommit: detect disabling of verification gate or removal of strict mode
  if (isVerifyEnabled(headGuardrails)) {
    if (!isVerifyEnabled(curr)) {
      violations.push(
        'Rule weakening violation: verifyOnCommit was disabled or removed from .agent-room/guardrails.json'
      );
    } else if (
      headGuardrails.verifyOnCommit &&
      headGuardrails.verifyOnCommit.strict === true &&
      (!curr.verifyOnCommit || curr.verifyOnCommit.strict !== true)
    ) {
      violations.push(
        'Rule weakening violation: verifyOnCommit.strict was disabled in .agent-room/guardrails.json'
      );
    }
  }

  // 7. strictWaivers: detect disabling of strict waiver auditing
  if (headGuardrails.strictWaivers === true && curr.strictWaivers !== true) {
    violations.push('Rule weakening violation: strictWaivers was disabled in .agent-room/guardrails.json');
  }

  return violations;
}

function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.exe', '.dll', '.so', '.bin'];
  return binaryExts.includes(ext);
}

function isVerifyEnabled(guardrailsConfig) {
  if (process.env.CAR_VERIFY_ON_COMMIT === '0' || process.env.CAR_VERIFY_ON_COMMIT === 'false') {
    return false;
  }
  if (process.env.CAR_VERIFY_ON_COMMIT === '1' || process.env.CAR_VERIFY_ON_COMMIT === 'true') {
    return true;
  }
  if (guardrailsConfig.verifyOnCommit === true) {
    return true;
  }
  if (guardrailsConfig.verifyOnCommit && typeof guardrailsConfig.verifyOnCommit === 'object') {
    return guardrailsConfig.verifyOnCommit.enabled !== false;
  }
  return false;
}

function resolveVerificationCommand(root, guardrailsConfig) {
  if (process.env.CAR_TEST_COMMAND) {
    return process.env.CAR_TEST_COMMAND;
  }
  if (
    guardrailsConfig.verifyOnCommit &&
    typeof guardrailsConfig.verifyOnCommit === 'object' &&
    guardrailsConfig.verifyOnCommit.command
  ) {
    return guardrailsConfig.verifyOnCommit.command;
  }
  const configPath = path.join(root, '.agent-room.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.verification && typeof config.verification.testCommand === 'string') {
        return config.verification.testCommand;
      }
      if (typeof config.testCommand === 'string') {
        return config.testCommand;
      }
    } catch (err) {
      // ignore
    }
  }
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test) {
        if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm test';
        if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn test';
        if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun test';
        return 'npm test';
      }
    } catch (err) {
      // ignore
    }
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    return 'cargo test';
  }
  if (fs.existsSync(path.join(root, 'go.mod'))) {
    return 'go test ./...';
  }
  if (
    fs.existsSync(path.join(root, 'pytest.ini')) ||
    fs.existsSync(path.join(root, 'pyproject.toml')) ||
    fs.existsSync(path.join(root, 'setup.py'))
  ) {
    return 'pytest';
  }
  return null;
}

function isPlanGateEnabled(guardrailsConfig) {
  if (process.env.CAR_SKIP_PLAN_GATE === '1' || process.env.CAR_SKIP_PLAN_GATE === 'true') {
    return false;
  }
  if (process.env.CAR_PLAN_GATE === '0' || process.env.CAR_PLAN_GATE === 'false') {
    return false;
  }
  if (guardrailsConfig.planGate === false) {
    return false;
  }
  if (guardrailsConfig.planGate && typeof guardrailsConfig.planGate === 'object') {
    return guardrailsConfig.planGate.enabled !== false;
  }
  return true;
}

function parsePlanFrontmatter(content) {
  if (!content || !content.startsWith('---')) {
    return {};
  }
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return {};
  }
  const header = content.slice(3, endIdx).trim();
  const res = {};
  for (const line of header.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    res[key] = val;
  }
  return res;
}

function findActivePlanFile(root, stagedFiles) {
  // 1. Plan staged directly in this commit
  const stagedPlan = stagedFiles.find(
    (f) => f.startsWith('docs/plans/') && f.endsWith('.md') && !f.endsWith('README.md')
  );
  if (stagedPlan) {
    return stagedPlan;
  }

  // 2. Existing plan on disk in docs/plans/
  const plansDir = path.join(root, 'docs', 'plans');
  if (!fs.existsSync(plansDir)) {
    return null;
  }

  let planFiles = [];
  try {
    planFiles = fs.readdirSync(plansDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  } catch (err) {
    return null;
  }

  if (planFiles.length === 0) {
    return null;
  }

  let currentBranch = '';
  try {
    currentBranch = execFileSync('git', ['branch', '--show-current'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (err) {
    // ignore
  }

  // Check matching branch first
  if (currentBranch) {
    for (const file of planFiles) {
      try {
        const content = fs.readFileSync(path.join(plansDir, file), 'utf8');
        const fm = parsePlanFrontmatter(content);
        if (fm.branch && fm.branch.trim() === currentBranch) {
          return file;
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // Check plans with active status
  for (const file of planFiles) {
    try {
      const content = fs.readFileSync(path.join(plansDir, file), 'utf8');
      const fm = parsePlanFrontmatter(content);
      if (!fm.status || !['complete', 'completed'].includes(fm.status.toLowerCase().trim())) {
        return file;
      }
    } catch (err) {
      // ignore
    }
  }

  return null;
}

function hasPlanWaiver(root, stagedFiles) {
  const logFiles = ['.agent-room/decisions.md', '.agent-room/anti-patterns.md'];

  for (const logFile of logFiles) {
    if (stagedFiles.includes(logFile)) {
      try {
        const diff = execFileSync('git', ['diff', '--cached', '-U0', '--', logFile], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        const addedLines = diff
          .split('\n')
          .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
          .map((line) => line.slice(1))
          .join('\n');
        const match = addedLines.match(/<!--\s*no-plan:\s*(.*?)\s*-->/s);
        if (match && match[1].trim().length > 0) {
          return { waived: true, reason: match[1].trim() };
        }
      } catch (err) {
        // ignore
      }
    }
  }

  try {
    const headDiff = execFileSync(
      'git',
      ['show', '-U0', 'HEAD', '--', '.agent-room/decisions.md', '.agent-room/anti-patterns.md'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    );
    const addedLines = headDiff
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .join('\n');
    const match = addedLines.match(/<!--\s*no-plan:\s*(.*?)\s*-->/s);
    if (match && match[1].trim().length > 0) {
      return { waived: true, reason: match[1].trim() };
    }
  } catch (err) {
    // ignore
  }

  return { waived: false, reason: '' };
}


