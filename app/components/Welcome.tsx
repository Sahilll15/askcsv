'use client';

import { useRef, useState } from 'react';
import { SAMPLES } from '../../lib/samples';
import { Lock, Logo, Upload } from './Icons';

const TINTS = ['from-[#eef0ff] to-[#f6f3ff]', 'from-[#eaf7f4] to-[#f3fbf9]', 'from-[#fdf0f9] to-[#fff6ee]'];

export function Welcome({ loading, onSample, onFile }: { loading: string | null; onSample: (id: string) => void; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="animate-rise">
      <div className="flex gap-3">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-white">
          <Logo size={16} />
        </div>
        <p className="max-w-lg rounded-2xl bg-sunk px-4 py-3 text-[14.5px] leading-relaxed">
          Hi, I am AskCSV. Give me a spreadsheet and ask about it in plain English. I write the SQL, run it in your browser, chart the result, and tell you what it says.
        </p>
      </div>

      <h1 className="mt-10 font-display text-[40px] leading-[1.05] tracking-tight sm:text-5xl">
        Ask your data <em className="text-accent">anything.</em>
      </h1>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`mt-6 rounded-2xl border border-dashed p-6 text-center transition ${over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-white'}`}
      >
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-sunk text-ink-soft">
          <Upload size={18} />
        </div>
        <p className="mt-3 text-[14px] font-medium">Drop a CSV here</p>
        <p className="mt-1 text-[12.5px] text-ink-faint">Up to 25 MB, with a header row</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!!loading}
          className="mt-4 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-40"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <h2 className="mt-8 text-[13px] font-medium text-ink-soft">Or try a sample</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {SAMPLES.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSample(s.id)}
              disabled={!!loading}
              className={`group h-full w-full rounded-2xl border border-line bg-gradient-to-br ${TINTS[i]} p-4 text-left transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg disabled:opacity-60`}
            >
              <span className="block text-[14px] font-medium">{s.name}</span>
              <span className="mt-1 block text-[12.5px] leading-snug text-ink-soft">{s.blurb}</span>
              <span className="mt-3 block font-mono text-[11px] text-ink-faint">{s.rows}</span>
            </button>
          </li>
        ))}
      </ul>

      {loading && (
        <p className="mt-5 flex items-center gap-2 text-[13px] text-ink-soft" aria-live="polite">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> {loading}
        </p>
      )}

      <p className="mt-8 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-faint">
        <Lock size={14} className="mt-0.5 shrink-0" />
        <span>
          Your file is loaded into DuckDB inside this tab and is never uploaded. The model only sees column names, summary stats, 5 sample rows, and the rows your query returns (at most 200).
        </span>
      </p>
    </div>
  );
}
