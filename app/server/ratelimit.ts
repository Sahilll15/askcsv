import { Redis } from '@upstash/redis';
import type { Quota } from '../../lib/api';

const HOUR = 60 * 60 * 1000;
const LIVE_MS = 10 * 60 * 1000;
const SWEEP_EVERY = 60_000;

/** Reads a non-negative integer env var. Anything malformed falls back to the default instead of disabling the limit. */
export function envInt(raw: string | undefined, fallback: number, min = 0) {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= min ? n : fallback;
}

/** Canonical key for an address: ports, zones and brackets stripped, IPv6 grouped by /64. */
export function normalizeIp(raw: string) {
  let ip = raw.trim().toLowerCase();
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'));
  ip = ip.replace(/%.*$/, '');

  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) ip = mapped[1];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').every((o) => Number(o) <= 255) ? ip.split('.').map(Number).join('.') : 'invalid';
  }
  if (!ip.includes(':') || !/^[0-9a-f:]+$/.test(ip)) return 'invalid';

  const halves = ip.split('::');
  if (halves.length > 2) return 'invalid';
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return 'invalid';
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.some((g) => g.length === 0 || g.length > 4)) return 'invalid';
  // One subscriber usually owns a whole /64, so finer keys would let them rotate addresses.
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

// x-real-ip is overwritten by the platform proxy (Vercel). The leftmost x-forwarded-for
// entry is whatever the client sent, so only the last hop is used.
export function clientIp(req: Request) {
  const real = req.headers.get('x-real-ip');
  if (real?.trim()) return normalizeIp(real);
  const last = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
  return last ? normalizeIp(last) : 'unknown';
}

/** Hit log behind the quota. Redis in production, process memory when Redis is not configured. */
export interface HitStore {
  /** Hits newer than windowMs, oldest first. Records nothing. */
  hits(key: string, windowMs: number, now: number): Promise<number[]>;
  /** Atomically records a hit only if fewer than `limit` live hits exist, then returns the live hits. */
  take(key: string, limit: number, windowMs: number, now: number): Promise<{ ok: boolean; hits: number[] }>;
}

type Entry = { hits: number[]; windowMs: number };

export function createMemoryStore(maxKeys = 10_000): HitStore & { size(): number; has(key: string): boolean } {
  const buckets = new Map<string, Entry>();
  let lastSweep = 0;

  function sweep(now: number) {
    lastSweep = now;
    for (const [key, e] of buckets) {
      if (!e.hits.length || now - e.hits[e.hits.length - 1] >= e.windowMs) buckets.delete(key);
    }
  }

  function put(key: string, entry: Entry, now: number) {
    buckets.delete(key);
    buckets.set(key, entry);
    if (buckets.size <= maxKeys) return;
    if (now - lastSweep > SWEEP_EVERY) sweep(now);
    // Evict least recently touched keys one at a time; never wipe everyone's counters.
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value!);
  }

  const live = (key: string, windowMs: number, now: number) => (buckets.get(key)?.hits ?? []).filter((t) => now - t < windowMs);

  return {
    async hits(key, windowMs, now) {
      return live(key, windowMs, now);
    },
    async take(key, limit, windowMs, now) {
      const hits = live(key, windowMs, now);
      const ok = hits.length < limit;
      if (ok) hits.push(now);
      put(key, { hits, windowMs }, now);
      return { ok, hits: [...hits] };
    },
    size: () => buckets.size,
    has: (key) => buckets.has(key),
  };
}

/** The subset of the Upstash client the store uses, so tests can pass a fake. */
export type RedisLike = { eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> };

/** Thrown when Redis is configured but a call failed. Routes must refuse rather than run unmetered. */
export class LimiterUnavailable extends Error {
  constructor(cause: unknown) {
    super('rate limiter unavailable', { cause });
  }
}

// KEYS[1] list of hit times; ARGV limit, windowMs, now. The first hit starts the window and sets the expiry;
// a stale window is dropped first, and nothing is added once the limit is reached.
export const TAKE_SCRIPT = `
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local first = redis.call('LINDEX', KEYS[1], 0)
if first and now - tonumber(first) >= window then redis.call('DEL', KEYS[1]) end
local n = redis.call('LLEN', KEYS[1])
local ok = 0
if n < limit then
  redis.call('RPUSH', KEYS[1], ARGV[3])
  ok = 1
  if n == 0 then redis.call('PEXPIRE', KEYS[1], window) end
end
return {ok, redis.call('LRANGE', KEYS[1], 0, -1)}`;

export const HITS_SCRIPT = `return redis.call('LRANGE', KEYS[1], 0, -1)`;

/**
 * Fixed-window hit log in Redis under `rl:<app>:<bucket>:<client>`. The window opens on the first counted
 * hit and the whole log expires with it, so hits[0] + windowMs is the reset time.
 */
