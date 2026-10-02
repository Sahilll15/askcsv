import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGrounding, extractNumbers } from '../lib/grounding.ts';

const rows = [
  { month: '2025-06', new_sales: 38214.5, renewals: 32010, total: 85120.75, churn_rate: 0.125 },
  { month: '2025-12', new_sales: 41000, renewals: 30500, total: 99030, churn_rate: 0.08 },
];

test('extracts currency, thousands separators, suffixes and percents', () => {
  const got = extractNumbers('Total was $85k, up from 1,234.5 units, churn 12.5% and 3.2M views.');
  assert.deepEqual(got.map((m) => m.value), [85000, 1234.5, 12.5, 3200000]);
  assert.equal(got[2].percent, true);
});

test('ignores digits glued to words like Q4', () => {
  assert.deepEqual(extractNumbers('Q4 was strong').map((m) => m.value), []);
});

test('accepts numbers that appear in the result, allowing rounding to written precision', () => {
  const r = checkGrounding('June hit $85k total, with $38.2k new sales and 32,010 renewals.', rows);
  assert.equal(r.ok, true, r.unsupported.join());
});

test('accepts percents backed by fraction cells and years from date strings', () => {
  const r = checkGrounding('In 2025 churn peaked at 12.5% in June and fell to 8%.', rows);
  assert.equal(r.ok, true, r.unsupported.join());
});

test('accepts the row count and numbers from the question', () => {
  const r = checkGrounding('Here are the top 5 months; the result has 2 rows.', rows, ['show the top 5 months']);
  assert.equal(r.ok, true, r.unsupported.join());
});

test('flags invented numbers', () => {
  const r = checkGrounding('December peaked at $120k, a 40% jump.', rows);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unsupported, ['$120k', '40%']);
});

test('flags over-precise numbers that do not round from any cell', () => {
  assert.equal(checkGrounding('Total was 85,121.9.', rows).ok, false);
  assert.equal(checkGrounding('Total was 85,121.', rows).ok, true);
});
