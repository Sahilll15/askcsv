'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_MODEL,
  MAX_ANSWER_ROWS,
  MAX_ATTEMPTS,
  MODELS,
  type AnswerResponse,
  type PlanResponse,
  type Profile,
  type Usage,
} from '../lib/api';
import { validateChart } from '../lib/chartSpec';
import { getDuck, loadCsv, runQuery, tableNameFor } from '../lib/duck';
import { checkGrounding } from '../lib/grounding';
import { SAMPLES } from '../lib/samples';
import {
  loadConversations,
  saveConversations,
  uid,
  type AssistantMessage,
  type Attempt,
  type Conversation,
  type DatasetRef,
} from '../lib/store';
import { AssistantCard } from './components/AssistantCard';
import { Composer } from './components/Composer';
import { Close, Dots, Lock, Menu, Trash, Upload } from './components/Icons';
import { ModelPicker } from './components/ModelPicker';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const KEPT_ROWS = 2000;
const MODEL_KEY = 'askcsv:model';
// Wrapped so the React compiler lint does not mistake handler timing for render-time impurity.
const clock = () => Date.now();
const ZERO: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

type Loaded = { ref: DatasetRef; profile: Profile };

const sameDataset = (a: DatasetRef, b: DatasetRef) =>
  a.kind === b.kind && a.table === b.table && (a.kind === 'sample' ? a.id === (b as typeof a).id : a.name === b.name);

const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  costUsd: a.costUsd + b.costUsd,
});

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, '').slice(0, 700);

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

