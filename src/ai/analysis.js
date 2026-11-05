/**
 * AI risk analysis module — hybrid rule-based + LLM scoring.
 *
 * ponytail: falls back to pure rule-based when LLM is unavailable or
 *   returns invalid JSON. Upgrade path: swap LLM call for fine-tuned
 *   classifier once training data is available (see AI-ROADMAP.md §0.9).
 */

import { createProvider, extractJson } from './provider.js';
import { ruleBasedRisk, scoreToLabel, suggestMitigations } from './risk.js';

/**
 * @typedef {Object} RiskRequest
 * @property {string} description
 * @property {string} [assignedTo]
 * @property {string} [changeRequest]
 * @property {string} [category]
 */

/**
 * @typedef {Object} RiskFactor
 * @property {string} factor
 * @property {'keyword'|'llm'} source
 */

/**
 * @typedef {Object} RiskResponse
 * @property {number} riskScore
 * @property {'low'|'medium'|'high'} riskLevel
 * @property {RiskFactor[]} flaggedFactors
 * @property {string[]} recommendedMitigations
 */

/**
 * @param {RiskRequest} input
 * @param {import('./provider.js').LlmProvider} [provider]
 * @returns {Promise<RiskResponse>}
 */
export async function analyzeRisk(input, provider = createProvider()) {
  const { description, assignedTo, changeRequest, category } = input;
  const rule = ruleBasedRisk(description);

  // If rules already push into high territory, short-circuit to avoid
  // unnecessary LLM cost.
  if (rule.score >= 70) {
    return {
      riskScore: rule.score,
      riskLevel: 'high',
      flaggedFactors: rule.factors.map((f) => ({ factor: f, source: 'keyword' })),
      recommendedMitigations: suggestMitigations(rule.factors),
    };
  }

  const prompt = `Analisis risiko tiket Change Request ServiceNow berikut. Return JSON: {riskScore (0-100), riskLevel (low/medium/high), flaggedFactors: [{factor, source}], recommendedMitigations: [string]}.
Source harus 'keyword' atau 'llm'. Jika source 'keyword', cantumkan kata kunci yang terdeteksi.

Tiket:
- Nomor: ${changeRequest || '-'}
- Kategori: ${category || '-'}
- Assignee: ${assignedTo || '-'}
- Deskripsi: ${(description || '').slice(0, 600)}

Output hanya JSON valid.`;

  try {
    const raw = await provider.chat([{ role: 'user', content: prompt }]);
    const json = extractJson(raw);
    if (!json) throw new Error('No JSON in response');
    const parsed = JSON.parse(json);

    const score = Number(parsed.riskScore) || rule.score;
    const level = ['low', 'medium', 'high'].includes(parsed.riskLevel)
      ? parsed.riskLevel
      : scoreToLabel(score);

    // Merge rule factors (keyword source) with LLM factors.
    const llmFactors = Array.isArray(parsed.flaggedFactors)
      ? parsed.flaggedFactors
      : [];
    const allFactors = [
      ...rule.factors.map((f) => ({ factor: f, source: 'keyword' })),
      ...llmFactors.filter(
        (lf) => !rule.factors.includes(lf.factor)
      ),
    ];

    return {
      riskScore: Math.max(0, Math.min(100, score)),
      riskLevel: level,
      flaggedFactors: allFactors,
      recommendedMitigations: Array.isArray(parsed.recommendedMitigations)
        ? parsed.recommendedMitigations
        : suggestMitigations(rule.factors),
    };
  } catch {
    // Fallback to pure rule-based on any LLM failure.
    return {
      riskScore: rule.score,
      riskLevel: scoreToLabel(rule.score),
      flaggedFactors: rule.factors.map((f) => ({ factor: f, source: 'keyword' })),
      recommendedMitigations: suggestMitigations(rule.factors),
    };
  }
}
