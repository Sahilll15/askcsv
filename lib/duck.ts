'use client';

import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { Profile } from './api';
import type { Column, ResultRow } from './chartSpec';
import { guardSql } from './sqlGuard';

export const MAX_RESULT_ROWS = 5000;

let boot: Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> | null = null;

async function start() {
  const duckdb = await import('@duckdb/duckdb-wasm');
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  // Cross-origin workers are blocked, so wrap the CDN script in a same-origin blob.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
  );
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  await db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } });
  const conn = await db.connect();
  return { db, conn };
}

export function getDuck() {
  boot ??= start().catch((err) => {
    boot = null;
    throw err;
  });
  return boot;
}

export function tableNameFor(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const name = /^[a-z_]/.test(base) ? base : `t_${base}`;
  return (name || 'data').slice(0, 60);
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Loads CSV bytes into a fresh table. Previous tables are dropped so only one dataset is queryable. */
export async function loadCsv(bytes: Uint8Array, fileName: string, table: string) {
  const { db, conn } = await getDuck();
  const existing = await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'`);
  for (const r of existing.toArray()) await conn.query(`DROP TABLE IF EXISTS ${ident(String(r.toJSON().table_name))}`);
  const file = `upload_${Date.now()}_${tableNameFor(fileName)}.csv`;
  await db.registerFileBuffer(file, bytes);
  await conn.query(`CREATE TABLE ${ident(table)} AS SELECT * FROM read_csv_auto('${file}', sample_size = 20000)`);
  await db.dropFile(file);
  return profile(table);
}

const fmt = (v: unknown) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v).slice(0, 40);
};

async function profile(table: string): Promise<Profile> {
  const { conn } = await getDuck();
  const t = ident(table);
  const count = Number((await conn.query(`SELECT count(*) AS n FROM ${t}`)).toArray()[0].toJSON().n);
  const summary = (await conn.query(`SUMMARIZE ${t}`)).toArray().map((r) => r.toJSON());
  const columns: Profile['columns'] = [];
  for (const s of summary.slice(0, 80)) {
    const name = String(s.column_name);
    const type = String(s.column_type);
    const distinct = Number(s.approx_unique);
    const nullPct = Number(String(s.null_percentage).replace('%', '')) || 0;
    const bits: string[] = [];
    if (type === 'VARCHAR' && distinct <= 40) {
      const top = (await conn.query(`SELECT ${ident(name)} AS v, count(*) AS n FROM ${t} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`))
        .toArray()
        .map((r) => r.toJSON());
      bits.push(`values: ${top.map((r) => `${fmt(r.v)} (${r.n})`).join(', ')}`);
    } else {
      bits.push(`min ${fmt(s.min)}, max ${fmt(s.max)}`);
      if (s.avg !== null && s.avg !== undefined && !/DATE|TIME|VARCHAR/.test(type)) bits.push(`avg ${fmt(Number(s.avg))}`);
      bits.push(`~${distinct} distinct`);
    }
    if (nullPct > 0) bits.push(`${nullPct.toFixed(1)}% null`);
    columns.push({ name, type, stats: bits.join('; ').slice(0, 500) });
  }
  const sample = await runRaw(`SELECT * FROM ${t} USING SAMPLE 5 ROWS (reservoir, 42)`, 5);
  const sampleRows = sample.rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 120) : v])),
  );
  return { table, rowCount: count, columns, sampleRows };
}

function simpleType(arrowType: string) {
  if (/^(Float|Decimal)/.test(arrowType)) return 'DOUBLE';
  if (/^(Int|Uint)/.test(arrowType)) return 'BIGINT';
  if (/^(Utf8|LargeUtf8)/.test(arrowType)) return 'VARCHAR';
  if (/^Bool/.test(arrowType)) return 'BOOLEAN';
  if (/^Date/.test(arrowType)) return 'DATE';
  if (/^Timestamp/.test(arrowType)) return 'TIMESTAMP';
  return arrowType.toUpperCase();
}

const pad = (n: number) => String(n).padStart(2, '0');

function toCell(value: unknown, type: string): ResultRow[string] {
  if (value === null || value === undefined) return null;
  if (type === 'DATE' || type === 'TIMESTAMP') {
    const d = new Date(typeof value === 'bigint' ? Number(value) : (value as number));
    if (Number.isNaN(d.getTime())) return String(value);
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
    return type === 'DATE' || !hasTime ? day : `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  return JSON.stringify(value).slice(0, 300);
}

async function runRaw(sql: string, cap: number) {
  const { conn } = await getDuck();
  const reader = await conn.send(sql);
  let columns: Column[] = [];
  const rows: ResultRow[] = [];
  let total = 0;
  for await (const batch of reader) {
    if (!columns.length) columns = batch.schema.fields.map((f) => ({ name: f.name, type: simpleType(String(f.type)) }));
    total += batch.numRows;
    for (let i = 0; i < batch.numRows && rows.length < cap; i++) {
      const raw = batch.get(i)?.toJSON() ?? {};
      rows.push(Object.fromEntries(columns.map((c) => [c.name, toCell(raw[c.name], c.type)])));
    }
    if (total > cap * 4) break;
  }
  return { columns, rows, total: Math.max(total, rows.length), truncated: total > rows.length };
}

export type QueryResult = Awaited<ReturnType<typeof runRaw>>;

/** The only entry point for model or user SQL: guard first, then execute. */
export async function runQuery(sql: string): Promise<QueryResult> {
  const guard = guardSql(sql);
  if (!guard.ok) throw new Error(`Blocked by the read-only guard: ${guard.reason}`);
  return runRaw(guard.sql, MAX_RESULT_ROWS);
}
