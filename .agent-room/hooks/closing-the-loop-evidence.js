'use strict';

const NO_LOG_MIN_REASON_LENGTH = 20;

// Substrings that signal a deliberate waiver reason (not random padding).
// Kept small and mechanical — catches "xxxxxxxx..." gaming without LLM judgment.
const WAIVER_VERB_TOKENS = [
  'routine',
  'fix',
  'fixed',
  'fixing',
  'test',
  'testing',
  'tested',
  'refactor',
  'typo',
  'doc',
  'docs',
  'document',
  'chore',
  'release',
  'bump',
  'sync',
  'lint',
  'format',
  'readme',
  'validate',
  'validation',
  'dogfood',
  'cleanup',
  'merge',
  'revert',
  'patch',
  'update',
  'review',
  'trivial',
  'minor',
  'cosmetic',
  'demo',
];

const WAIVER_RE = /<!--\s*no-log:\s*(.*?)\s*-->/s;

const ENTRY_HEADER_RE = /^###\s+\d{4}-\d{2}-\d{2}\s+—\s+.+/m;

const ANTI_PATTERN_FIELD_RES = [
  /\*\*What happened:\*\*/i,
  /\*\*Root cause:\*\*/i,
  /\*\*Avoid:\*\*/i,
];

const DECISION_FIELD_RES = [/\*\*Decision:\*\*/i, /\*\*Why:\*\*/i];

/**
 * @param {string} reason
 * @returns {boolean}
 */
function reasonHasWaiverVerb(reason) {
  const lower = reason.toLowerCase();
  return WAIVER_VERB_TOKENS.some((token) => lower.includes(token));
}

/**
 * @param {string} diffText unified diff or empty
 * @returns {string}
 */
function extractAddedContent(diffText) {
  if (!diffText || !diffText.trim()) return '';
  return diffText
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

const STRICT_WAIVER_MIN_LENGTH = 40;
const STRICT_AUDIT_REF_RE = /(?:approved-by|waiver-approved|ticket|issue|ref|jira|#\d+)/i;

/**
 * @param {string} addedContent
 * @param {object} [options]
 * @returns {boolean}
 */
function matchesWaiver(addedContent, options) {
  options = options || {};
  if (!addedContent || !addedContent.trim()) return false;
  const match = addedContent.match(WAIVER_RE);
  if (!match) return false;
  const reason = match[1].trim();
  const minLength = options.strict ? STRICT_WAIVER_MIN_LENGTH : NO_LOG_MIN_REASON_LENGTH;
  if (reason.length < minLength) return false;
  if (options.strict && !STRICT_AUDIT_REF_RE.test(reason)) {
    return false;
  }
  return reasonHasWaiverVerb(reason);
}

/**
 * @param {string} addedContent
 * @returns {boolean}
 */
function matchesAntiPatternEntry(addedContent) {
  if (!addedContent || !addedContent.trim()) return false;
  if (!ENTRY_HEADER_RE.test(addedContent)) return false;
  return ANTI_PATTERN_FIELD_RES.some((re) => re.test(addedContent));
}

/**
 * @param {string} addedContent
 * @returns {boolean}
 */
function matchesDecisionEntry(addedContent) {
  if (!addedContent || !addedContent.trim()) return false;
  if (!ENTRY_HEADER_RE.test(addedContent)) return false;
  return DECISION_FIELD_RES.every((re) => re.test(addedContent));
}

/**
 * @param {string} addedContent
 * @param {object} [options]
 * @returns {boolean}
 */
function hasValidLogEvidence(addedContent, options) {
  return (
    matchesWaiver(addedContent, options) ||
    matchesAntiPatternEntry(addedContent) ||
    matchesDecisionEntry(addedContent)
  );
}

/**
 * @param {string} diffText git diff output for log file(s)
 * @param {object} [options]
 * @returns {boolean}
 */
function validateLogEvidenceFromDiff(diffText, options) {
  return hasValidLogEvidence(extractAddedContent(diffText), options);
}

function buildEvidenceFailureMessage(options) {
  options = options || {};
  if (options.strict) {
    return (
      'Closing-the-loop check failed: decisions.md or anti-patterns.md was touched, ' +
      'but the change does not contain valid evidence.\n\n' +
      'Strict governance mode is active:\n' +
      `- Waivers require an explicit audit reference (e.g. ticket: #123, approved-by: lead, ref:, waiver-approved:) ` +
      `and at least ${STRICT_WAIVER_MIN_LENGTH} characters:\n` +
      '  <!-- no-log: ticket: #123 approved-by: lead - urgent fix without architectural changes -->\n' +
      '- An anti-pattern entry: ### YYYY-MM-DD — title plus **What happened:** / **Root cause:** / **Avoid:**\n' +
      '- A decision entry: ### YYYY-MM-DD — title plus **Decision:** and **Why:**\n'
    );
  }
  return (
    'Closing-the-loop check failed: decisions.md or anti-patterns.md was touched, ' +
    'but the change does not contain valid evidence.\n\n' +
    'Add one of the following in this turn (see .agent-room/skills/closing-the-loop.md):\n' +
    `- A waiver with a real reason (at least ${NO_LOG_MIN_REASON_LENGTH} characters after no-log:, ` +
    'including a deliberate keyword such as routine, fix, or test):\n' +
    '  <!-- no-log: routine change, no decision or anti-pattern worth recording -->\n' +
    '- An anti-pattern entry: ### YYYY-MM-DD — title plus **What happened:** / **Root cause:** / **Avoid:**\n' +
    '- A decision entry: ### YYYY-MM-DD — title plus **Decision:** and **Why:**\n'
  );
}

module.exports = {
  NO_LOG_MIN_REASON_LENGTH,
  STRICT_WAIVER_MIN_LENGTH,
  STRICT_AUDIT_REF_RE,
  WAIVER_VERB_TOKENS,
  reasonHasWaiverVerb,
  extractAddedContent,
  matchesWaiver,
  matchesAntiPatternEntry,
  matchesDecisionEntry,
  hasValidLogEvidence,
  validateLogEvidenceFromDiff,
  buildEvidenceFailureMessage,
};
