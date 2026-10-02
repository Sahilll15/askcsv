import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChart, pivot } from '../lib/chartSpec.ts';

const cols = [
  { name: 'month', type: 'VARCHAR' },
  { name: 'plan', type: 'VARCHAR' },
  { name: 'mrr', type: 'DOUBLE' },
  { name: 'subs', type: 'BIGINT' },
];
const rows = [
  { month: '2025-01', plan: 'Starter', mrr: 100, subs: 4 },
  { month: '2025-01', plan: 'Growth', mrr: 300, subs: 3 },
  { month: '2025-02', plan: 'Starter', mrr: 120, subs: 5 },
];
const spec = (s) => ({ type: 'bar', title: 'MRR', x: 'month', y: ['mrr'], series: null, ...s });

test('keeps a valid spec unchanged', () => {
  const r = validateChart(spec({ series: 'plan' }), cols, rows);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.spec.series, 'plan');
});

test('malformed specs fall back to a table', () => {
  assert.equal(validateChart({ type: 'pie' }, cols, rows).spec.type, 'table');
  assert.equal(validateChart(null, cols, rows).spec.type, 'table');
});

test('drops unknown and non-numeric y columns', () => {
  const r = validateChart(spec({ y: ['mrr', 'nope', 'plan'] }), cols, rows);
  assert.deepEqual(r.spec.y, ['mrr']);
  assert.equal(r.warnings.length, 2);
});

test('falls back when nothing numeric is left', () => {
  assert.equal(validateChart(spec({ y: ['plan'] }), cols, rows).spec.type, 'table');
});

test('guesses an x axis when the model names a missing one', () => {
  const r = validateChart(spec({ x: 'date' }), cols, rows);
  assert.equal(r.spec.x, 'month');
});

test('number cards need exactly one row', () => {
  assert.equal(validateChart(spec({ type: 'number', x: null }), cols, rows).spec.type, 'table');
  assert.equal(validateChart(spec({ type: 'number', x: null, y: [] }), cols, rows.slice(0, 1)).spec.y[0], 'mrr');
});

test('scatter with a text x becomes a bar chart', () => {
  assert.equal(validateChart(spec({ type: 'scatter' }), cols, rows).spec.type, 'bar');
});

test('too many bars falls back to a table', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ month: `m${i}`, plan: 'x', mrr: i, subs: i }));
  assert.equal(validateChart(spec({}), cols, many).spec.type, 'table');
});

test('pivot turns long rows into one row per x with a key per series', () => {
  const p = pivot(rows, spec({ series: 'plan' }));
  assert.deepEqual(p.keys, ['Starter', 'Growth']);
  assert.deepEqual(p.data, [
    { month: '2025-01', Starter: 100, Growth: 300 },
    { month: '2025-02', Starter: 120 },
  ]);
});

test('line over plain categories becomes a bar chart, line over months stays a line', () => {
  const cats = [{ name: 'payment', type: 'VARCHAR' }, { name: 'n', type: 'BIGINT' }];
  const r = validateChart({ type: 'line', title: 't', x: 'payment', y: ['n'], series: null }, cats, [{ payment: 'card', n: 3 }, { payment: 'cash', n: 1 }]);
  assert.equal(r.spec.type, 'bar');
  assert.equal(validateChart(spec({ type: 'line' }), cols, rows).spec.type, 'line');
});
