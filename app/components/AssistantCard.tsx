'use client';

import { useState } from 'react';
import type { AssistantMessage } from '../../lib/store';
import { Chart, DataTable } from './Chart';
import { Alert, Check, Download, Logo, Play, Refresh } from './Icons';

type Props = {
  msg: AssistantMessage;
  busy: boolean;
  /** Hourly limit reached: every action that could reach the API is off. */
  locked: boolean;
  canRun: boolean;
  onRunSql: (sql: string) => Promise<string | null>;
  onExplain: () => void;
  onRetry: () => void;
};

const STATUS: Record<string, string> = {
  planning: 'Writing a query',
  running: 'Running it in your browser',
  answering: 'Reading the result',
};

function toCsv(msg: AssistantMessage) {
  const cols = msg.columns ?? [];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => esc(c.name)).join(','), ...(msg.rows ?? []).map((r) => cols.map((c) => esc(r[c.name])).join(','))].join('\n');
}

function download(msg: AssistantMessage) {
  const url = URL.createObjectURL(new Blob([toCsv(msg)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(msg.chart?.title || 'result').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Trace({ msg }: { msg: AssistantMessage }) {
  if (!msg.attempts.length) return null;
  const tries = msg.attempts.filter((a) => !a.manual).length;
  return (
    <details className="group mt-3 rounded-xl border border-line bg-sunk/70 text-[13px] open:bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">&#8250;</span>
        How I got this
        <span className="text-ink-faint">
          {tries} {tries === 1 ? 'attempt' : 'attempts'}
          {msg.usage ? ` · ${(msg.usage.inputTokens + msg.usage.outputTokens).toLocaleString()} tokens · ~$${msg.usage.costUsd.toFixed(4)}` : ''}
          {msg.ms ? ` · ${(msg.ms / 1000).toFixed(1)}s` : ''}
        </span>
      </summary>
      <ol className="space-y-3 px-3 pb-3">
        {msg.attempts.map((a, i) => (
          <li key={i} className="animate-rise">
            <div className="mb-1 flex items-center gap-2 text-[12px]">
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${a.error ? 'bg-bad-bg text-bad' : 'bg-good-bg text-good'}`}>
                {i + 1}
              </span>
              <span className="font-medium">{a.manual ? 'Edited by you' : i === 0 ? 'First try' : 'Repair'}</span>
              <span className={a.error ? 'text-bad' : 'text-good'}>
                {a.error ? 'failed' : `${(a.rowCount ?? 0).toLocaleString()} rows`}
              </span>
            </div>
            <pre className="sql scroll-thin max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-white p-2.5 text-ink">{a.sql}</pre>
            {a.error && <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-bad-bg px-2 py-1 font-mono text-[11.5px] text-bad">{a.error}</p>}
          </li>
        ))}
        {msg.model && <li className="text-[12px] text-ink-faint">Model: {msg.model}. The query ran locally in DuckDB-WASM.</li>}
      </ol>
    </details>
  );
}

function SqlEditor({ msg, busy, locked, canRun, onRunSql }: Pick<Props, 'msg' | 'busy' | 'locked' | 'canRun' | 'onRunSql'>) {
  const [draft, setDraft] = useState(msg.sql ?? '');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    if (locked) return;
    setRunning(true);
    setError(await onRunSql(draft));
    setRunning(false);
  };
  return (
    <div>
      <label htmlFor={`sql-${msg.id}`} className="sr-only">SQL query</label>
      <textarea
        id={`sql-${msg.id}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
        }}
        spellCheck={false}
        rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))}
        className="sql scroll-thin w-full resize-y rounded-lg border border-line bg-sunk p-3 text-ink outline-none focus:border-accent focus:bg-white"
      />
      {error && <p className="mt-2 rounded-md bg-bad-bg px-2.5 py-1.5 font-mono text-[12px] text-bad">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy || locked || running || !canRun || !draft.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-40"
        >
          <Play size={12} /> {running ? 'Running' : 'Run query'}
        </button>
        {draft !== msg.sql && (
          <button type="button" onClick={() => setDraft(msg.sql ?? '')} className="rounded-lg px-2.5 py-1.5 text-[13px] text-ink-soft hover:bg-hover">
            Reset
          </button>
        )}
        <span className="text-[12px] text-ink-faint">
          {locked ? 'Paused until the hourly limit resets.' : canRun ? 'Read-only: SELECT and WITH only. Cmd/Ctrl + Enter runs it.' : 'Load this dataset again to run queries.'}
        </span>
      </div>
    </div>
  );
}

export function AssistantCard({ msg, busy, locked, canRun, onRunSql, onExplain, onRetry }: Props) {
  const [tab, setTab] = useState<'chart' | 'table' | 'sql'>('chart');
  const pending = msg.status === 'planning' || msg.status === 'running' || msg.status === 'answering';
  const hasResult = !!(msg.chart && msg.columns && msg.rows);

  return (
    <div className="flex animate-rise gap-3">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-white">
        <Logo size={16} />
      </div>
      <div className="min-w-0 flex-1">
        {msg.intent && <p className="mb-2 text-[14px] text-ink">{msg.intent}</p>}

        {pending && !hasResult && (
          <div className="rounded-2xl border border-line bg-white p-4" aria-live="polite">
            <div className="flex items-center gap-2 text-[13px] text-ink-soft">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              {STATUS[msg.status]}
              {msg.attempts.length > 0 && <span className="text-ink-faint">(attempt {msg.attempts.length + 1} of 3)</span>}
            </div>
            <div className="mt-4 flex h-40 items-end gap-2">
              {[40, 65, 50, 80, 58, 90, 70].map((h, i) => (
                <div key={i} className="skeleton flex-1" style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
          </div>
        )}

        {hasResult && (
          <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_0_rgba(15,15,20,0.03)]" aria-label={msg.chart!.title}>
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-medium">{msg.chart!.title}</h3>
              <div className="flex items-center gap-1">
                <div role="tablist" aria-label="View" className="flex rounded-lg bg-sunk p-0.5 text-[12px]">
                  {(['chart', 'table', 'sql'] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={`rounded-md px-2.5 py-1 capitalize transition ${tab === t ? 'bg-white font-medium text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                    >
                      {t === 'sql' ? 'SQL' : t}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => download(msg)} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-hover hover:text-ink" aria-label="Download result as CSV" title="Download CSV">
                  <Download size={14} />
                </button>
              </div>
            </header>
            {tab === 'chart' && <Chart spec={msg.chart!} columns={msg.columns!} rows={msg.rows!} />}
            {tab === 'table' && <DataTable columns={msg.columns!} rows={msg.rows!} />}
            {tab === 'sql' && <SqlEditor key={msg.sql} msg={msg} busy={busy} locked={locked} canRun={canRun} onRunSql={onRunSql} />}
            <footer className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-faint">
              <span>
                {(msg.totalRows ?? msg.rows!.length).toLocaleString()} {msg.totalRows === 1 ? 'row' : 'rows'}
                {(msg.totalRows ?? 0) > msg.rows!.length ? `, showing ${msg.rows!.length}` : ''}
              </span>
              {msg.chartWarnings?.map((w) => <span key={w}>{w}</span>)}
            </footer>
          </section>
        )}

        {msg.status === 'answering' && hasResult && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <div className="skeleton h-3.5 w-11/12" />
            <div className="skeleton h-3.5 w-2/3" />
          </div>
        )}

        {msg.answer && (
          <div className="mt-3">
            <p className={`text-[14.5px] leading-relaxed ${msg.answerStale ? 'text-ink-faint' : 'text-ink'}`}>{msg.answer}</p>
            {msg.answerStale ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
                You edited the SQL, so this summary describes the earlier result.
                <button type="button" onClick={onExplain} disabled={busy || locked} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 font-medium text-ink hover:bg-hover disabled:opacity-40">
                  <Refresh size={12} /> Explain again
                </button>
              </div>
            ) : msg.grounding?.ok ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-good-bg px-2.5 py-1 text-[11.5px] text-good">
                <Check size={12} />
                {msg.grounding.checked === 0
                  ? 'No numbers to check'
                  : msg.grounding.checked === 1
                    ? 'The number above was found in the result'
                    : `All ${msg.grounding.checked} numbers above were found in the result`}
              </p>
            ) : msg.grounding ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1.5 text-[12.5px] text-warn">
                <Alert size={14} className="mt-0.5 shrink-0" />
                <span>
                  Not found in the result: <strong className="font-semibold">{msg.grounding.unsupported.join(', ')}</strong>. Check the table before quoting these.
                </span>
              </p>
            ) : null}
          </div>
        )}

        {!msg.answer && hasResult && msg.status === 'done' && (
          <button type="button" onClick={onExplain} disabled={busy || locked} className="mt-3 inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[12.5px] font-medium hover:bg-hover disabled:opacity-40">
            <Refresh size={12} /> Explain this result
          </button>
        )}

        {msg.note && msg.status === 'done' && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1.5 text-[12.5px] text-warn">
            <Alert size={14} className="mt-0.5 shrink-0" />
            {msg.note}
          </p>
        )}

        {msg.status === 'error' && (
          <div role="alert" className="mt-1 rounded-xl border border-bad/20 bg-bad-bg px-3.5 py-3 text-[13.5px] text-bad">
            <p>{msg.error}</p>
            <button type="button" onClick={onRetry} disabled={busy || locked || !canRun} className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink shadow-sm hover:bg-hover disabled:opacity-40">
              <Refresh size={12} /> Try again
            </button>
          </div>
        )}

        <Trace msg={msg} />
      </div>
    </div>
  );
}
