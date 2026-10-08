import OpenAI from 'openai';
import { DEFAULT_MODEL, MODELS, type Usage } from '../../lib/api';
import { MissingKeyError, providers, withFallback, type Provider } from './provider';

// USD per 1M tokens, standard tier.
const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.5': { input: 5, output: 30 },
};

/** Calls Groq when configured, falling back to OpenAI with `openaiModel`. Returns the model that answered. */
export function callModel<T>(openaiModel: string, call: (p: Provider) => Promise<T>) {
  return withFallback(providers(openaiModel), call);
}

/** The OpenAI model to use: the client's pick from the whitelist, else OPENAI_MODEL. */
export function resolveModel(requested?: string) {
  const fallback = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  return MODELS.some((m) => m.id === requested) ? requested! : fallback;
}

export function usageOf(model: string, usage?: { input_tokens?: number; output_tokens?: number } | null): Usage {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  // Models without a price (the Groq free tier) count as zero.
  const price = PRICES[model] ?? { input: 0, output: 0 };
  return { inputTokens, outputTokens, costUsd: (inputTokens * price.input + outputTokens * price.output) / 1e6 };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

export function upstreamError(err: unknown) {
  if (err instanceof MissingKeyError) return Response.json({ error: err.message }, { status: 500 });
  if (err instanceof OpenAI.APIError && err.status === 429) {
    return Response.json({ error: 'The model provider is rate limiting us. Try again in a minute.' }, { status: 503 });
  }
  console.error(err);
  return Response.json({ error: 'The model call failed. Try again.' }, { status: 502 });
}
