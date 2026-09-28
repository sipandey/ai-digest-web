#!/usr/bin/env node
'use strict';

/*
 * Close-the-loop Stop hook: mechanically enforces
 * .agent-room/skills/closing-the-loop.md.
 *
 * Shared check for Claude Code and Cursor. Adapter only changes how a
 * failure is surfaced:
 *   --adapter=claude (default): exit 2 + stderr (Claude Code Stop)
 *   --adapter=cursor: stdout JSON { followup_message } (Cursor stop hook)
 *
 * Evidence-lite (Phase B.1): when log files are touched, git diff must
 * contain a valid waiver or structured entry — not whitespace alone.
 *
 * Limitations (by design, to stay simple):
 * - Only looks at `git status --porcelain` and `git diff HEAD` on log files
 *   since the last commit, not since the start of this turn.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  validateLogEvidenceFromDiff,
  buildEvidenceFailureMessage,
} = require('./closing-the-loop-evidence');

const SCAFFOLD_PREFIXES = [
  '.agent-room/',
  'docs/plans/',
  '.claude/skills/',
  '.claude/settings.json',
  '.cursor/rules/',
  '.cursor/hooks.json',
  '.cursor/hooks/',
];
const SCAFFOLD_FILES = ['AGENTS.md', 'CLAUDE.md', '.agent-room.json'];
const LOG_PATHS = ['.agent-room/anti-patterns.md', '.agent-room/decisions.md'];

function sh(cmd, cwd) {
  try {
    return execSync(cmd, { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (err) {
    return '';
  }
}

function isScaffoldPath(p) {
  if (SCAFFOLD_FILES.includes(p)) return true;
  return SCAFFOLD_PREFIXES.some((prefix) => p.startsWith(prefix) || prefix.startsWith(p));
}

function isLogPath(p) {
  return LOG_PATHS.includes(p);
}

function getLogDiff(cwd) {
  return sh(
    'git diff HEAD -- .agent-room/anti-patterns.md .agent-room/decisions.md',
    cwd
  );
}

function resolveVerificationConfig(cwd, opts) {
  if (opts && (opts.testCommand || opts.verification)) {
    if (typeof opts.verification === 'object' && opts.verification !== null) {
      return opts.verification;
    }
    if (typeof opts.testCommand === 'string') {
      return {
        testCommand: opts.testCommand,
        timeoutMs: opts.timeoutMs,
      };
    }
  }
  const configPath = path.join(cwd, '.agent-room.json');
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && typeof parsed.verification === 'object' && parsed.verification !== null) {
        return parsed.verification;
      }
      if (parsed && typeof parsed.testCommand === 'string') {
        return { testCommand: parsed.testCommand };
      }
    } catch (err) {
      // ignore unreadable/malformed .agent-room.json
    }
  }
  return null;
}

function parsePlanFrontmatter(content) {
  if (!content || !content.startsWith('---')) return {};
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) return {};
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

function parsePlanPhases(content) {
  if (typeof content !== 'string') return null;
  const endIdx = content.startsWith('---') ? content.indexOf('\n---', 3) : -1;
  const body = endIdx !== -1 ? content.slice(endIdx + 4) : content;

  const phaseHeaderRegex = /(?:^|\n)#{2,3}\s+Phase\s+(\d+)[:\s]+([^\n]+)/gi;
  const headerMatches = [];
  let m;
  while ((m = phaseHeaderRegex.exec(body)) !== null) {
    headerMatches.push({
      phaseNumber: parseInt(m[1], 10),
      title: m[2].trim(),
      index: m.index,
      headerLength: m[0].length,
    });
  }

  const phases = [];
  for (let i = 0; i < headerMatches.length; i++) {
    const curr = headerMatches[i];
    const startIndex = curr.index + curr.headerLength;
    const endIndex = i + 1 < headerMatches.length ? headerMatches[i + 1].index : body.length;
    const phaseSection = body.slice(startIndex, endIndex);

    const tasks = [];
    const checkboxRegex = /^[ \t]*-[ \t]*\[([ xX])\][ \t]+([^\r\n]+)/gm;
    let cm;
    while ((cm = checkboxRegex.exec(phaseSection)) !== null) {
      tasks.push({
        completed: cm[1].toLowerCase() === 'x',
        text: cm[2].trim(),
      });
    }

    let verificationCommand = null;
    const autoVerifMatch = phaseSection.match(/(?:\*?Automated\s+Verification:?\*?:?|####\s+Automated\s+Verification:?)[^\n`]*`([^`]+)`/i);
    if (autoVerifMatch) {
      verificationCommand = autoVerifMatch[1].trim();
    } else {
      const codeBlockMatch = phaseSection.match(/(?:\*?Automated\s+Verification:?\*?:?|####\s+Automated\s+Verification:?)[^\n`]*```[a-z]*\r?\n([^\r\n`]+)/i);
      if (codeBlockMatch) {
        verificationCommand = codeBlockMatch[1].trim();
      }
    }

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.completed).length;
    const completed = totalTasks > 0 && completedTasks === totalTasks;

    phases.push({
      phaseNumber: curr.phaseNumber,
      title: curr.title,
      tasks,
      totalTasks,
      completedTasks,
      completed,
      verificationCommand,
    });
  }

  return { phases };
}

function resolvePlanPhaseVerification(cwd, opts) {
  if (opts && typeof opts.planVerificationCommand === 'string') {
    return {
      command: opts.planVerificationCommand,
      phaseNumber: (opts && opts.planPhaseNumber) || 1,
      phaseTitle: (opts && opts.planPhaseTitle) || 'Active Phase',
      planFile: (opts && opts.planFile) || 'docs/plans/active-plan.md',
    };
  }

  const plansDir = path.join(cwd, 'docs', 'plans');
  if (!fs.existsSync(plansDir)) return null;

  let planFiles = [];
  try {
    planFiles = fs.readdirSync(plansDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  } catch (err) {
    return null;
  }
  if (planFiles.length === 0) return null;

  let currentBranch = '';
  try {
    currentBranch = execSync('git branch --show-current', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    // ignore
  }

  let chosenFile = null;
  let chosenContent = null;

  if (currentBranch) {
    for (const f of planFiles) {
      try {
        const content = fs.readFileSync(path.join(plansDir, f), 'utf8');
        const fm = parsePlanFrontmatter(content);
        if (fm.branch && fm.branch.trim() === currentBranch) {
          chosenFile = f;
          chosenContent = content;
          break;
        }
      } catch (err) {
        // ignore
      }
    }
  }

  if (!chosenFile) {
    for (const f of planFiles) {
      try {
        const content = fs.readFileSync(path.join(plansDir, f), 'utf8');
        const fm = parsePlanFrontmatter(content);
        if (!fm.status || !['complete', 'completed'].includes(fm.status.toLowerCase().trim())) {
          chosenFile = f;
          chosenContent = content;
          break;
        }
      } catch (err) {
        // ignore
      }
    }
  }

  if (!chosenFile || !chosenContent) return null;

  const planInfo = parsePlanPhases(chosenContent);
  if (!planInfo || planInfo.phases.length === 0) return null;

  let targetPhase = null;
  const inProgressPhase = planInfo.phases.find((p) => p.completedTasks > 0 && !p.completed);
  if (inProgressPhase) {
    targetPhase = inProgressPhase;
  } else {
    const completedPhases = planInfo.phases.filter((p) => p.completed);
    if (completedPhases.length > 0) {
      targetPhase = completedPhases[completedPhases.length - 1];
    } else {
      targetPhase = planInfo.phases[0];
    }
  }

  let verifCmd = targetPhase ? targetPhase.verificationCommand : null;
  if (!verifCmd) {
    for (let i = planInfo.phases.length - 1; i >= 0; i--) {
      if (planInfo.phases[i].verificationCommand) {
        verifCmd = planInfo.phases[i].verificationCommand;
        targetPhase = planInfo.phases[i];
        break;
      }
    }
  }

  if (verifCmd) {
    return {
      command: verifCmd,
      phaseNumber: targetPhase ? targetPhase.phaseNumber : null,
      phaseTitle: targetPhase ? targetPhase.title : '',
      planFile: path.join('docs', 'plans', chosenFile).replace(/\\/g, '/'),
    };
  }

  return null;
}

function formatTestOutput(stdout, stderr) {
  const combined = [stdout, stderr]
    .filter((chunk) => typeof chunk === 'string' && chunk.length > 0)
    .join('\n')
    .trim();
  if (combined.length <= 1500) {
    return combined;
  }
  return '... [output truncated] ...\n' + combined.slice(-1500);
}

function buildTestFailureMessage(command, exitCode, output, planPhaseInfo) {
  let msg;
  if (planPhaseInfo && planPhaseInfo.phaseNumber) {
    msg =
      'RPI Phase Verification failed for Phase ' +
      planPhaseInfo.phaseNumber +
      ' (' +
      planPhaseInfo.planFile +
      '): "' +
      command +
      '" exited with code ' +
      exitCode +
      '.\n';
  } else {
    msg =
      'Pre-stop test verification failed: "' +
      command +
      '" exited with code ' +
      exitCode +
      '.\n';
  }
  if (output && output.trim()) {
    msg += '\n--- Test Output ---\n' + output.trim() + '\n-------------------\n\n';
  } else {
    msg += '\n';
  }
  msg += 'Please fix the failing tests before completing this turn.';
  return msg;
}

function buildTimeoutMessage(command, timeoutMs, planPhaseInfo) {
  const prefix =
    planPhaseInfo && planPhaseInfo.phaseNumber
      ? 'RPI Phase Verification failed for Phase ' +
        planPhaseInfo.phaseNumber +
        ' (' +
        planPhaseInfo.planFile +
        '): "'
      : 'Pre-stop test verification failed: "';
  return (
    prefix +
    command +
    '" timed out after ' +
    timeoutMs +
    'ms.\n\n' +
    'Please ensure tests finish within the timeout limit before completing this turn.'
  );
}

function runTestVerification(command, cwd, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 60000;
  if (opts && typeof opts.runCommand === 'function') {
    return opts.runCommand(command, { cwd, timeout: timeoutMs });
  }
  try {
    return spawnSync(command, {
      cwd: cwd || process.cwd(),
      shell: true,
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
  } catch (err) {
    return { status: 1, stdout: '', stderr: err.message || String(err) };
  }
}

function matchesPathPattern(filePath, pattern) {
  const normFile = filePath.replace(/^\.\//, '').replace(/\\/g, '/');
  const normPattern = pattern.replace(/^\.\//, '').replace(/\\/g, '/');

  if (normPattern.includes('*')) {
    const regexPattern = normPattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${regexPattern}$`).test(normFile);
  }
  return normFile === normPattern || normFile.startsWith(normPattern + '/');
}

function resolveScopeBoundaries(cwd, opts) {
  if (opts && opts.scopeBoundaries && typeof opts.scopeBoundaries === 'object') {
    return opts.scopeBoundaries;
  }
  const guardrailsPath = path.join(cwd, '.agent-room', 'guardrails.json');
  if (fs.existsSync(guardrailsPath)) {
    try {
      const guardrails = JSON.parse(fs.readFileSync(guardrailsPath, 'utf8'));
      if (guardrails && typeof guardrails.scopeBoundaries === 'object') {
        return guardrails.scopeBoundaries;
      }
    } catch (err) {
      // ignore unreadable/malformed guardrails.json
    }
  }
  return null;
}

function resolveAllowedPaths(scopeBoundaries, opts) {
  if (process.env.CAR_ALLOWED_SCOPE) {
    return process.env.CAR_ALLOWED_SCOPE.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (opts && (opts.allowedScope || opts.allowedPaths)) {
    const raw = opts.allowedScope || opts.allowedPaths;
    return Array.isArray(raw) ? raw : raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (scopeBoundaries && Array.isArray(scopeBoundaries.allowedPaths) && scopeBoundaries.allowedPaths.length > 0) {
    return scopeBoundaries.allowedPaths;
  }
  return null;
}

function buildScopeViolationMessage(violations) {
  let msg = 'Agent Scope Boundary check failed: modifications exceed allowed architectural boundaries.\n\n';
  for (const v of violations) {
    msg += `  - ${v}\n`;
  }
  msg += '\nRemediation guidance per .agent-room/coordination/scope-boundaries.md:\n';
  msg += '1. Revert modifications outside your assigned scope before completing this turn.\n';
  msg += '2. Partition work into separate, isolated sessions for each architectural boundary.\n';
  msg += '3. Never modify files across conflicting boundaries in a single turn.\n';
  return msg;
}

function checkScopeBoundaries(changedPaths, cwd, opts) {
  if (
    (opts && opts.skipScopeCheck) ||
    process.env.CAR_SKIP_SCOPE_CHECK === '1' ||
    process.env.SKIP_SCOPE_CHECK === '1'
  ) {
    return { ok: true, violations: [] };
  }

  const scopeBoundaries = resolveScopeBoundaries(cwd, opts);
  const allowedPaths = resolveAllowedPaths(scopeBoundaries, opts);
  const disallowedCross =
    scopeBoundaries && Array.isArray(scopeBoundaries.disallowedCrossBoundaries)
      ? scopeBoundaries.disallowedCrossBoundaries
      : [];

  if (!allowedPaths && disallowedCross.length === 0) {
    return { ok: true, violations: [] };
  }

  const violations = [];

  if (allowedPaths && allowedPaths.length > 0) {
    for (const file of changedPaths) {
      const isAllowed = allowedPaths.some((pattern) => matchesPathPattern(file, pattern));
      if (!isAllowed) {
        violations.push(`File "${file}" is outside allowed scope [${allowedPaths.join(', ')}]`);
      }
    }
  }

  for (const group of disallowedCross) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const matchedPatterns = [];
    for (const pattern of group) {
      const matched = changedPaths.some((file) => matchesPathPattern(file, pattern));
      if (matched) {
        matchedPatterns.push(pattern);
      }
    }
    if (matchedPatterns.length > 1) {
      violations.push(
        `Cross-boundary conflict: change touches multiple isolated boundaries: ${matchedPatterns.join(' AND ')}`
      );
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

function buildFailureMessage(sourceChanges) {
  const sample = sourceChanges.slice(0, 5).join(', ') + (sourceChanges.length > 5 ? ', ...' : '');
  return (
    'Closing-the-loop check failed: this turn changed ' +
    sourceChanges.length +
    ' file(s) outside the agent-room scaffold (' +
    sample +
    '), but neither ' +
    '.agent-room/anti-patterns.md nor .agent-room/decisions.md was touched.\n\n' +
    'Follow .agent-room/skills/closing-the-loop.md before finishing this turn:\n' +
    '- If this fixed a bug or found a root cause, append an entry to anti-patterns.md.\n' +
    '- If this made a non-obvious design/architecture call, append an entry to decisions.md.\n' +
    '- If genuinely neither applies, add a one-line waiver to decisions.md instead:\n' +
    '  <!-- no-log: routine change, no decision or anti-pattern worth recording -->\n'
  );
}

function isStrictMode(cwd, opts) {
  if (opts && typeof opts.strict === 'boolean') return opts.strict;
  if (process.env.CAR_STRICT === '1' || process.env.CAR_STRICT === 'true') return true;

  const configPath = path.join(cwd, '.agent-room.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg && (cfg.preset === 'strict' || cfg.profile === 'strict')) return true;
    } catch (e) {
      // ignore
    }
  }

  const guardrailsPath = path.join(cwd, '.agent-room', 'guardrails.json');
  if (fs.existsSync(guardrailsPath)) {
    try {
      const gr = JSON.parse(fs.readFileSync(guardrailsPath, 'utf8'));
      if (gr && (gr.strictWaivers === true || (gr.verifyOnCommit && gr.verifyOnCommit.strict === true))) {
        return true;
      }
    } catch (e) {
      // ignore
    }
  }
  return false;
}

/**
 * @param {string} cwd
 * @param {{ hasAgentRoom?: boolean, isGitRepo?: boolean, statusPorcelain?: string, logDiff?: string, testCommand?: string, verification?: any, timeoutMs?: number, runCommand?: function, skipTestVerification?: boolean, strict?: boolean }} [opts]
 * @returns {{ ok: boolean, sourceChanges: string[], message: string, reason?: string, testCommand?: string, testOutput?: string }}
 */
