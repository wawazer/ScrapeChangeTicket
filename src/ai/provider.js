/**
 * AI provider abstraction for ScrapeChangeTicket.
 *
 * ponytail: currently only Groq is implemented. Add a new provider by
 *   exporting an object matching the LlmProvider interface below, then wire
 *   it via AI_PROVIDER env (values: 'groq' | 'gemini' | 'ollama').
 *   Upgrade path: replace summarize() body per provider while keeping the
 *   same prompt shape and return contract.
 */

const DEFAULTS = {
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'qwen/qwen3.8-27b',
  },
};

function pickProvider(name) {
  const n = (name || 'groq').toLowerCase();
  if (n === 'groq') return 'groq';
  throw new Error(`Provider "${name}" tidak didukung. Gunakan: groq`);
}

/**
 * @typedef {Object} ChatMessage
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} LlmProvider
 * @property {(messages: ChatMessage[]) => Promise<string>} chat
 */

/**
 * Build a Groq-compatible provider from environment.
 * @returns {LlmProvider}
 */
export function createProvider() {
  const providerName = pickProvider(process.env.AI_PROVIDER);
  const defaults = DEFAULTS[providerName];
  const apiKey = process.env.GROQ_API_KEY || '';

  if (!apiKey && providerName === 'groq') {
    throw new Error('GROQ_API_KEY harus dikonfigurasi untuk provider Groq');
  }

  /** @type {LlmProvider} */
  const groq = {
    async chat(messages) {
      const response = await fetch(defaults.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || defaults.model,
          messages,
          max_tokens: 512,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Groq API error ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };

  return groq[providerName];
}

/**
 * Extract JSON from an LLM response that may wrap it in markdown fences.
 * @param {string} text
 * @returns {string|null}
 */
export function extractJson(text) {
  if (!text) return null;
  // Strip fenced code blocks: ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : text;
  // Grab the first JSON object in the string
  const match = candidate.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}
