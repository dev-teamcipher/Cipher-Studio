// Multi-provider LLM client: Gemini official, OpenRouter, or any custom OpenAI-compatible base URL.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
  'gemini-2.0-flash',
];

// Curated picks shown as a friendly dropdown. `best`: which job it suits.
// analysis = reads long transcripts (needs big context, cheap). writer = storytelling quality.
const CURATED = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Fast + very cheap · best for Analysis', best: 'analysis' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Smarter, costs more · good for Writing', best: 'writer' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', note: 'Newest Google model' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Older, cheapest' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', note: 'Best storytelling · recommended for Writing', best: 'writer' },
    { id: 'anthropic/claude-opus-4.1', label: 'Claude Opus 4.1', note: 'Highest quality, most expensive' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Cheap + huge context · great for Analysis', best: 'analysis' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Balanced quality' },
    { id: 'openai/gpt-4.1', label: 'GPT-4.1', note: 'Solid all-rounder' },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', note: 'Very cheap, decent quality' },
  ],
  custom: [
    { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', note: 'Cheap + big context · Analysis', best: 'analysis' },
    { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', note: 'Balanced' },
    { id: 'claude-sonnet-5', label: 'claude-sonnet-5', note: 'Great storytelling · Writing', best: 'writer' },
    { id: 'claude-opus-4-8', label: 'claude-opus-4-8', note: 'Top quality, pricier' },
  ],
};

function baseFor(cfg) {
  if (cfg.provider === 'openrouter') return 'https://openrouter.ai/api/v1';
  if (cfg.provider === 'custom') return (cfg.baseUrl || '').replace(/\/+$/, '');
  return null;
}

async function chatLLM(cfg, { system, user, maxTokens = 8192, temperature = 0.85 }) {
  if (!cfg || !cfg.apiKey) throw new Error('API key missing — open Settings and add it.');
  if (!cfg.model) throw new Error('Model missing — open Settings and pick a model.');

  if (cfg.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system || '' }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (j && j.error && j.error.message) || JSON.stringify(j);
      throw new Error('Gemini API ' + res.status + ': ' + String(msg).slice(0, 300));
    }
    const cand = j && j.candidates && j.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const text = parts.map((p) => p.text || '').join('');
    if (!text) {
      throw new Error('Gemini returned empty response' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''));
    }
    return text;
  }

  const base = baseFor(cfg);
  if (!base) throw new Error('Base URL missing for custom provider — open Settings.');
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (j && ((j.error && j.error.message) || j.message)) || '';
    throw new Error('LLM API ' + res.status + ': ' + String(msg).slice(0, 300));
  }
  const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new Error('LLM returned empty response');
  return text;
}

async function listLLMModels(cfg) {
  if (cfg.provider === 'gemini') {
    if (!cfg.apiKey) return GEMINI_MODELS;
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': cfg.apiKey },
      });
      const j = await res.json();
      const arr = (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
      return arr.length ? arr : GEMINI_MODELS;
    } catch {
      return GEMINI_MODELS;
    }
  }
  const base = baseFor(cfg);
  if (!base) return [];
  try {
    const res = await fetch(base + '/models', {
      headers: cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {},
    });
    const j = await res.json();
    const arr = j.data || j.models || [];
    return arr.map((m) => m.id || m.name).filter(Boolean).slice(0, 500);
  } catch {
    return [];
  }
}

function curatedFor(provider) {
  return CURATED[provider] || CURATED.custom;
}

module.exports = { chatLLM, listLLMModels, curatedFor, GEMINI_MODELS, CURATED };


