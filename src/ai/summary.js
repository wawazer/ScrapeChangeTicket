/**
 * AI summarizer — delegates to the provider abstraction.
 *
 * ponytail: this file keeps the public summarizeTicket() API stable so
 *   src/server.js and future callers don't need changes when we add
 *   providers or swap models.
 */

import { createProvider, extractJson } from './provider.js';

/**
 * @typedef {Object} SummaryRequest
 * @property {string} description
 * @property {string} [assignedTo]
 * @property {string} [changeRequest]
 */

/**
 * @typedef {Object} SummaryResponse
 * @property {string} summary
 * @property {'low'|'medium'|'high'} riskLevel
 * @property {string} category
 */

/**
 * Summarizes a ServiceNow ticket using the configured AI provider.
 * Falls back to text parsing when JSON is malformed.
 *
 * @param {SummaryRequest} input
 * @param {import('./provider.js').LlmProvider} [provider]
 * @returns {Promise<SummaryResponse>}
 */
export async function summarizeTicket(input, provider = createProvider()) {
  const prompt = `Berikut adalah tiket Change Request dari ServiceNow. Ringkas dalam format JSON dengan field: summary (1-2 kalimat), riskLevel (low/medium/high), category (infrastructure/config/patch/hotfix/application/other).

Tiket:
- Nomor: ${input.changeRequest || '-'}
- Deskripsi: ${(input.description || '').slice(0, 500)}
- Ditetapkan ke: ${input.assignedTo || '-'}

Output hanya JSON valid: {"summary":"...","riskLevel":"...","category":"..."}`;

  try {
    const raw = await provider.chat([{ role: 'user', content: prompt }]);
    const json = extractJson(raw);
    if (!json) throw new Error('No JSON in response');
    const parsed = JSON.parse(json);
    return {
      summary: parsed.summary || 'Tidak tersedia',
      riskLevel: ['low', 'medium', 'high'].includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
      category: parsed.category || 'Other',
    };
  } catch {
    return {
      summary: 'Tidak tersedia',
      riskLevel: 'medium',
      category: 'Other',
    };
  }
}
