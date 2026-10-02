'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pivot, type ChartSpec, type Column, type ResultRow } from '../../lib/chartSpec';

export const PALETTE = ['#7c82f4', '#bdb8fb', '#f2b8e9', '#4fb3a4', '#f0ae62', '#8f9ab2', '#e3879a', '#5d9cec'];

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

export const fmtCompact = (v: number) => (Math.abs(v) < 1000 ? full.format(v) : compact.format(v));
export const fmtFull = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : full.format(v));

export function humanize(col: string) {
  const s = col.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function niceTicks(min: number, max: number, count = 5) {
  if (min === max) {
    max = min === 0 ? 1 : min + Math.abs(min) * 0.5;
    min = Math.min(0, min);
  }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type Tip = { left: number; top: number; title: string; items: { key: string; color: string; value: number | null }[]; total?: number };

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  const flip = tip.left > width - 190;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 animate-fade rounded-xl bg-ink px-3 py-2.5 text-[12px] text-white shadow-xl"
      style={{ left: flip ? undefined : tip.left + 14, right: flip ? width - tip.left + 14 : undefined, top: Math.max(0, tip.top - 20) }}
    >
      <div className="mb-1.5 font-medium">{tip.title}</div>
      <ul className="space-y-1">
        {tip.items.map((it) => (
          <li key={it.key} className="flex items-center gap-2">
            <span className="h-2.5 w-[3px] rounded-full" style={{ background: it.color }} />
            <span className="text-white/70">{it.key}:</span>
            <span className="ml-auto pl-3 font-medium tabular-nums">{fmtFull(it.value)}</span>
          </li>
        ))}
        {tip.total !== undefined && (
          <li className="flex items-center gap-2 border-t border-white/15 pt-1">
            <span className="text-white/70">Total:</span>
            <span className="ml-auto pl-3 font-medium tabular-nums">{fmtFull(tip.total)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function Legend({ keys }: { keys: string[] }) {
  if (keys.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-soft">
      {keys.slice(0, PALETTE.length).map((k, i) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: PALETTE[i % PALETTE.length] }} />
          {humanize(k)}
        </li>
      ))}
    </ul>
  );
}

const H = 260;
const M = { top: 10, right: 8, bottom: 30, left: 46 };

function YAxis({ ticks, y, w }: { ticks: number[]; y: (v: number) => number; w: number }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={w - M.right} y1={y(t)} y2={y(t)} stroke="#ececf1" strokeDasharray={t === 0 ? undefined : '3 4'} />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#8b8b96">
            {fmtCompact(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XLabels({ labels, x, w }: { labels: string[]; x: (i: number) => number; w: number }) {
  const room = Math.max(1, Math.floor((w - M.left - M.right) / 64));
  const every = Math.ceil(labels.length / room);
  return (
    <g>
      {labels.map((l, i) =>
        i % every === 0 ? (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#8b8b96">
            {l.length > 11 ? `${l.slice(0, 10)}...` : l}
          </text>
        ) : null,
      )}
    </g>
  );
}

function shortLabel(v: unknown) {
  const s = String(v ?? 'null');
  const m = /^(\d{4})-(\d{2})(-01)?( 00:00:00)?$/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return s;
}

function BarOrLine({ spec, rows, kind }: { spec: ChartSpec; rows: ResultRow[]; kind: 'bar' | 'line' }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradId = `area${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { keys, data } = useMemo(() => pivot(rows, spec), [rows, spec]);
  const stacked = kind === 'bar' && !!spec.series;
  const x0 = spec.x!;
  const labels = data.map((d) => shortLabel(d[x0]));

  const values = data.flatMap((d) =>
    stacked ? [keys.reduce((s, k) => s + Math.max(0, Number(d[k] ?? 0)), 0)] : keys.map((k) => Number(d[k] ?? 0)),
  );
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const innerW = w - M.left - M.right;
  const y = (v: number) => M.top + (H - M.top - M.bottom) * (1 - (v - lo) / (hi - lo || 1));
  const band = innerW / Math.max(1, data.length);
  const x = (i: number) => (kind === 'bar' ? M.left + band * (i + 0.5) : M.left + (data.length === 1 ? innerW / 2 : (innerW * i) / (data.length - 1)));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const i = kind === 'bar' ? Math.floor((px - M.left) / band) : Math.round(((px - M.left) / innerW) * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  };

  const tip: Tip | null =
    hover === null
      ? null
      : {
          left: x(hover),
          top: y(stacked ? values[hover] : Math.max(...keys.map((k) => Number(data[hover][k] ?? 0)))),
          title: String(data[hover][x0] ?? ''),
          items: keys.map((k, i) => ({ key: humanize(k), color: PALETTE[i % PALETTE.length], value: data[hover][k] as number | null })),
          total: stacked && keys.length > 1 ? values[hover] : undefined,
        };

  const barW = Math.min(44, band * 0.62);
  return (
    <div ref={ref} className="relative">
      <Legend keys={keys} />
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`${kind} chart of ${spec.y.map(humanize).join(', ')} by ${humanize(x0)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="mt-2 block touch-pan-y"
      >
        <YAxis ticks={ticks} y={y} w={w} />
        {kind === 'bar' && hover !== null && (
          <rect x={x(hover) - band / 2 + 2} y={M.top} width={band - 4} height={H - M.top - M.bottom} rx={8} fill="#f3f3f7" />
        )}
        {kind === 'bar' &&
          data.map((d, i) => {
            if (stacked) {
              let acc = 0;
              return keys.map((k, ki) => {
                const v = Math.max(0, Number(d[k] ?? 0));
                const top = y(acc + v);
                const h = y(acc) - top;
                acc += v;
                const last = ki === keys.length - 1;
                return (
                  <rect key={`${i}-${k}`} className="bar-grow" style={{ animationDelay: `${i * 18}ms` }} x={x(i) - barW / 2} y={top} width={barW} height={Math.max(0, h - (last ? 0 : 1.5))} rx={last ? 4 : 1.5} fill={PALETTE[ki % PALETTE.length]} />
                );
              });
            }
            const gw = barW / keys.length;
            return keys.map((k, ki) => {
              const v = Number(d[k] ?? 0);
              const top = y(Math.max(0, v));
              const h = Math.abs(y(v) - y(0));
              return (
                <rect key={`${i}-${k}`} className="bar-grow" style={{ animationDelay: `${i * 18}ms` }} x={x(i) - barW / 2 + gw * ki} y={top} width={Math.max(1, gw - (keys.length > 1 ? 2 : 0))} height={Math.max(0, h)} rx={4} fill={PALETTE[ki % PALETTE.length]} />
              );
            });
          })}
        {kind === 'line' && (
          <>
            {keys.length === 1 && (
              <>
                <defs>
                  <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor={PALETTE[0]} stopOpacity="0.22" />
                    <stop offset="1" stopColor={PALETTE[0]} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  className="animate-fade"
                  fill={`url(#${gradId})`}
                  d={`M${x(0)},${y(lo)} ${data.map((d, i) => `L${x(i)},${y(Number(d[keys[0]] ?? 0))}`).join(' ')} L${x(data.length - 1)},${y(lo)} Z`}
                />
              </>
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} stroke="#d9d9e0" />}
            {keys.map((k, ki) => {
              const pts = data.map((d, i) => (d[k] === null || d[k] === undefined ? null : `${x(i)},${y(Number(d[k]))}`)).filter(Boolean);
              return (
                <polyline key={k} pathLength={1} className="line-draw" points={pts.join(' ')} fill="none" stroke={PALETTE[ki % PALETTE.length]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              );
            })}
            {hover !== null &&
              keys.map((k, ki) =>
                data[hover][k] === null || data[hover][k] === undefined ? null : (
                  <circle key={k} cx={x(hover)} cy={y(Number(data[hover][k]))} r={4} fill="#fff" stroke={PALETTE[ki % PALETTE.length]} strokeWidth={2} />
                ),
              )}
          </>
        )}
        <XLabels labels={labels} x={x} w={w} />
      </svg>
      {tip && <Tooltip tip={tip} width={w} />}
    </div>
  );
}

function Scatter({ spec, rows }: { spec: ChartSpec; rows: ResultRow[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const xk = spec.x!;
  const yk = spec.y[0];
  const pts = rows
    .map((r, i) => ({ i, x: Number(r[xk]), y: Number(r[yk]), s: spec.series ? String(r[spec.series]) : '' }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const groups = [...new Set(pts.map((p) => p.s))];
  const xt = niceTicks(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)));
  const yt = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
  const sx = (v: number) => M.left + (w - M.left - M.right) * ((v - xt[0]) / (xt[xt.length - 1] - xt[0] || 1));
  const sy = (v: number) => M.top + (H - M.top - M.bottom) * (1 - (v - yt[0]) / (yt[yt.length - 1] - yt[0] || 1));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const py = e.clientY - rect.top;
    let best: number | null = null;
    let bd = 24 * 24;
    for (const p of pts) {
      const d = (sx(p.x) - px) ** 2 + (sy(p.y) - py) ** 2;
      if (d < bd) { bd = d; best = p.i; }
    }
    setHover(best);
  };
  const hp = pts.find((p) => p.i === hover);
  return (
    <div ref={ref} className="relative">
      <Legend keys={spec.series ? groups : []} />
      <svg width={w} height={H} role="img" aria-label={`scatter of ${humanize(yk)} against ${humanize(xk)}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="mt-2 block touch-pan-y">
        <YAxis ticks={yt} y={sy} w={w} />
        {xt.map((t) => (
          <text key={t} x={sx(t)} y={H - 10} textAnchor="middle" fontSize="11" fill="#8b8b96">{fmtCompact(t)}</text>
        ))}
        {pts.map((p) => (
          <circle key={p.i} className="animate-fade" cx={sx(p.x)} cy={sy(p.y)} r={p.i === hover ? 5.5 : 3.5} fill={PALETTE[groups.indexOf(p.s) % PALETTE.length]} fillOpacity={p.i === hover ? 1 : 0.62} stroke={p.i === hover ? '#0f0f14' : 'none'} />
        ))}
      </svg>
      {hp && (
        <Tooltip
          width={w}
          tip={{
            left: sx(hp.x),
            top: sy(hp.y),
            title: spec.series ? hp.s : `Point ${hp.i + 1}`,
            items: [
              { key: humanize(xk), color: '#ffffff55', value: hp.x },
              { key: humanize(yk), color: PALETTE[groups.indexOf(hp.s) % PALETTE.length], value: hp.y },
            ],
          }}
        />
      )}
      <p className="mt-1 text-right text-[11px] text-ink-faint">x: {humanize(xk)}</p>
    </div>
  );
}

function NumberCard({ spec, rows }: { spec: ChartSpec; rows: ResultRow[] }) {
  const v = rows[0]?.[spec.y[0]];
  return (
    <div className="py-4">
      <div className="text-[13px] text-ink-faint">{humanize(spec.y[0])}</div>
      <div className="mt-1 animate-rise font-display text-6xl leading-none tracking-tight tabular-nums">
        {typeof v === 'number' ? fmtFull(v) : String(v ?? 'n/a')}
      </div>
    </div>
  );
}

export function DataTable({ columns, rows, max = 200 }: { columns: Column[]; rows: ResultRow[]; max?: number }) {
  return (
    <div className="scroll-thin max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-[12.5px]">
        <thead className="sticky top-0 bg-sunk">
          <tr>
            {columns.map((c) => (
              <th key={c.name} scope="col" className="whitespace-nowrap border-b border-line px-3 py-2 font-medium text-ink-soft">
                {c.name}
                <span className="ml-1.5 font-mono text-[10px] text-ink-faint">{c.type.toLowerCase()}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-sunk/60 hover:bg-accent-soft/60">
              {columns.map((c) => {
                const v = r[c.name];
                return (
                  <td key={c.name} className={`whitespace-nowrap border-b border-line/70 px-3 py-1.5 ${typeof v === 'number' ? 'text-right tabular-nums' : ''}`}>
                    {v === null ? <span className="text-ink-faint">null</span> : typeof v === 'number' ? fmtFull(v) : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Chart({ spec, columns, rows }: { spec: ChartSpec; columns: Column[]; rows: ResultRow[] }) {
  if (spec.type === 'number') return <NumberCard spec={spec} rows={rows} />;
  if (spec.type === 'table') return <DataTable columns={columns} rows={rows} />;
  if (spec.type === 'scatter') return <Scatter spec={spec} rows={rows} />;
  return <BarOrLine spec={spec} rows={rows} kind={spec.type} />;
}
