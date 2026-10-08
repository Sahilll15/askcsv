import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { GROQ_DEFAULT_MODEL, MissingKeyError, isRetryable, providers, withFallback } from '../app/server/provider.ts';

const apiError = (status) => OpenAI.APIError.generate(status, undefined, 'boom', new Headers());
const fake = (name, model) => ({ name, model, client: null });

test('providers picks Groq first, then OpenAI with the caller model', () => {
  const both = providers('gpt-5.5', { GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o' });
  assert.deepEqual(both.map((p) => [p.name, p.model]), [['groq', GROQ_DEFAULT_MODEL], ['openai', 'gpt-5.5']]);

  const custom = providers('gpt-5.5', { GROQ_API_KEY: 'g', GROQ_MODEL: 'openai/gpt-oss-20b' });
  assert.deepEqual(custom.map((p) => [p.name, p.model]), [['groq', 'openai/gpt-oss-20b']]);

  const openaiOnly = providers('gpt-5.4-mini', { OPENAI_API_KEY: 'o' });
  assert.deepEqual(openaiOnly.map((p) => [p.name, p.model]), [['openai', 'gpt-5.4-mini']]);

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

test('withFallback retries once on OpenAI after a retryable Groq failure', async () => {
  const calls = [];
  const out = await withFallback([fake('groq', 'g-model'), fake('openai', 'o-model')], async (p) => {
    calls.push(p.name);
    if (p.name === 'groq') throw apiError(429);
    return 'ok';
  });
  assert.deepEqual(calls, ['groq', 'openai']);
  assert.deepEqual(out, { result: 'ok', model: 'o-model' });
});

test('withFallback does not fall back on a bad request or without a second provider', async () => {
  const calls = [];
  const run = (list, err) =>
    withFallback(list, async (p) => {
      calls.push(p.name);
      throw err;
    });
  await assert.rejects(run([fake('groq', 'g'), fake('openai', 'o')], apiError(400)), { status: 400 });
  await assert.rejects(run([fake('groq', 'g')], apiError(429)), { status: 429 });
  assert.deepEqual(calls, ['groq', 'groq']);
});

test('withFallback returns the first provider result and model when it succeeds', async () => {
  const out = await withFallback([fake('groq', 'g-model'), fake('openai', 'o-model')], async () => 42);
  assert.deepEqual(out, { result: 42, model: 'g-model' });
});

test('withFallback moves to OpenAI when Groq rejects a request as too large (413)', async () => {
  const out = await withFallback([fake('groq', 'g-model'), fake('openai', 'o-model')], async (p) => {
    if (p.name === 'groq') throw apiError(413);
    return 'ok';
  });
  assert.deepEqual(out, { result: 'ok', model: 'o-model' });
});