function checkClosingTheLoop(cwd, opts) {
  opts = opts || {};

  const hasAgentRoom =
    typeof opts.hasAgentRoom === 'boolean'
      ? opts.hasAgentRoom
      : fs.existsSync(path.join(cwd, '.agent-room'));
  if (!hasAgentRoom) {
    return { ok: true, sourceChanges: [], message: '' };
  }

  const isGitRepo =
    typeof opts.isGitRepo === 'boolean'
      ? opts.isGitRepo
      : sh('git rev-parse --is-inside-work-tree 2>/dev/null', cwd).trim() === 'true';
  if (!isGitRepo) {
    return { ok: true, sourceChanges: [], message: '' };
  }

  const porcelain =
    typeof opts.statusPorcelain === 'string' ? opts.statusPorcelain : sh('git status --porcelain', cwd);
  const lines = porcelain.split('\n').filter(Boolean);
  const changedPaths = lines.map((line) => line.slice(3).trim());

  const nonScaffold = changedPaths.filter((p) => !isScaffoldPath(p));
  if (nonScaffold.length === 0) {
    return { ok: true, sourceChanges: [], message: '' };
  }

  // --- Pre-Stop Test Verification Gate ---
  const skipTestVerification =
    Boolean(opts.skipTestVerification) ||
    process.env.CAR_SKIP_TEST_VERIFICATION === '1' ||
    process.env.SKIP_TEST_VERIFICATION === '1';

  if (!skipTestVerification) {
    const planVerif = resolvePlanPhaseVerification(cwd, opts);
    const verifConfig = resolveVerificationConfig(cwd, opts);
    let testCmd = null;
    let isPlanVerification = false;
    let planPhaseInfo = null;

    if (planVerif && planVerif.command) {
      testCmd = planVerif.command;
      isPlanVerification = true;
      planPhaseInfo = planVerif;
    } else {
      testCmd =
        verifConfig && (verifConfig.testCommand || verifConfig.command);
    }

    if (testCmd && typeof testCmd === 'string' && testCmd.trim()) {
      const timeoutMs =
        (opts && opts.timeoutMs) ||
        (verifConfig && verifConfig.timeoutMs) ||
        60000;
      const testResult = runTestVerification(testCmd, cwd, {
        timeoutMs,
        runCommand: opts.runCommand,
      });

      if (testResult.error && testResult.error.code === 'ETIMEDOUT') {
        return {
          ok: false,
          sourceChanges: nonScaffold,
          message: buildTimeoutMessage(testCmd, timeoutMs, planPhaseInfo),
          reason: 'test-verification-failed',
          testCommand: testCmd,
          planVerification: isPlanVerification,
          planPhaseInfo,
        };
      }

      const exitCode =
        testResult.status !== null && testResult.status !== undefined
          ? testResult.status
          : (testResult.signal || 1);

      if (exitCode !== 0) {
        const output = formatTestOutput(testResult.stdout, testResult.stderr);
        return {
          ok: false,
          sourceChanges: nonScaffold,
          message: buildTestFailureMessage(testCmd, exitCode, output, planPhaseInfo),
          reason: 'test-verification-failed',
          testCommand: testCmd,
          testOutput: output,
          planVerification: isPlanVerification,
          planPhaseInfo,
        };
      }
    }
  }

  // --- Scope Boundaries / Blast Radius Gate ---
  const scopeResult = checkScopeBoundaries(nonScaffold, cwd, opts);
  if (!scopeResult.ok) {
    return {
      ok: false,
      sourceChanges: nonScaffold,
      message: buildScopeViolationMessage(scopeResult.violations),
      reason: 'scope-boundary-violation',
      scopeViolations: scopeResult.violations,
    };
  }

  // --- Closing-the-loop Log Evidence Gate ---
  const strict = isStrictMode(cwd, opts);
  const logTouched = changedPaths.some(isLogPath);
  const logDiff = typeof opts.logDiff === 'string' ? opts.logDiff : getLogDiff(cwd);
  const hasEvidence = validateLogEvidenceFromDiff(logDiff, { strict });

  if (hasEvidence) {
    return { ok: true, sourceChanges: [], message: '' };
  }

  if (!logTouched) {
    return {
      ok: false,
      sourceChanges: nonScaffold,
      message: buildFailureMessage(nonScaffold),
      reason: 'no-log-touch',
    };
  }

  return {
    ok: false,
    sourceChanges: nonScaffold,
    message: buildEvidenceFailureMessage({ strict }),
    reason: 'insufficient-evidence',
  };
}