function readModel() {
  try {
    const m = localStorage.getItem(MODEL_KEY);
    return MODELS.some((x) => x.id === m) ? m! : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function genericSuggestions(profile: Profile) {
  const cat = profile.columns.find((c) => c.type === 'VARCHAR' && c.stats.startsWith('values:'));
  const num = profile.columns.find((c) => /INT|DOUBLE|FLOAT|DECIMAL/.test(c.type) && !/id$/i.test(c.name));
  const date = profile.columns.find((c) => /DATE|TIMESTAMP/.test(c.type));
  const out = ['How many rows are there?'];
  if (cat) out.push(`Break down rows by ${cat.name}`);
  if (cat && num) out.push(`Average ${num.name} by ${cat.name}`);
  if (date) out.push(`How does the count change per month by ${date.name}?`);
  return out;
}

export default function AskApp() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [model, setModelState] = useState(readModel);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [menu, setMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const dataset = active?.dataset ?? loaded?.ref ?? null;
  const ready = !!(loaded && dataset && sameDataset(loaded.ref, dataset));
  const msgCount = active?.messages.length ?? 0;

  useEffect(() => saveConversations(conversations), [conversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgCount, activeId]);

  const setModel = (m: string) => {
    setModelState(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {}
  };

  async function loadBytes(bytes: Uint8Array, fileName: string, ref: DatasetRef) {
    setLoadError(null);
    try {
      setLoading('Starting DuckDB in your browser');
      await getDuck();
      setLoading(`Loading ${ref.name}`);
      const profile = await loadCsv(bytes, fileName, ref.table);
      if (profile.rowCount === 0) throw new Error('That file has no data rows.');
      setLoaded({ ref, profile });
      return true;
    } catch (e) {
      setLoadError(`Could not load ${ref.name}: ${message(e)}`);
      return false;
    } finally {
      setLoading(null);
    }
  }

  async function loadSample(id: string) {
    const s = SAMPLES.find((x) => x.id === id);
    if (!s) return false;
    const ref: DatasetRef = { kind: 'sample', id: s.id, name: s.name, table: s.table };
    if (loaded && sameDataset(loaded.ref, ref)) return true;
    try {
      setLoading(`Fetching ${s.name}`);
      const res = await fetch(s.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return loadBytes(new Uint8Array(await res.arrayBuffer()), s.file.split('/').pop()!, ref);
    } catch (e) {
      setLoading(null);
      setLoadError(`Could not fetch the sample: ${message(e)}`);
      return false;
    }
  }

  async function pickSample(id: string) {
    if (busy) return;
    if (!(active && active.dataset.kind === 'sample' && active.dataset.id === id)) setActiveId(null);
    setSidebarOpen(false);
    await loadSample(id);
  }

  async function pickFile(f: File) {
    if (busy) return;
    setLoadError(null);
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) return setLoadError('Please choose a .csv or .tsv file.');
    if (f.size > MAX_UPLOAD_BYTES) return setLoadError('That file is over 25 MB. Try a smaller extract.');
    if (f.size === 0) return setLoadError('That file is empty.');
    const ref: DatasetRef = { kind: 'upload', name: f.name, table: tableNameFor(f.name) };
    if (!(active && sameDataset(active.dataset, ref))) setActiveId(null);
    await loadBytes(new Uint8Array(await f.arrayBuffer()), f.name, ref);
  }

  async function selectConversation(id: string) {
    setSidebarOpen(false);
    setActiveId(id);
    const c = conversations.find((x) => x.id === id);
    if (c?.dataset.kind === 'sample') await loadSample(c.dataset.id);
  }

  const patch = (convId: string, msgId: string, p: Partial<AssistantMessage> | ((m: AssistantMessage) => Partial<AssistantMessage>)) =>
    setConversations((list) =>
      list.map((c) =>
        c.id !== convId
          ? c
          : {
              ...c,
              updatedAt: clock(),
              messages: c.messages.map((m) => (m.id === msgId && m.role === 'assistant' ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m)),
            },
      ),
    );

  async function explain(m: Pick<AssistantMessage, 'question' | 'intent' | 'sql' | 'columns' | 'rows' | 'totalRows'>) {
    const rows = (m.rows ?? []).slice(0, MAX_ANSWER_ROWS);
    const res = await postJson<AnswerResponse>('/api/answer', {
      question: m.question,
      model,
      intent: m.intent ?? '',
      sql: m.sql ?? '',
      columns: m.columns ?? [],
      rows,
      totalRows: m.totalRows ?? rows.length,
    });
    // Re-check on the client too: the server is not the only thing we trust less than the data.
    const grounding = checkGrounding(res.answer, rows, [m.question]);
    return { answer: res.answer, grounding, usage: res.usage };
  }

  async function solve(convId: string, msgId: string, question: string, history: { question: string; intent: string; sql: string }[]) {
    if (!loaded) return;
    setBusy(true);
    const t0 = clock();
    const attempts: Attempt[] = [];
    let usage = ZERO;
    patch(convId, msgId, { status: 'planning', attempts: [], error: undefined, answer: undefined, grounding: undefined, chart: undefined, rows: undefined, columns: undefined, intent: undefined });
    try {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        patch(convId, msgId, { status: 'planning', attempts: [...attempts] });
        const plan = await postJson<PlanResponse & { guard: string | null }>('/api/plan', {
          question,
          model,
          profile: loaded.profile,
          history,
          attempts: attempts.map((a) => ({ sql: a.sql, error: a.error ?? '' })),
        });
        usage = addUsage(usage, plan.usage);
        patch(convId, msgId, { status: 'running', intent: plan.intent, usage, model: plan.model });

        let result;
        try {
          result = await runQuery(plan.sql);
        } catch (e) {
          attempts.push({ sql: plan.sql, error: message(e) });
          continue;
        }
        if (result.rows.length === 0) {
          attempts.push({ sql: plan.sql, error: 'The query ran but returned no rows. Check filters and value spelling against the column stats.', rowCount: 0 });
          continue;
        }
        attempts.push({ sql: plan.sql, error: null, rowCount: result.total });
        const rows = result.rows.slice(0, KEPT_ROWS);
        const { spec, warnings } = validateChart(plan.chart, result.columns, rows);
        const shown = { question, intent: plan.intent, sql: plan.sql, columns: result.columns, rows, totalRows: result.total };
        patch(convId, msgId, { ...shown, status: 'answering', attempts: [...attempts], chart: spec, planChart: plan.chart, chartWarnings: warnings });

        try {
          const a = await explain(shown);
          usage = addUsage(usage, a.usage);
          patch(convId, msgId, { status: 'done', answer: a.answer, grounding: a.grounding, usage, ms: clock() - t0 });
        } catch (e) {
          patch(convId, msgId, { status: 'done', usage, ms: clock() - t0, note: `The chart is ready but the summary failed: ${message(e)}` });
        }
        return;
      }
      patch(convId, msgId, {
        status: 'error',
        attempts: [...attempts],
        usage,
        ms: clock() - t0,
        error: `I could not get a working query in ${MAX_ATTEMPTS} tries. Open "How I got this" to see each attempt, or rephrase the question.`,
      });
    } catch (e) {
      patch(convId, msgId, { status: 'error', attempts: [...attempts], usage, error: message(e) });
    } finally {
      setBusy(false);
    }
  }

  function ask(question: string) {
    if (!loaded || busy || !ready) return;
    let convId = active?.id;
    const history = (active?.messages ?? [])
      .filter((m): m is AssistantMessage => m.role === 'assistant' && m.status === 'done' && !!m.sql)
      .slice(-4)
      .map((m) => ({ question: m.question.slice(0, 500), intent: (m.intent ?? '').slice(0, 300), sql: m.sql!.slice(0, 8000) }));
    const userMsg = { id: uid(), role: 'user' as const, text: question };
    const botMsg: AssistantMessage = { id: uid(), role: 'assistant', question, status: 'planning', attempts: [] };
    if (!convId) {
      convId = uid();
      const now = clock();
      const conv: Conversation = { id: convId, title: question.slice(0, 64), dataset: loaded.ref, createdAt: now, updatedAt: now, messages: [userMsg, botMsg] };
      setConversations((list) => [conv, ...list]);
      setActiveId(convId);
    } else {
      const id = convId;
      setConversations((list) => list.map((c) => (c.id === id ? { ...c, updatedAt: clock(), messages: [...c.messages, userMsg, botMsg] } : c)));
    }
    solve(convId, botMsg.id, question, history);
  }

  async function runSql(msg: AssistantMessage, sql: string): Promise<string | null> {
    if (!active) return 'No conversation.';
    try {
      const r = await runQuery(sql);
      const rows = r.rows.slice(0, KEPT_ROWS);
      const { spec, warnings } = validateChart(msg.planChart ?? msg.chart, r.columns, rows);
      patch(active.id, msg.id, (m) => ({
        sql: sql.trim().replace(/;\s*$/, ''),
        columns: r.columns,
        rows,
        totalRows: r.total,
        chart: spec,
        chartWarnings: warnings,
        attempts: [...m.attempts, { sql, error: null, rowCount: r.total, manual: true }],
        answerStale: !!m.answer,
        note: undefined,
      }));
      return null;
    } catch (e) {
      return message(e);
    }
  }

  async function reExplain(msg: AssistantMessage) {
    if (!active || busy) return;
    const convId = active.id;
    setBusy(true);
    patch(convId, msg.id, { status: 'answering' });
    try {
      const a = await explain(msg);
      patch(convId, msg.id, (m) => ({ status: 'done', answer: a.answer, grounding: a.grounding, answerStale: false, note: undefined, usage: addUsage(m.usage ?? ZERO, a.usage) }));
    } catch (e) {
      patch(convId, msg.id, { status: 'done', note: `The summary failed: ${message(e)}` });
    } finally {
      setBusy(false);
    }
  }

  function retry(msg: AssistantMessage) {
    if (!active || busy || !ready) return;
    const idx = active.messages.findIndex((m) => m.id === msg.id);
    const history = active.messages
      .slice(0, idx)
      .filter((m): m is AssistantMessage => m.role === 'assistant' && m.status === 'done' && !!m.sql)
      .slice(-4)
      .map((m) => ({ question: m.question, intent: m.intent ?? '', sql: m.sql! }));
    solve(active.id, msg.id, msg.question, history);
  }

  function deleteConversation(id: string) {
    setConversations((list) => list.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
    setMenu(false);
  }

  function newChat() {
    setActiveId(null);
    setLoaded(null);
    setSidebarOpen(false);
  }

  const sample = loaded?.ref.kind === 'sample' ? SAMPLES.find((s) => loaded.ref.kind === 'sample' && s.id === loaded.ref.id) : null;
  const suggestions = ready && loaded && msgCount === 0 ? (sample ? sample.questions : genericSuggestions(loaded.profile)) : [];
  const datasetLabel = dataset ? `${dataset.table}${ready && loaded ? ` · ${loaded.profile.rowCount.toLocaleString()} rows` : ''}` : null;
  const placeholder = !dataset ? 'Pick a sample or drop a CSV to start' : !ready ? (loading ? 'Loading data...' : 'Load the dataset to ask more') : `Ask about ${dataset.table}...`;

  return (
    <div className="flex h-dvh md:gap-1 md:p-2">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={deleteConversation}
        onAbout={() => setAbout(true)}
      />

      <main
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-panel md:rounded-2xl md:border md:border-line"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) pickFile(f);
        }}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
          <button type="button" onClick={() => setSidebarOpen(true)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-hover md:hidden" aria-label="Open conversations">
            <Menu size={17} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[14px] font-medium">{active?.title ?? 'New analysis'}</h1>
          <ModelPicker value={model} onChange={setModel} />
          {active && (
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Conversation options" className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-hover">
                <Dots size={16} />
              </button>
              {menu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 animate-rise rounded-xl border border-line bg-white p-1 shadow-xl">
                  <button type="button" onClick={() => deleteConversation(active.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-bad hover:bg-bad-bg">
                    <Trash size={14} /> Delete conversation
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-4 pb-8 pt-6 sm:px-6 sm:pt-10">
            {loadError && (
              <div role="alert" className="mb-5 flex animate-rise items-start gap-2 rounded-xl bg-bad-bg px-3.5 py-2.5 text-[13.5px] text-bad">
                <span className="flex-1">{loadError}</span>
                <button type="button" onClick={() => setLoadError(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/60">
                  <Close size={14} />
                </button>
              </div>
            )}

            {!active && !loaded && <Welcome loading={loading} onSample={pickSample} onFile={pickFile} />}

            {!active && loaded && (
              <div className="animate-rise">
                <p className="text-[13px] text-ink-faint">Loaded in your browser</p>
                <h2 className="mt-1 font-display text-4xl tracking-tight">{loaded.ref.name}</h2>
                <p className="mt-2 text-[13.5px] text-ink-soft">
                  {loaded.profile.rowCount.toLocaleString()} rows, {loaded.profile.columns.length} columns, table <code className="rounded bg-sunk px-1 font-mono text-[12.5px]">{loaded.ref.table}</code>
                </p>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {loaded.profile.columns.map((c) => (
                    <li key={c.name} title={c.stats} className="rounded-md border border-line bg-sunk px-2 py-0.5 font-mono text-[11.5px] text-ink-soft">
                      {c.name} <span className="text-ink-faint">{c.type.toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={newChat} className="mt-4 text-[12.5px] text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink">
                  Use different data
                </button>
              </div>
            )}

            {active && (
              <ol className="space-y-7">
                {active.messages.map((m) =>
                  m.role === 'user' ? (
                    <li key={m.id} className="flex animate-rise justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-sunk px-3.5 py-2 text-[14.5px]">{m.text}</p>
                    </li>
                  ) : (
                    <li key={m.id}>
                      <AssistantCard
                        msg={m}
                        busy={busy}
                        canRun={ready}
                        onRunSql={(sql) => runSql(m, sql)}
                        onExplain={() => reExplain(m)}
                        onRetry={() => retry(m)}
                      />
                    </li>
                  ),
                )}
              </ol>
            )}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
          <div className="mx-auto w-full max-w-[760px]">
            {active && !ready && (
              <div className="mb-2 flex animate-rise flex-wrap items-center gap-2 rounded-xl border border-line bg-sunk px-3 py-2 text-[12.5px] text-ink-soft">
                {active.dataset.kind === 'upload' ? (
                  <>
                    <span className="flex-1">
                      This analysis used <strong className="font-medium text-ink">{active.dataset.name}</strong>. Files are never stored, so drop it again to keep asking.
                    </span>
                    <button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-ink shadow-sm hover:bg-hover">
                      <Upload size={12} /> Choose file
                    </button>
                    <input ref={uploadRef} type="file" accept=".csv,.tsv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
                  </>
                ) : (
                  <span>{loading ?? 'Loading the sample dataset...'}</span>
                )}
              </div>
            )}
            {suggestions.length > 0 && (
              <ul className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scroll-thin sm:flex-wrap" aria-label="Suggested questions">
                {suggestions.map((q, i) => (
                  <li key={q} className="shrink-0 animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                    <button type="button" onClick={() => ask(q)} disabled={busy} className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-ink-soft transition hover:border-line-strong hover:text-ink disabled:opacity-40">
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Composer
              disabled={!ready || busy}
              placeholder={placeholder}
              datasetLabel={datasetLabel}
              onSend={ask}
              onPickFile={pickFile}
              onDataset={newChat}
            />
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-faint">
              <Lock size={11} /> Your file stays in this browser.<span className="hidden sm:inline"> Answers can be wrong, so check the SQL.</span>
            </p>
          </div>
        </div>
      </main>

      {about && (
        <div className="fixed inset-0 z-50 grid animate-fade place-items-center bg-ink/30 p-4" onClick={() => setAbout(false)} onKeyDown={(e) => e.key === 'Escape' && setAbout(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="about-title" className="w-full max-w-md animate-rise rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start">
              <h2 id="about-title" className="flex-1 font-display text-2xl">Where your data goes</h2>
              <button type="button" autoFocus onClick={() => setAbout(false)} aria-label="Close" className="rounded-md p-1 text-ink-soft hover:bg-hover">
                <Close size={16} />
              </button>
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
              <li>Your CSV is parsed by DuckDB-WASM inside this tab. The file is never uploaded.</li>
              <li>To write SQL, the model sees column names and types, summary stats, and 5 sample rows.</li>
              <li>The SQL is checked by a read-only guard, then run locally. Failed queries go back to the model with the error, up to 3 tries.</li>
              <li>To write the summary, the model sees at most 200 result rows. Every number in the summary is checked against those rows.</li>
              <li>History is kept in this browser&apos;s local storage. Delete a conversation to remove it.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
