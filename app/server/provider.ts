import OpenAI, { APIError } from 'openai';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_COOLDOWN_MS = 60_000;
const AUTH_COOLDOWN_MS = 60 * 60_000;

/** One cached client per Groq key, plus the time until which that key is skipped. */
type KeySlot = { client: OpenAI; until: number };
export type Provider = { name: 'groq' | 'openai'; client: OpenAI; model: string; label: string; slot?: KeySlot };
type Env = Record<string, string | undefined>;

export class MissingKeyError extends Error {
  constructor() {
    super('The server is missing GROQ_API_KEY or OPENAI_API_KEY.');
  }
}

/** GROQ_API_KEY first, then GROQ_API_KEYS (comma or newline separated), trimmed and deduped in order. */
export function groqKeys(env: Env = process.env) {
  const all = [env.GROQ_API_KEY ?? '', ...(env.GROQ_API_KEYS ?? '').split(/[,\n]/)].map((k) => k.trim()).filter(Boolean);
  return [...new Set(all)];
}

const slots = new Map<string, KeySlot>();
function slotFor(key: string) {
  let s = slots.get(key);
  if (!s) {
    // One SDK retry per key so a rate limit moves on to the next key quickly.
    s = { client: new OpenAI({ apiKey: key, baseURL: GROQ_BASE_URL, maxRetries: 1, timeout: 45_000 }), until: 0 };
    slots.set(key, s);
  }
  return s;
}

let openaiClient: OpenAI | null = null;

/** Groq keys not cooling down, in order, then OpenAI (with the caller's model) when OPENAI_API_KEY is set. */
export function providers(openaiModel: string, env: Env = process.env, now = Date.now()): Provider[] {
  const keys = groqKeys(env);
  const model = env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  const list: Provider[] = [];
  keys.forEach((key, i) => {
    const slot = slotFor(key);
    if (slot.until <= now) list.push({ name: 'groq', client: slot.client, model, label: `groq key ${i + 1} of ${keys.length}`, slot });
  });
  if (keys.length && !list.length && !env.OPENAI_API_KEY) {
    throw OpenAI.APIError.generate(429, undefined, 'Every Groq key is cooling down.', new Headers());
  }
  if (env.OPENAI_API_KEY) {
    openaiClient ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 2, timeout: 45_000 });
    list.push({ name: 'openai', client: openaiClient, model: openaiModel, label: 'openai' });
  }
  if (!list.length) throw new MissingKeyError();
  return list;
}

/** Rate limits, oversized requests (Groq's 413 for the per-minute token budget), server errors and network failures. */
export function isRetryable(err: unknown) {
  if (!(err instanceof OpenAI.APIError) || err instanceof OpenAI.APIUserAbortError) return false;
  return err.status === undefined || err.status === 413 || err.status === 429 || err.status >= 500;
}

const clampCooldown = (ms: number) => Math.min(Math.max(ms, 1000), 86_400_000);

/** Milliseconds to wait (1s to 1 day) from the retry-after header, else Groq's "try again in 6m6.7s" text, else a minute. */
export function cooldownMs(err: APIError) {
  const header = Number(err.headers?.get('retry-after'));
  if (header > 0) return clampCooldown(header * 1000);
  const text = /try again in ([\d.hms]+)/.exec(err.message)?.[1] ?? '';
  const unit = { h: 3_600_000, m: 60_000, s: 1000, ms: 1 } as const;
  let ms = 0;
  for (const [, n, u] of text.matchAll(/([\d.]+)(ms|h|m|s)/g)) ms += Number(n) * unit[u as keyof typeof unit];
  return ms > 0 ? clampCooldown(ms) : DEFAULT_COOLDOWN_MS;
}

/** On a Groq key: 429/413 cool the key until retry-after, 401/403 for an hour, then try the next key. */
function coolDown(p: Provider, err: unknown, now: number) {
  if (!p.slot || !(err instanceof OpenAI.APIError)) return false;
  if (err.status === 429 || err.status === 413) p.slot.until = now + cooldownMs(err);
  else if (err.status === 401 || err.status === 403) p.slot.until = now + AUTH_COOLDOWN_MS;
  else return false;
  return true;
}

/**
 * Tries each Groq key in turn, then OpenAI once if the last Groq error was retryable.
 * Any other failure is rethrown as is.
 */
export async function withFallback<T>(
  list: Provider[],
  call: (p: Provider) => Promise<T>,
  now: () => number = Date.now,
): Promise<{ result: T; model: string }> {
  let lastErr: unknown;
  for (const p of list) {
    if (p.name === 'openai' && lastErr !== undefined && !isRetryable(lastErr)) break;
    try {
      return { result: await call(p), model: p.model };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status ?? 'network';
      if (p.name === 'groq' && (coolDown(p, err, now()) || isRetryable(err))) {
        console.warn(`${p.label} failed (${status}), trying the next provider`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
