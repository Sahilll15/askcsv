import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardSql } from '../lib/sqlGuard.ts';

const ok = (sql) => assert.equal(guardSql(sql).ok, true, sql);
const bad = (sql) => assert.equal(guardSql(sql).ok, false, sql);

test('allows plain SELECT and WITH queries', () => {
  ok('SELECT plan, SUM(mrr_usd) AS mrr FROM data GROUP BY 1');
  ok('with m as (select 1 as x) select * from m;');
  ok('(SELECT 1) UNION ALL (SELECT 2)');
  ok("SELECT REPLACE(company, 'Labs', '') FROM data");
  ok('SELECT * REPLACE (round(mrr_usd) AS mrr_usd) FROM data');
});

test('keywords inside strings, comments and quoted identifiers do not trip the guard', () => {
  ok("SELECT * FROM data WHERE status = 'delete me; drop table'");
  ok('SELECT 1 -- drop table data\n');
  ok('SELECT "update" FROM data');
  ok("SELECT 'it''s fine; really' AS note");
});

test('strips one trailing semicolon', () => {
  assert.deepEqual(guardSql('SELECT 1;  '), { ok: true, sql: 'SELECT 1' });
});

test('rejects writes and DDL', () => {
  bad('DELETE FROM data');
  bad('DROP TABLE data');
  bad('INSERT INTO data VALUES (1)');
  bad('UPDATE data SET plan = 1');
  bad('CREATE TABLE x AS SELECT 1');
  bad('CREATE OR REPLACE TABLE x AS SELECT 1');
  bad('WITH x AS (DELETE FROM data RETURNING *) SELECT * FROM x');
  bad('ALTER TABLE data ADD COLUMN y INT');
});

test('rejects stacked statements', () => {
  bad('SELECT 1; DROP TABLE data');
  bad('SELECT 1; SELECT 2');
});

test('rejects session and extension commands', () => {
  bad('PRAGMA table_info(data)');
  bad("ATTACH 'x.db'");
  bad('INSTALL httpfs');
  bad("SET threads = 1");
  bad("COPY data TO 'out.csv'");
});

test('rejects table functions that read outside the loaded table', () => {
  bad("SELECT * FROM read_csv('https://evil.example/x.csv')");
  bad("SELECT * FROM \"read_parquet\"('x.parquet')");
  bad("SELECT * FROM glob('*')");
  bad("SELECT * FROM 's3://bucket/file.parquet'");
});

test('rejects empty, unterminated and non-select input', () => {
  bad('');
  bad('   ');
  bad("SELECT 'oops");
  bad('EXPLAIN SELECT 1');
  bad('SHOW TABLES');
  bad('x'.repeat(9000));
});
