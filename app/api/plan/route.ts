import { zodTextFormat } from 'openai/helpers/zod';
import { PlanRequestSchema, PlanSchema, type PlanRequest, type PlanResponse } from '../../../lib/api';
import { guardSql } from '../../../lib/sqlGuard';
import { readJson } from '../../server/http';
import { openai, resolveModel, upstreamError, usageOf } from '../../server/openai';
import { check, tooMany } from '../../server/ratelimit';

const MAX_BYTES = 64 * 1024;

const INSTRUCTIONS = `You are a careful data analyst who writes DuckDB SQL.
You get the schema, per-column stats and a few sample rows of ONE table, plus a question.
Return a single read-only DuckDB query (SELECT or WITH only) that answers it, a one-line intent, and a chart spec.

SQL rules:
- Query only the given table and columns. Double-quote identifiers that are not plain snake_case.
- Aggregate so the result is small: at most 60 rows for bar charts, 400 for line, 200 otherwise. Add ORDER BY and LIMIT.
- Give every computed column a short snake_case alias. Round money and averages with ROUND(x, 2).
- Dates: use date_trunc('month', col) or strftime(col, '%Y-%m') for monthly buckets, and order chronologically.
- If a timestamp or date column is stored as text, CAST it first.
- Do not cast to DECIMAL. Do not use read_csv, files, URLs, PRAGMA, SET or any DDL.
- Percent or share columns should be 0-100 values named with a _pct suffix.

Chart rules:
- number: the result is one row with one headline value (y = that column).
- bar: categories or a few time buckets. line: a time series. scatter: two numeric columns, x numeric.
- table: lists of records, or when nothing else fits.
- x and y must be aliases that exist in your SELECT. For several groups over time, return long format (x, group, value) and put the group column in series.

If earlier attempts failed, read the error, fix the cause, and do not repeat the same mistake.
If the question builds on earlier turns, reuse their filters and definitions unless told otherwise.`;

function buildInput(body: PlanRequest) {
  const { profile, history, attempts, question } = body;
  const parts = [
    `Table: ${profile.table} (${profile.rowCount} rows)`,
    'Columns:',
    ...profile.columns.map((c) => `- ${c.name} ${c.type}: ${c.stats}`),
    `Sample rows (JSON): ${JSON.stringify(profile.sampleRows)}`,
  ];
  if (history.length) {
    parts.push('Earlier turns in this conversation:');
    history.forEach((h, i) => parts.push(`${i + 1}. Q: ${h.question}\n   Intent: ${h.intent}\n   SQL: ${h.sql}`));
  }
  if (attempts.length) {
    parts.push('Failed attempts for the current question:');
    attempts.forEach((a, i) => parts.push(`Attempt ${i + 1} SQL: ${a.sql}\nError: ${a.error}`));
  }
  parts.push(`Question: ${question}`);
  return parts.join('\n');
}

export async function POST(req: Request) {
  const body = await readJson(req, MAX_BYTES, PlanRequestSchema);
  if (body instanceof Response) return body;

  const gate = check(req, 'plan');
  if (!gate.ok) return tooMany(gate.retryAfter);

  const model = resolveModel(body.model);
  try {
    const response = await openai().responses.parse({
      model,
      instructions: INSTRUCTIONS,
      input: buildInput(body),
      reasoning: { effort: 'low' },
      max_output_tokens: 4000,
      text: { format: zodTextFormat(PlanSchema, 'query_plan') },
    });
    const plan = response.output_parsed;
    if (!plan) return Response.json({ error: 'The model did not return a query. Try rephrasing.' }, { status: 502 });

    // The client re-checks before executing; this keeps a bad plan from even looking runnable.
    const guard = guardSql(plan.sql);
    const result: PlanResponse & { guard: string | null } = {
      ...plan,
      sql: guard.ok ? guard.sql : plan.sql,
      guard: guard.ok ? null : guard.reason,
      model,
      usage: usageOf(model, response.usage),
    };
    return Response.json(result);
  } catch (err) {
    return upstreamError(err);
  }
}
