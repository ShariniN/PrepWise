import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWithFallback, parseModelList } from '../services/geminiClient.js';

const err = (status, msg = 'x') => Object.assign(new Error(`[${status}] ${msg}`), { status });

// A fake Gemini client: each model name maps to a list of outcomes, consumed one per call.
const fakeClient = (plan) => {
  const calls = [];
  return {
    calls,
    getGenerativeModel: ({ model, generationConfig }) => ({
      generateContent: async () => {
        calls.push({ model, temperature: generationConfig?.temperature });
        const next = (plan[model] || []).shift();
        if (next instanceof Error) throw next;
        if (next === undefined) throw err(500, 'no plan');
        return { response: { text: () => next } };
      },
    }),
  };
};

const noSleep = async () => {};

test('uses the first model when it works', async () => {
  const c = fakeClient({ a: ['0.4'] });
  const r = await generateWithFallback('p', { client: c, models: ['a', 'b'], sleep: noSleep });
  assert.deepEqual(r, { text: '0.4', model: 'a' });
});

test('skips a model that is over quota (429) or retired (404)', async () => {
  const c = fakeClient({ a: [err(429)], b: [err(404)], c: ['0.3'] });
  const r = await generateWithFallback('p', { client: c, models: ['a', 'b', 'c'], sleep: noSleep });
  assert.equal(r.model, 'c');
  assert.deepEqual(c.calls.map((x) => x.model), ['a', 'b', 'c']);
});

test('retries an overloaded model (503) once before moving on', async () => {
  const c = fakeClient({ a: [err(503), '0.6'] });
  const r = await generateWithFallback('p', { client: c, models: ['a', 'b'], sleep: noSleep });
  assert.equal(r.model, 'a');
  assert.equal(c.calls.length, 2);
});

test('throws a clear error naming every model when all fail', async () => {
  const c = fakeClient({ a: [err(429)], b: [err(503), err(503)] });
  await assert.rejects(
    generateWithFallback('p', { client: c, models: ['a', 'b'], sleep: noSleep }),
    (e) => /a: .*429/.test(e.message) && /b: .*503/.test(e.message),
  );
});

test('passes the temperature through so scores are repeatable', async () => {
  const c = fakeClient({ a: ['0.5'] });
  await generateWithFallback('p', { client: c, models: ['a'], temperature: 0, sleep: noSleep });
  assert.equal(c.calls[0].temperature, 0);
});

test('model lists come from a comma-separated setting', () => {
  assert.deepEqual(parseModelList(' x , y,,z '), ['x', 'y', 'z']);
  assert.deepEqual(parseModelList('', ['d']), ['d']);
});