function parseAdapter(argv) {
  for (const a of argv) {
    if (a === '--adapter' || a.startsWith('--adapter=')) {
      const value = a.startsWith('--adapter=') ? a.slice('--adapter='.length) : null;
      if (value === null) {
        const idx = argv.indexOf(a);
        return argv[idx + 1] || '';
      }
      return value;
    }
  }
  return 'claude';
}

function readStdinSync() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

function parseCursorStatus(stdinText) {
  if (!stdinText || !stdinText.trim()) return null;
  try {
    const parsed = JSON.parse(stdinText);
    return parsed && typeof parsed.status === 'string' ? parsed.status : null;
  } catch (err) {
    return null;
  }
}

function applyAdapter(adapter, result) {
  if (adapter === 'claude') {
    if (result.ok) {
      process.exit(0);
    }
    process.stderr.write(result.message);
    process.exit(2);
  }

  if (adapter === 'cursor') {
    if (result.ok) {
      process.stdout.write('{}\n');
      process.exit(0);
    }
    process.stdout.write(JSON.stringify({ followup_message: result.message }) + '\n');
    process.exit(0);
  }

  process.stderr.write(
    'Unknown adapter: ' + adapter + '. Use --adapter=claude or --adapter=cursor.\n'
  );
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const adapter = parseAdapter(args);
  if (adapter !== 'claude' && adapter !== 'cursor') {
    applyAdapter(adapter, { ok: true, sourceChanges: [], message: '' });
    return;
  }

  if (adapter === 'cursor') {
    const status = parseCursorStatus(readStdinSync());
    if (status === 'aborted' || status === 'error') {
      process.stdout.write('{}\n');
      process.exit(0);
    }
  }

  const skipTestVerification =
    args.includes('--skip-tests') ||
    args.includes('--skip-verification');

  const skipScopeCheck =
    args.includes('--skip-scope') ||
    args.includes('--skip-scope-check');

  const strict = args.includes('--strict');

  const result = checkClosingTheLoop(process.cwd(), {
    skipTestVerification,
    skipScopeCheck,
    ...(strict ? { strict: true } : {})
  });
  applyAdapter(adapter, result);
}

if (require.main === module) {
  main();
}

module.exports = {
  checkClosingTheLoop,
  checkScopeBoundaries,
  buildScopeViolationMessage,
  resolveScopeBoundaries,
  resolveAllowedPaths,
  matchesPathPattern,
  isScaffoldPath,
  isStrictMode,
  parseAdapter,
  SCAFFOLD_PREFIXES,
  SCAFFOLD_FILES,
  getLogDiff,
  resolveVerificationConfig,
  resolvePlanPhaseVerification,
  parsePlanPhases,
  buildTestFailureMessage,
  formatTestOutput,
};
