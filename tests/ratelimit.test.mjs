import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, createMemoryStore, createQuota, envInt, limited, normalizeIp } from '../app/server/ratelimit.ts';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;
const setup = (cfg = {}) => createQuota(createMemoryStore(), { questions: 3, followups: 4, windowMs: HOUR, liveMs: 10 * MIN, ...cfg });

test('one question consumes exactly one unit', async () => {
  const q = setup();
  assert.deepEqual(await q.peek('1.1.1.1', T0), { limit: 3, remaining: 3, resetAt: T0 + HOUR });
  const g = await q.question('1.1.1.1', T0);
  assert.equal(g.ok, true);
  assert.equal(g.quota.remaining, 2);
  assert.equal((await q.peek('1.1.1.1', T0 + 1)).remaining, 2);
});

test('repairs and answers do not consume questions', async () => {
  const q = setup();
  await q.question('ip', T0);
  for (let i = 1; i <= 3; i++) assert.equal((await q.followup('ip', T0 + i)).ok, true);
  const p = await q.peek('ip', T0 + 10);
  assert.equal(p.remaining, 2);
});

test('follow-ups are refused without a live question', async () => {
  const q = setup();
  const none = await q.followup('ip', T0);
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'no_live_question');

  await q.question('ip', T0);
  const stale = await q.followup('ip', T0 + 10 * MIN);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'no_live_question');
});

test('the final allowed question can still be repaired and answered', async () => {
  const q = setup({ questions: 1 });
  await q.question('ip', T0);
  assert.equal((await q.peek('ip', T0)).remaining, 0);
  assert.equal((await q.followup('ip', T0 + 1)).ok, true);
  assert.equal((await q.followup('ip', T0 + 2)).ok, true);
});

test('follow-ups are capped and spending them locks new questions', async () => {
  const q = setup({ followups: 2 });
  await q.question('ip', T0);
  assert.equal((await q.followup('ip', T0 + 1)).ok, true);
  assert.equal((await q.followup('ip', T0 + 2)).ok, true);
  const capped = await q.followup('ip', T0 + 3);
  assert.equal(capped.ok, false);
  assert.equal(capped.reason, 'questions');
  assert.equal(capped.resetAt, T0 + 1 + HOUR);
  assert.equal((await q.peek('ip', T0 + 4)).remaining, 0);
  assert.equal((await q.question('ip', T0 + 4)).ok, false);
});

test('an exhausted budget refuses plan with resetAt, then frees up after the window', async () => {
  const q = setup({ questions: 2 });
  await q.question('ip', T0);
  await q.question('ip', T0 + MIN);
  const no = await q.question('ip', T0 + 2 * MIN);
  assert.equal(no.ok, false);
  assert.equal(no.reason, 'questions');
  assert.equal(no.resetAt, T0 + HOUR);
  assert.equal(no.quota.remaining, 0);
  assert.equal((await q.question('ip', T0 + HOUR)).ok, true);
});

test('peek never consumes anything', async () => {
  const q = setup({ questions: 1 });
  for (let i = 0; i < 20; i++) await q.peek('ip', T0 + i);
  assert.equal((await q.question('ip', T0 + 30)).ok, true);
});

test('429 bodies carry resetAt, limit, remaining 0 and retry-after', async () => {
  const q = setup({ questions: 1 });
  const now = Date.now();
  await q.question('ip', now);
  const gate = await q.question('ip', now);
  const res = limited(gate);
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.remaining, 0);
  assert.equal(body.limit, 1);
  assert.equal(body.resetAt, now + HOUR);
  assert.match(body.error, /hourly limit/);
  assert.ok(Number(res.headers.get('retry-after')) > 3500);
});

test('the store evicts least recently used keys instead of clearing', async () => {
  const store = createMemoryStore(3);
  for (const k of ['a', 'b', 'c']) await store.take(k, 5, HOUR, T0);
  await store.take('a', 5, HOUR, T0 + 1);
  await store.take('d', 5, HOUR, T0 + 2);
  assert.equal(store.size(), 3);
  assert.equal(store.has('b'), false);
  assert.equal(store.has('a'), true);
  assert.deepEqual(await store.hits('a', HOUR, T0 + 3), [T0, T0 + 1]);
});

test('normalizes IPv4, ports, mapped and IPv6 addresses', () => {
  assert.equal(normalizeIp(' 010.1.2.3 '), '10.1.2.3');
  assert.equal(normalizeIp('1.2.3.4:5678'), '1.2.3.4');
  assert.equal(normalizeIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeIp('[2001:db8::1]:443'), '2001:db8:0:0::/64');
  assert.equal(normalizeIp('2001:DB8:0:0:ffff::1%eth0'), '2001:db8:0:0::/64');
  assert.equal(normalizeIp('2001:db8::1'), normalizeIp('2001:db8:0:0:abcd::9'));
  assert.equal(normalizeIp('999.1.1.1'), 'invalid');
  assert.equal(normalizeIp('nonsense'), 'invalid');
});

test('client ip prefers x-real-ip, then the last x-forwarded-for hop', () => {
  const req = (h) => new Request('http://x', { headers: h });
  assert.equal(clientIp(req({ 'x-real-ip': '5.6.7.8', 'x-forwarded-for': '1.1.1.1' })), '5.6.7.8');
  assert.equal(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 2.2.2.2' })), '2.2.2.2');
  assert.equal(clientIp(req({})), 'unknown');
});

test('malformed env values fall back to defaults', () => {
  assert.equal(envInt(undefined, 10, 1), 10);
  assert.equal(envInt('', 10, 1), 10);
  assert.equal(envInt('abc', 10, 1), 10);
  assert.equal(envInt('2.5', 10, 1), 10);
  assert.equal(envInt('0', 10, 1), 10);
  assert.equal(envInt('-3', 10), 10);
  assert.equal(envInt('2', 10, 1), 2);
});
