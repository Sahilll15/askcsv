export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export type NumberMention = { text: string; value: number; tolerance: number; percent: boolean };
export type GroundingReport = { ok: boolean; checked: number; unsupported: string[] };

const SCALES: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
};

const NUMBER_RE = /(^|[^\p{L}\p{N}_.])([-+\u2212]?)(\$|€|£)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?(%|percent\b|k\b|thousand\b|mn\b|m\b|million\b|bn\b|b\b|billion\b))?/giu;

/** Pulls every number a reader would take as a claim, with the precision it was written at. */
export function extractNumbers(text: string): NumberMention[] {
  const out: NumberMention[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const [, , sign, , intPart, frac = '', suffixRaw] = m;
    const after = text[(m.index ?? 0) + m[0].length];
    if (after && /[\p{L}_]/u.test(after) && !suffixRaw) continue;
    const suffix = (suffixRaw ?? '').toLowerCase();
    const decimals = frac ? frac.length - 1 : 0;
    const raw = Number(intPart.replace(/,/g, '') + frac);
    const scale = SCALES[suffix] ?? 1;
    const value = (sign === '-' || sign === '\u2212' ? -1 : 1) * raw * scale;
    out.push({
      text: m[0].slice(m[1].length).trim(),
      value,
      tolerance: 0.5 * 10 ** -decimals * scale + 1e-9,
      percent: suffix === '%' || suffix === 'percent',
    });
  }
  return out;
}

function numbersInString(s: string): number[] {
  return [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** Every number the answer is allowed to cite: result cells, digits inside text cells, the row count, the question. */
export function allowedValues(rows: Row[], extra: string[] = []): number[] {
  const values = new Set<number>([rows.length]);
  for (const row of rows) {
    for (const cell of Object.values(row)) {
      if (typeof cell === 'number' && Number.isFinite(cell)) values.add(cell);
      else if (typeof cell === 'string') {
        const n = Number(cell);
        if (cell.trim() !== '' && Number.isFinite(n)) values.add(n);
        else numbersInString(cell).forEach((v) => values.add(v));
      }
    }
  }
  for (const s of extra) numbersInString(s.replace(/,/g, '')).forEach((v) => values.add(v));
  return [...values];
}

function matches(mention: NumberMention, value: number): boolean {
  const near = (target: number, tol: number) => Math.abs(Math.abs(target) - Math.abs(mention.value)) <= tol;
  if (near(value, mention.tolerance)) return true;
  // "12.5%" may come from a cell holding 0.125.
  if (mention.percent && near(value * 100, mention.tolerance)) return true;
  return false;
}

/** Flags numbers in the answer that cannot be traced to the result (rounding to the written precision is allowed). */
export function checkGrounding(answer: string, rows: Row[], extra: string[] = []): GroundingReport {
  const mentions = extractNumbers(answer);
  const allowed = allowedValues(rows, extra);
  const unsupported = mentions.filter((m) => !allowed.some((v) => matches(m, v))).map((m) => m.text);
  return { ok: unsupported.length === 0, checked: mentions.length, unsupported: [...new Set(unsupported)] };
}
