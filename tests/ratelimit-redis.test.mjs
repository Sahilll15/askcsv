import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuota, createRedisStore, gated, HITS_SCRIPT, LimiterUnavailable, TAKE_SCRIPT } from '../app/server/ratelimit.ts';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;

/** In-memory stand-in for the two Lua scripts; `clock.now` drives PEXPIRE. */
function fakeRedis() {
  const lists = new Map();
  const clock = { now: T0 };
  const get = (k) => {
    const e = lists.get(k);
    if (e && e.exp !== null && e.exp <= clock.now) lists.delete(k);
    return lists.get(k);
  };
  return {
    lists,
    clock,
    async eval(script, [k], args) {
      if (script === HITS_SCRIPT) return (get(k)?.items ?? []).map(String);
      if (script !== TAKE_SCRIPT) throw new Error('unknown script');
      const [limit, window, now] = args.map(Number);
      let e = get(k);
      if (e && now - e.items[0] >= window) {
        lists.delete(k);
        e = undefined;
      }
      let ok = 0;
      if ((e?.items.length ?? 0) < limit) {
        if (!e) lists.set(k, (e = { items: [], exp: clock.now + window }));
        e.items.push(now);
        ok = 1;
      }
      return [ok, (e?.items ?? []).map(String)];
    },
  };
}

const setup = (redis, cfg = {}) => createQuota(createRedisStore(redis), { questions: 2, followups: 3, windowMs: HOUR, liveMs: 10 * MIN, ...cfg });

test('redis: N questions allowed, N+1 refused with resetAt from the first hit, and not counted', async () => {
  const redis = fakeRedis();
  const q = setup(redis);
  assert.equal((await q.question('1.2.3.4', T0)).ok, true);
  assert.equal((await q.question('1.2.3.4', T0 + MIN)).ok, true);
  const no = await q.question('1.2.3.4', T0 + 2 * MIN);
  assert.equal(no.ok, false);
  assert.equal(no.resetAt, T0 + HOUR);
  await q.question('1.2.3.4', T0 + 3 * MIN);
  assert.equal(redis.lists.get('rl:askcsv:question:1.2.3.4').items.length, 2, 'refused hits are not recorded');
});

test('redis: peek reads without counting and agrees with what was counted', async () => {
  const redis = fakeRedis();
  const q = setup(redis);
  await q.question('ip', T0);
  for (let i = 0; i < 10; i++) assert.deepEqual(await q.peek('ip', T0 + i), { limit: 2, remaining: 1, resetAt: T0 + HOUR });
  assert.equal(redis.lists.get('rl:askcsv:question:ip').items.length, 1);
});

test('redis: the live-question check for follow-ups reads Redis', async () => {
  const redis = fakeRedis();
  const q = setup(redis);
  assert.equal((await q.followup('ip', T0)).reason, 'no_live_question');
  await q.question('ip', T0);
  assert.equal((await q.followup('ip', T0 + MIN)).ok, true);
  const other = setup(redis);
  assert.equal((await other.followup('ip', T0 + 2 * MIN)).ok, true, 'a second instance sees the same question');
  assert.equal((await other.followup('ip', T0 + 10 * MIN)).reason, 'no_live_question');
});

test('redis: the window resets after it expires', async () => {
  const redis = fakeRedis();
  const q = setup(redis, { questions: 1 });
  await q.question('ip', T0);
  assert.equal((await q.question('ip', T0 + 1)).ok, false);
  redis.clock.now = T0 + HOUR;
  assert.equal((await q.question('ip', T0 + HOUR)).ok, true);
  assert.deepEqual(await q.peek('ip', T0 + HOUR), { limit: 1, remaining: 0, resetAt: T0 + 2 * HOUR });
});

test('redis: a failing store fails closed with a 503', async () => {
  const q = setup({ eval: async () => Promise.reject(new Error('ECONNRESET')) });
  await assert.rejects(q.question('ip', T0), LimiterUnavailable);
  await assert.rejects(q.peek('ip', T0), LimiterUnavailable);
  const res = await gated(() => q.question('ip', T0));
  assert.ok(res instanceof Response);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'The service is busy, try again in a minute.');
});
