import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { cooldownMs, GROQ_DEFAULT_MODEL, groqKeys, isRetryable, MissingKeyError, providers, withFallback } from '../app/server/provider.ts';

const apiError = (status, message = 'boom', headers = {}) => OpenAI.APIError.generate(status, undefined, message, new Headers(headers));
const fake = (name, model) => ({ name, model, label: name, client: null });
const pick = (list) => list.map((p) => [p.label, p.model]);
// Each test uses its own key names because key cooldowns live in module state.
const env = (keys, extra = {}) => ({ GROQ_API_KEYS: keys, ...extra });
const failing = (statuses) => async (p) => {
  const status = statuses[p.label];
  if (status) throw apiError(status, 'Please try again in 2m30s.');
  return p.label;
};

test('groqKeys puts GROQ_API_KEY first, splits on commas and newlines, trims and dedupes', () => {
  assert.deepEqual(groqKeys({ GROQ_API_KEY: ' a ', GROQ_API_KEYS: 'b, a,\n c ,,\n\nb' }), ['a', 'b', 'c']);
  assert.deepEqual(groqKeys({ GROQ_API_KEYS: ' , \n' }), []);
  assert.deepEqual(groqKeys({}), []);
});

test('providers lists every Groq key in order, then OpenAI with the caller model', () => {
  assert.deepEqual(pick(providers('gpt-5.5', env('p1,p2', { OPENAI_API_KEY: 'o' }))), [
    ['groq key 1 of 2', GROQ_DEFAULT_MODEL],
    ['groq key 2 of 2', GROQ_DEFAULT_MODEL],
    ['openai', 'gpt-5.5'],
  ]);
  assert.deepEqual(pick(providers('gpt-5.5', { GROQ_API_KEY: 'p3', GROQ_MODEL: 'openai/gpt-oss-20b' })), [
    ['groq key 1 of 1', 'openai/gpt-oss-20b'],
  ]);
});

test('no Groq keys means OpenAI only, and no keys at all is a missing key error', () => {
  assert.deepEqual(pick(providers('gpt-5.4-mini', { OPENAI_API_KEY: 'o' })), [['openai', 'gpt-5.4-mini']]);
  assert.throws(() => providers('gpt-5.4-mini', {}), MissingKeyError);
});

test('isRetryable covers 413, 429, 5xx and network errors only', () => {
  assert.equal(isRetryable(apiError(413)), true);
  assert.equal(isRetryable(apiError(429)), true);
  assert.equal(isRetryable(apiError(503)), true);
  assert.equal(isRetryable(new OpenAI.APIConnectionError({ message: 'down' })), true);
  assert.equal(isRetryable(apiError(400)), false);
  assert.equal(isRetryable(apiError(401)), false);
  assert.equal(isRetryable(new Error('plain')), false);
});

test('cooldownMs reads retry-after, then the Groq message, then defaults to a minute, clamped to 1s..1 day', () => {
  assert.equal(cooldownMs(apiError(429, 'x', { 'retry-after': '7' })), 7000);
  assert.equal(cooldownMs(apiError(429, 'Please try again in 6m6.768s. Need more tokens?')), 366_768);
  assert.equal(cooldownMs(apiError(429, 'Please try again in 270ms.')), 1000);
  assert.equal(cooldownMs(apiError(429, 'x', { 'retry-after': '0.2' })), 1000);
  assert.equal(cooldownMs(apiError(429, 'x', { 'retry-after': '999999' })), 86_400_000);
  assert.equal(cooldownMs(apiError(429, 'Please try again in 30h0m0s.')), 86_400_000);
  assert.equal(cooldownMs(apiError(429, 'no hint')), 60_000);
});

test('a 429 on one key moves to the next key and cools the first one down', async () => {
  const e = env('r1,r2');
  const out = await withFallback(providers('m', e, 1000), failing({ 'groq key 1 of 2': 429 }), () => 1000);
  assert.equal(out.result, 'groq key 2 of 2');
  assert.deepEqual(pick(providers('m', e, 1000 + 149_000)).map(([l]) => l), ['groq key 2 of 2']);
  assert.deepEqual(pick(providers('m', e, 1000 + 150_000)).map(([l]) => l), ['groq key 1 of 2', 'groq key 2 of 2']);
});

test('a 401 moves to the next key and benches the bad key for an hour', async () => {
  const e = env('a1,a2');
  const out = await withFallback(providers('m', e, 0), failing({ 'groq key 1 of 2': 401 }), () => 0);
  assert.equal(out.result, 'groq key 2 of 2');
  assert.equal(providers('m', e, 3_599_999).length, 1);
  assert.equal(providers('m', e, 3_600_000).length, 2);
});

test('when every key is rate limited, OpenAI answers once', async () => {
  const e = env('x1,x2', { OPENAI_API_KEY: 'o' });
  const calls = [];
  const out = await withFallback(providers('o-model', e, 0), async (p) => {
    calls.push(p.label);
    if (p.name === 'groq') throw apiError(p.label.includes('1 of') ? 429 : 413);
    return 'ok';
  });
  assert.deepEqual(calls, ['groq key 1 of 2', 'groq key 2 of 2', 'openai']);
  assert.deepEqual(out, { result: 'ok', model: 'o-model' });
  assert.deepEqual(pick(providers('o-model', e, 1000)), [['openai', 'o-model']]);
});

test('when every key is cooling and there is no OpenAI key, the call fails as rate limited', async () => {
  const e = env('c1');
  await assert.rejects(withFallback(providers('m', e, 0), failing({ 'groq key 1 of 1': 429 }), () => 0), { status: 429 });
  assert.throws(() => providers('m', e, 1000), { status: 429 });
});

test('no OpenAI fallback after a bad request or an auth failure on the last key', async () => {
  const calls = [];
  const run = (err) =>
    withFallback([fake('groq', 'g'), fake('openai', 'o')], async (p) => {
      calls.push(p.name);
      throw err;
    });
  await assert.rejects(run(apiError(400)), { status: 400 });
  await assert.rejects(run(apiError(401)), { status: 401 });
  assert.deepEqual(calls, ['groq', 'groq']);
});
