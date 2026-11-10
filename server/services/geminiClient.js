// Calls Gemini with a list of models in order of preference.
//  - 429 (over quota) or 404 (model retired): move straight to the next model.
//  - 503 (overloaded) or a network error: wait briefly, retry once, then move on.
//  - Anything else (e.g. a bad API key): skip that provider's remaining models (they would fail the
//    same way) and continue with the next provider, if any.
// Returns { text, model } so callers can show which model produced the result.
//
// Entries may name another provider with a prefix: "groq:openai/gpt-oss-120b" goes to Groq's
// OpenAI-compatible API (needs GROQ_API_KEY). Unprefixed names are Gemini models.
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export const parseModelList = (value, fallback = []) => {
  const list = String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : fallback;
};

const statusOf = (e) => {
  if (e?.status) return e.status;
  const m = String(e?.message).match(/\[(\d{3})[ \]]/);
  return m ? Number(m[1]) : null;
};

let defaultClient;
const getDefaultClient = () => (defaultClient ||= new GoogleGenerativeAI(process.env.GEMINI_API_KEY));

const PROVIDER_URLS = { groq: 'https://api.groq.com/openai/v1' };
const PROVIDER_KEYS = { groq: 'GROQ_API_KEY' };
const providerClients = {};
// null when the provider has no API key, so its models are skipped.
const getProviderClient = (provider) => {
  if (!(provider in providerClients)) {
    const key = process.env[PROVIDER_KEYS[provider]];
    providerClients[provider] = key && PROVIDER_URLS[provider] ? new OpenAI({ apiKey: key, baseURL: PROVIDER_URLS[provider] }) : null;
  }
  return providerClients[provider];
};

const splitModel = (name) => {
  const m = /^([a-z]+):(.+)$/.exec(name);
  return m && PROVIDER_URLS[m[1]] ? { provider: m[1], model: m[2] } : { provider: 'gemini', model: name };
};

export const generateWithFallback = async (prompt, {
  models,
  temperature,
  client,
  providers = {},
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) => {
  const failures = [];
  const rejected = new Set(); // providers whose key was refused: their other models will fail the same way
  for (const name of models) {
    const { provider, model: modelId } = splitModel(name);
    if (rejected.has(provider)) { failures.push(`${name}: skipped (${provider} key rejected)`); continue; }
    let call;
    if (provider === 'gemini') {
      const generationConfig = temperature === undefined ? undefined : { temperature };
      const model = (client || getDefaultClient()).getGenerativeModel({ model: modelId, generationConfig });
      call = async () => (await model.generateContent(prompt)).response.text().trim();
    } else {
      const api = provider in providers ? providers[provider] : getProviderClient(provider);
      if (!api) { failures.push(`${name}: not configured (no ${PROVIDER_KEYS[provider]})`); continue; }
      call = async () => {
        const res = await api.chat.completions.create({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          ...(temperature === undefined ? {} : { temperature }),
        });
        return String(res.choices?.[0]?.message?.content ?? '').trim();
      };
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return { text: await call(), model: name };
      } catch (e) {
        const status = statusOf(e);
        const transient = status === 503 || status === 500 || status === null;
        if (transient && attempt === 1) { await sleep(1500); continue; }
        failures.push(`${name}: ${status ?? 'error'} ${String(e.message).replace(/https:\/\/\S+/g, '').slice(0, 120)}`);
        const tryNextModel = status === 429 || status === 404 || transient;
        if (!tryNextModel) rejected.add(provider);
        break;
      }
    }
  }
  throw new Error(`All AI models failed. ${failures.join(' | ')}`);
};
