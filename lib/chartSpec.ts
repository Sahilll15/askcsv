import { z } from 'zod';

export const CHART_TYPES = ['bar', 'line', 'scatter', 'table', 'number'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

// Structured Outputs needs every key present, so optional fields are nullable instead.
export const ChartSpecSchema = z.object({
  type: z.enum(CHART_TYPES),
  title: z.string().describe('Short chart title, sentence case'),
  x: z.string().nullable().describe('Result column for the x axis or category. Null for number and table.'),
  y: z.array(z.string()).describe('Numeric result columns to plot. One for number charts.'),
  series: z.string().nullable().describe('Optional result column that splits y into colored series (long format).'),
});
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

export type Column = { name: string; type: string };
export type ResultRow = Record<string, string | number | boolean | null>;
export type ValidatedChart = { spec: ChartSpec; warnings: string[] };

export const NUMERIC_TYPE = /^(tinyint|smallint|integer|int|bigint|hugeint|utinyint|usmallint|uinteger|ubigint|float|real|double|decimal|numeric)/i;

function isNumericColumn(col: Column | undefined, rows: ResultRow[]): boolean {
  if (!col) return false;
  if (NUMERIC_TYPE.test(col.type)) return true;
  const sample = rows.slice(0, 50).map((r) => r[col.name]).filter((v) => v !== null);
  return sample.length > 0 && sample.every((v) => typeof v === 'number');
}

const MAX_POINTS: Record<ChartType, number> = { bar: 60, line: 400, scatter: 2000, table: Infinity, number: 1 };

/**
 * Checks a model-proposed spec against the columns the query actually returned.
 * Repairs what it safely can and falls back to a table when the chart would be misleading.
 */
export function validateChart(input: unknown, columns: Column[], rows: ResultRow[]): ValidatedChart {
  const warnings: string[] = [];
  const parsed = ChartSpecSchema.safeParse(input);
  const fallback = (why: string): ValidatedChart => ({
    spec: { type: 'table', title: parsed.success ? parsed.data.title : 'Result', x: null, y: [], series: null },
    warnings: [...warnings, why],
  });
  if (!parsed.success) return fallback('Chart spec was malformed, showing a table.');
  if (columns.length === 0 || rows.length === 0) return fallback('No rows to chart.');

  const spec = { ...parsed.data, y: [...new Set(parsed.data.y)] };
  const byName = new Map(columns.map((c) => [c.name, c]));
  if (spec.type === 'table') return { spec: { ...spec, x: null, y: [], series: null }, warnings };

  const missing = spec.y.filter((y) => !byName.has(y));
  if (missing.length) warnings.push(`Dropped unknown column ${missing.join(', ')}.`);
  spec.y = spec.y.filter((y) => byName.has(y));
  const nonNumeric = spec.y.filter((y) => !isNumericColumn(byName.get(y), rows));
  if (nonNumeric.length) warnings.push(`Dropped non-numeric column ${nonNumeric.join(', ')}.`);
  spec.y = spec.y.filter((y) => !nonNumeric.includes(y));

  if (spec.type === 'number') {
    if (spec.y.length === 0) {
      const firstNumeric = columns.find((c) => isNumericColumn(c, rows));
      if (!firstNumeric) return fallback('No numeric value for a number card.');
      spec.y = [firstNumeric.name];
    }
    if (rows.length > 1) return fallback('A number card needs exactly one row.');
    return { spec: { ...spec, x: null, y: spec.y.slice(0, 1), series: null }, warnings };
  }

  if (spec.y.length === 0) return fallback('No numeric column to plot.');
  if (!spec.x || !byName.has(spec.x)) {
    const guess = columns.find((c) => !spec.y.includes(c.name) && c.name !== spec.series);
    if (!guess) return fallback('No column for the x axis.');
    warnings.push(`Used ${guess.name} for the x axis.`);
    spec.x = guess.name;
  }
  if (spec.series && (!byName.has(spec.series) || spec.series === spec.x)) {
    warnings.push('Ignored an invalid series column.');
    spec.series = null;
  }
  if (spec.series && spec.y.length > 1) spec.y = spec.y.slice(0, 1);
  if (spec.type === 'scatter' && !isNumericColumn(byName.get(spec.x), rows)) {
    warnings.push('Scatter needs a numeric x, switched to bar.');
    spec.type = 'bar';
  }

  const xCol = byName.get(spec.x)!;
  const timeLike = /DATE|TIME/i.test(xCol.type) || rows.slice(0, 20).every((r) => /^\d{4}(-\d{2})?/.test(String(r[spec.x!] ?? '')));
  if (spec.type === 'line' && !timeLike && !isNumericColumn(xCol, rows) && rows.length <= MAX_POINTS.bar) {
    warnings.push('Line needs an ordered x, switched to bar.');
    spec.type = 'bar';
  }

  const points = spec.series ? new Set(rows.map((r) => String(r[spec.x!]))).size : rows.length;
  if (points > MAX_POINTS[spec.type]) return fallback(`Too many points for a ${spec.type} chart (${points}).`);
  return { spec, warnings };
}

export type Pivoted = { keys: string[]; data: Record<string, string | number | null>[] };

/** Turns long rows (x, series, y) into one row per x with a column per series value. */
export function pivot(rows: ResultRow[], spec: ChartSpec): Pivoted {
  const x = spec.x!;
  if (!spec.series) {
    return {
      keys: spec.y,
      data: rows.map((r) => {
        const out: Record<string, string | number | null> = { [x]: r[x] === null ? 'null' : (r[x] as string | number) };
        for (const y of spec.y) out[y] = typeof r[y] === 'number' ? (r[y] as number) : r[y] === null ? null : Number(r[y]);
        return out;
      }),
    };
  }
  const y = spec.y[0];
  const keys: string[] = [];
  const byX = new Map<string, Record<string, string | number | null>>();
  for (const r of rows) {
    const xv = r[x] === null ? 'null' : String(r[x]);
    const sv = r[spec.series] === null ? 'null' : String(r[spec.series]);
    if (!keys.includes(sv)) keys.push(sv);
    const row = byX.get(xv) ?? { [x]: typeof r[x] === 'number' ? r[x] : xv };
    row[sv] = ((row[sv] as number) ?? 0) + (Number(r[y]) || 0);
    byX.set(xv, row);
  }
  return { keys, data: [...byX.values()] };
}
