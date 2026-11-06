/**
 * AI provider abstraction for ScrapeChangeTicket.
 *
 * ponytail: every provider here speaks the OpenAI-compatible chat API, so one
 *   fetch implementation serves all of them. Add a provider by adding an
 *   entry to PROVIDERS, then set AI_PROVIDER to its name.
 *   Upgrade path: give a provider its own chat() body only if its API stops
 *   being OpenAI-compatible.
 */

const PROVIDERS = {
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'qwen/qwen3.8-27b',
    apiKeyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
  },
  gemini: {
    endpoint: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.0-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
  },
  ollama: {
    endpoint: `${(process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '')}/v1/chat/completions`,
    model: 'llama3.2',
    modelEnv: 'OLLAMA_MODEL',
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
  },
};

function pickProvider(name) {
  const n = (name || 'groq').toLowerCase();
  if (!PROVIDERS[n]) throw new Error(`Provider "${name}" tidak didukung. Gunakan: ${Object.keys(PROVIDERS).join(', ')}`);
  return n;
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
 * Build a provider from environment, dispatching on AI_PROVIDER.
 * All supported providers speak the OpenAI-compatible chat completions API,
 * so the transport is shared and only endpoint/model/key differ.
 * @returns {LlmProvider}
 */
export function createProvider() {
  const providerName = pickProvider(process.env.AI_PROVIDER);
  const spec = PROVIDERS[providerName];
  const apiKey = process.env[spec.apiKeyEnv] || '';

  if (!apiKey && providerName !== 'ollama') {
    throw new Error(`${spec.apiKeyEnv} harus dikonfigurasi untuk provider ${providerName}`);
  }

  /** @type {LlmProvider} */
  return {
    async chat(messages) {
      const response = await fetch(spec.endpoint, {
        method: 'POST',
        headers: {
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env[spec.modelEnv] || spec.model,
          messages,
          max_tokens: 512,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `${providerName} API error ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
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

export { PROVIDERS };