export function createRedisStore(redis: RedisLike, app = 'askcsv'): HitStore {
  const key = (k: string) => `rl:${app}:${k}`;
  const live = (raw: unknown, windowMs: number, now: number) => {
    const hits = (Array.isArray(raw) ? raw : []).map(Number).filter(Number.isFinite);
    return hits.length && now - hits[0] >= windowMs ? [] : hits;
  };
  const call = async (script: string, k: string, args: (string | number)[]) => {
    try {
      return await redis.eval(script, [key(k)], args);
    } catch (err) {
      throw new LimiterUnavailable(err);
    }
  };
  return {
    async hits(k, windowMs, now) {
      return live(await call(HITS_SCRIPT, k, []), windowMs, now);
    },
    async take(k, limit, windowMs, now) {
      const out = await call(TAKE_SCRIPT, k, [limit, windowMs, now]);
      if (!Array.isArray(out)) throw new LimiterUnavailable(new Error('unexpected reply'));
      return { ok: Number(out[0]) === 1, hits: live(out[1], windowMs, now) };
    },
  };
}

/** Upstash client from KV_REST_API_URL / KV_REST_API_TOKEN, or null to fall back to memory. */
export function redisFromEnv(): RedisLike | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, retry: { retries: 2, backoff: (n) => 100 * 2 ** n } });
}

export type QuotaConfig = { questions: number; followups: number; windowMs: number; liveMs: number };
export type LimitReason = 'questions' | 'no_live_question';
export type Gate = { ok: true; quota: Quota } | { ok: false; reason: LimitReason; quota: Quota; resetAt: number };

export function createQuota(store: HitStore, cfg: QuotaConfig) {
  const qKey = (ip: string) => `question:${ip}`;
  const fKey = (ip: string) => `followup:${ip}`;
  const resetOf = (hits: number[], now: number) => (hits[0] ?? now) + cfg.windowMs;

  /** Questions left as the client should show them. Spent follow-ups also block new questions. */
  async function peek(ip: string, now = Date.now()): Promise<Quota> {
    const [q, f] = await Promise.all([store.hits(qKey(ip), cfg.windowMs, now), store.hits(fKey(ip), cfg.windowMs, now)]);
    const questionsLeft = Math.max(0, cfg.questions - q.length);
    const followupsOut = f.length >= cfg.followups;
    const resetAt = Math.max(questionsLeft === 0 ? resetOf(q, now) : 0, followupsOut ? resetOf(f, now) : 0) || resetOf(q, now);
    return { limit: cfg.questions, remaining: followupsOut ? 0 : questionsLeft, resetAt };
  }

  const refuse = (reason: LimitReason, quota: Quota, resetAt = quota.resetAt): Gate => ({ ok: false, reason, quota, resetAt });

  return {
    peek,
    /** Counts one new question. */
    async question(ip: string, now = Date.now()): Promise<Gate> {
      const before = await peek(ip, now);
      if (before.remaining === 0) return refuse('questions', before);
      const r = await store.take(qKey(ip), cfg.questions, cfg.windowMs, now);
      const quota = await peek(ip, now);
      return r.ok ? { ok: true, quota } : refuse('questions', quota);
    },
    /** Repairs and answers ride on a question asked in the last liveMs and never count as one. */
    async followup(ip: string, now = Date.now()): Promise<Gate> {
      const last = (await store.hits(qKey(ip), cfg.windowMs, now)).at(-1);
      if (last === undefined || now - last >= cfg.liveMs) {
        const quota = await peek(ip, now);
        return refuse('no_live_question', quota, quota.remaining > 0 ? now : quota.resetAt);
      }
      const r = await store.take(fKey(ip), cfg.followups, cfg.windowMs, now);
      const quota = await peek(ip, now);
      return r.ok ? { ok: true, quota } : refuse('questions', quota, Math.max(quota.resetAt, resetOf(r.hits, now)));
    },
  };
}

const windowMs = envInt(process.env.RATE_LIMIT_WINDOW_MS, HOUR, 1000);
const questions = envInt(process.env.RATE_LIMIT_QUESTIONS, 10, 1);

export const CONFIG: QuotaConfig = {
  questions,
  followups: envInt(process.env.RATE_LIMIT_FOLLOWUPS, questions * 4),
  windowMs,
  liveMs: Math.min(LIVE_MS, windowMs),
};

const redis = redisFromEnv();
// Local runs against the shared database set this so they never spend production's counters.
export const quota = createQuota(redis ? createRedisStore(redis, process.env.RATE_LIMIT_NAMESPACE || 'askcsv') : createMemoryStore(), CONFIG);

export function limiterBusy() {
  return Response.json(
    { error: 'The service is busy, try again in a minute.', reason: 'limiter_unavailable' },
    { status: 503, headers: { 'retry-after': '60', 'cache-control': 'no-store' } },
  );
}

/** Runs a quota check, mapping an unreachable Redis to a 503. */
export async function gated<T>(check: () => Promise<T>): Promise<T | Response> {
  try {
    return await check();
  } catch (err) {
    if (err instanceof LimiterUnavailable) return limiterBusy();
    throw err;
  }
}

const MESSAGES: Record<LimitReason, string> = {
  questions: "You've reached the hourly limit for this demo. It runs on my own API credits, so it allows a handful of questions per hour.",
  no_live_question: 'This needs a fresh question. Ask it again to get a new answer.',
};

export function limited(gate: Extract<Gate, { ok: false }>) {
  const retryAfter = Math.max(1, Math.ceil((gate.resetAt - Date.now()) / 1000));
  return Response.json(
    { error: MESSAGES[gate.reason], reason: gate.reason, resetAt: gate.resetAt, limit: gate.quota.limit, remaining: 0 },
    { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } },
  );
}
