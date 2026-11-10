// Calls Gemini with a list of models in order of preference.
//  - 429 (over quota) or 404 (model retired): move straight to the next model.
//  - 503 (overloaded) or a network error: wait briefly, retry once, then move on.
//  - Anything else (e.g. a bad API key): stop, because another model will fail the same way.
// Returns { text, model } so callers can show which model produced the result.
import { GoogleGenerativeAI } from '@google/generative-ai';

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

export const generateWithFallback = async (prompt, {
  models,
  temperature,
  client = getDefaultClient(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) => {
  const failures = [];
  for (const name of models) {
    const generationConfig = temperature === undefined ? undefined : { temperature };
    const model = client.getGenerativeModel({ model: name, generationConfig });
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await model.generateContent(prompt);
        return { text: res.response.text().trim(), model: name };
      } catch (e) {
        const status = statusOf(e);
        const transient = status === 503 || status === 500 || status === null;
        if (transient && attempt === 1) { await sleep(1500); continue; }
        failures.push(`${name}: ${status ?? 'error'} ${String(e.message).replace(/https:\/\/\S+/g, '').slice(0, 120)}`);
        const tryNextModel = status === 429 || status === 404 || transient;
        if (!tryNextModel) throw new Error(`AI request failed. ${failures.join(' | ')}`);
        break;
      }
    }
  }
  throw new Error(`All AI models failed. ${failures.join(' | ')}`);
};
