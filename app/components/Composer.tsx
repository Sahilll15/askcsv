'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Database, Paperclip } from './Icons';

type Props = {
  disabled: boolean;
  /** Hourly question budget is spent: the text box itself is disabled, not just Send. */
  locked?: boolean;
  placeholder: string;
  datasetLabel: string | null;
  onSend: (q: string) => void;
  onPickFile: (f: File) => void;
  onDataset: () => void;
};

export function Composer({ disabled, locked = false, placeholder, datasetLabel, onSend, onPickFile, onDataset }: Props) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const send = () => {
    const q = text.trim();
    if (!q || disabled) return;
    onSend(q);
    setText('');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className={`rounded-2xl border border-line p-2 shadow-[0_8px_30px_-12px_rgba(15,15,20,0.12)] transition focus-within:border-line-strong ${locked ? 'bg-sunk' : 'bg-white'}`}
    >
      <label htmlFor="question" className="sr-only">Ask a question about your data</label>
      <textarea
        id="question"
        value={text}
        disabled={locked}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={Math.min(5, Math.max(1, text.split('\n').length))}
        placeholder={placeholder}
        className="block w-full resize-none bg-transparent px-2 py-1.5 text-[14.5px] outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
      />
      <div className="mt-1 flex items-center gap-1">
        <button type="button" onClick={onDataset} className="flex max-w-[60%] items-center gap-1.5 truncate rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:bg-hover hover:text-ink">
          <Database size={13} />
          <span className="truncate">{datasetLabel ?? 'Choose data'}</span>
        </button>
        <div className="flex-1" />
        {text.length > 400 && <span className="mr-1 text-[11px] text-ink-faint">{500 - text.length}</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink-soft hover:bg-hover hover:text-ink" aria-label="Upload a CSV" title="Upload a CSV">
          <Paperclip size={15} />
        </button>
        <button type="submit" disabled={disabled || !text.trim()} className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white transition hover:bg-black disabled:bg-line-strong" aria-label="Ask">
          <ArrowUp size={15} />
        </button>
      </div>
    </form>
  );
}
