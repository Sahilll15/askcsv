export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

const MAX_SQL_CHARS = 8000;

const BLOCKED_KEYWORDS = [
  'insert', 'update', 'delete', 'merge', 'upsert', 'create', 'drop', 'alter', 'truncate', 'replace',
  'attach', 'detach', 'copy', 'export', 'import', 'install', 'load', 'pragma', 'set', 'reset',
  'call', 'checkpoint', 'vacuum', 'begin', 'commit', 'rollback', 'grant', 'revoke', 'use', 'prepare', 'execute',
];

// Table functions that reach outside the loaded table (files, URLs, extensions).
const BLOCKED_FUNCTIONS = [
  'read_csv', 'read_csv_auto', 'read_parquet', 'read_json', 'read_json_auto', 'read_ndjson', 'read_text',
  'read_blob', 'parquet_scan', 'csv_scan', 'glob', 'sniff_csv', 'duckdb_secrets', 'duckdb_settings',
  'duckdb_extensions', 'query_table', 'query', 'iceberg_scan', 'delta_scan', 'sqlite_scan', 'postgres_scan',
];

/** Blanks out comments and string literals so keyword checks only see real SQL. */
export function maskSql(sql: string): string {
  return scan(sql).masked;
}

function scan(sql: string) {
  let out = '';
  let unterminated = false;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (c === "'" || c === '"') {
      const quote = c;
      out += quote;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) { out += '  '; i += 2; continue; }
        if (sql[i] === quote) break;
        out += quote === '"' ? sql[i] : ' ';
        i++;
      }
      if (i < sql.length) { out += quote; i++; } else unterminated = true;
    } else {
      out += c;
      i++;
    }
  }
  return { masked: out, unterminated };
}

/** Accepts exactly one SELECT or WITH statement and returns it without a trailing semicolon. */
export function guardSql(input: string): GuardResult {
  const sql = (input ?? '').trim();
  if (!sql) return { ok: false, reason: 'The query is empty.' };
  if (sql.length > MAX_SQL_CHARS) return { ok: false, reason: `The query is longer than ${MAX_SQL_CHARS} characters.` };

  const { masked, unterminated } = scan(sql);
  if (unterminated) return { ok: false, reason: 'The query has an unterminated string or identifier.' };

  const body = masked.replace(/;\s*$/, '');
  if (body.includes(';')) return { ok: false, reason: 'Only one statement is allowed.' };

  const lower = body.toLowerCase();
  const first = lower.trim().match(/^\(*\s*([a-z]+)/)?.[1];
  if (first !== 'select' && first !== 'with') {
    return { ok: false, reason: 'Only read-only SELECT or WITH queries are allowed.' };
  }

  // Double-quoted identifiers are kept in the mask, so drop them before word checks.
  const words = lower.replace(/"[^"]*"/g, ' ');
  for (const kw of BLOCKED_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(words)) {
      // REPLACE(col, ...) and SELECT * REPLACE (...) are read-only expressions.
      if (kw === 'replace' && !/\breplace\b(?!\s*\()/.test(words)) continue;
      return { ok: false, reason: `"${kw.toUpperCase()}" is not allowed. Queries must be read-only.` };
    }
  }
  for (const fn of BLOCKED_FUNCTIONS) {
    if (new RegExp(`(\\b|")${fn}"?\\s*\\(`).test(lower)) {
      return { ok: false, reason: `${fn}() is not allowed. Query the loaded table only.` };
    }
  }
  if (/'(https?|s3|gs|az|file):\/\//i.test(sql)) return { ok: false, reason: 'External URLs are not allowed.' };

  return { ok: true, sql: sql.replace(/;\s*$/, '').trim() };
}
