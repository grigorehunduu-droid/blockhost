'use strict';
// Anthropic / OpenAI / Gemini. Keys come from data/settings.json and never leave the backend.
const { fetchJson } = require('./util');
const J = { 'Content-Type': 'application/json' };
// Thinking models often stay silent for 30+ s before answering, so allow 3 minutes.
const post = (url, headers, body) => fetchJson(url, { method: 'POST', headers: { ...J, ...headers }, body: JSON.stringify(body), timeout: 180000 });

async function models(provider, key) {
  if (!key) throw new Error('No API key saved for ' + provider);
  if (provider === 'anthropic') return (await fetchJson('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })).data.map((m) => m.id);
  if (provider === 'openai') return (await fetchJson('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + key } })).data.map((m) => m.id).filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/audio|realtime|tts|whisper|image|embed|transcribe|moderation|search|codex|instruct/.test(id)).sort().reverse();
  if (provider === 'gemini') return (await fetchJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } })).models.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  throw new Error('unknown provider');
}
async function chat(provider, key, model, system, msgs) {
  if (!key) throw new Error('No API key saved for ' + provider);
  if (provider === 'anthropic') {
    const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { model, max_tokens: 2000, system, messages: msgs });
    return { text: j.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), inTok: j.usage?.input_tokens || 0, outTok: j.usage?.output_tokens || 0 };
  }
  if (provider === 'openai') {
    const H = { Authorization: 'Bearer ' + key };
    try {
      const j = await post('https://api.openai.com/v1/responses', H, { model, instructions: system, input: msgs });
      return { text: j.output_text ?? (j.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join(''), inTok: j.usage?.input_tokens || 0, outTok: j.usage?.output_tokens || 0 };
    } catch (e1) {
      try { const c = await post('https://api.openai.com/v1/chat/completions', H, { model, messages: [{ role: 'system', content: system }, ...msgs] }); return { text: c.choices[0].message.content, inTok: c.usage?.prompt_tokens || 0, outTok: c.usage?.completion_tokens || 0 }; }
      catch (e2) { throw new Error(e1.message); }
    }
  }
  if (provider === 'gemini') {
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) });
    return { text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''), inTok: j.usageMetadata?.promptTokenCount || 0, outTok: j.usageMetadata?.candidatesTokenCount || 0 };
  }
  throw new Error('unknown provider');
}
// Provider errors are JSON blobs; show something a non-technical person can act on.
function friendly(e) {
  const m = /HTTP (\d+)/.exec(e.message), c = m ? +m[1] : 0;
  if ([400, 401, 403].includes(c) && /key|auth|permission|credential/i.test(e.message)) return new Error("The AI key wasn't accepted. Copy it again from the provider's key page and reconnect (Ask AI > AI settings > Remove key).");
  if (c === 429) return new Error('The AI provider says you are out of free or paid usage for now. Wait a bit, or check your account.');
  if (c === 404 && /model/i.test(e.message)) return new Error("That AI model isn't available to your key anymore. Pick another one in Ask AI > AI settings.");
  if (c === 503) return new Error('The AI model you picked is overloaded right now. Try again in a few minutes, or pick another model in Ask AI > AI settings.');
  if (c >= 500) return new Error('The AI service is having trouble right now. Try again in a minute.');
  return new Error(String(e.message).slice(0, 220));
}
module.exports = { models: (...a) => models(...a).catch((e) => { throw friendly(e); }), chat: (...a) => chat(...a).catch((e) => { throw friendly(e); }) };
