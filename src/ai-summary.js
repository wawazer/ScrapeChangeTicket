const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

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
 * Summarizes a ServiceNow ticket using Groq AI API.
 * @param {SummaryRequest} input
 * @returns {Promise<SummaryResponse>}
 */
export async function summarizeTicket(input) {
  if (!GROQ_API_KEY) throw new Error('Groq API key tidak dikonfigurasi');

  const prompt = `Berikut adalah tiket Change Request dari ServiceNow. Ringkas dalam format JSON dengan field: summary (1-2 kalimat), riskLevel (low/medium/high), category (infrastructure/config/patch/hotfix/application/other).

Tiket:
- Nomor: ${input.changeRequest || '-'}
- Deskripsi: ${(input.description || '').slice(0, 500)}
- Ditetapkan ke: ${input.assignedTo || '-'}

Output hanya JSON valid: {"summary":"...","riskLevel":"...","category":"..."}`;

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menghubungi AI untuk summarization');
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  try {
    // Extract JSON from possible markdown code block
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || 'Tidak tersedia',
      riskLevel: ['low', 'medium', 'high'].includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
      category: parsed.category || 'Other',
    };
  } catch {
    return {
      summary: text.trim() || 'Tidak tersedia',
      riskLevel: 'medium',
      category: 'Other',
    };
  }
}
