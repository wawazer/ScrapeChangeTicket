/**
 * Rule-based risk heuristics for ServiceNow change tickets.
 *
 * ponytail: simple keyword lists are used as a lower-bound baseline.
 *   Upgrade path: replace keywords with a learned model or enrich lists
 *   once manual labels are collected (see AI-ROADMAP.md §0.9).
 */

const HIGH_KEYWORDS = new Set([
  // Impact
  'downtime', 'maintenance window', 'service disruption', 'production', 'prod',
  'data loss', 'security', 'vulnerability', 'emergency',
  // Scope
  'migration', 'migrate', 'refactor', 'restructure', 'replatform',
  'database schema', 'schema change', 'alter table', 'drop table',
  'network rule', 'firewall', 'acl change', 'dns change',
  // Action
  'restart', 'reboot', 'failover', 'rollback',
]);

const MEDIUM_KEYWORDS = new Set([
  'staging', 'pre-prod', 'testing', 'uat',
  'performance', 'optimization', 'tuning',
  'deployment', 'deploy', 'release', 'rollback plan',
  'configuration', 'config',
]);

const LOW_KEYWORDS = new Set([
  'test', 'documentation', 'doc', 'minor', 'cosmetic',
  'typo', 'fix typo', 'label change', 'text change',
  'add user', 'remove user', 'reset password',
]);

/**
 * Score a ticket purely by keywords (0-100).
 * @param {string} text
 * @returns {{score: number, factors: string[]}}
 */
export function ruleBasedRisk(text) {
  if (!text) return { score: 30, factors: [] };
  const lower = text.toLowerCase();
  let score = 50;
  const factors = [];

  for (const kw of HIGH_KEYWORDS) {
    if (lower.includes(kw)) {
      score += 15;
      factors.push(kw);
    }
  }
  for (const kw of MEDIUM_KEYWORDS) {
    if (lower.includes(kw)) {
      score += 5;
      factors.push(kw);
    }
  }
  for (const kw of LOW_KEYWORDS) {
    if (lower.includes(kw)) {
      score -= 10;
      factors.push(kw);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}

/**
 * Map a numeric score to a label.
 * @param {number} score
 * @returns {'low'|'medium'|'high'}
 */
export function scoreToLabel(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Suggest mitigations based on detected high-risk factors.
 * @param {string[]} factors
 * @returns {string[]}
 */
export function suggestMitigations(factors) {
  const out = [];
  const set = new Set(factors);
  if (set.has('downtime') || set.has('service disruption') || set.has('production')) {
    out.push('Pastikan maintenance window dan komunikasi stakeholder');
  }
  if (set.has('database schema') || set.has('schema change')) {
    out.push('Verifikasi backup database sebelum eksekusi');
  }
  if (set.has('network rule') || set.has('firewall') || set.has('acl change')) {
    out.push('Konsultasikan dengan tim network security');
  }
  if (set.has('migration') || set.has('refactor')) {
    out.push('Siapkan rollback plan dan staging validation');
  }
  if (set.has('restart') || set.has('reboot')) {
    out.push('Pastikan service dependencies di-test setelah reboot');
  }
  if (out.length === 0) {
    out.push('Lakukan standard change review');
  }
  return out;
}
