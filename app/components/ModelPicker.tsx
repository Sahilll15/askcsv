'use client';

import { useEffect, useRef, useState } from 'react';
import { MODELS } from '../../lib/api';
import { Check, Chevron, Cpu } from './Icons';

export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${current.label}`}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-ink hover:bg-hover"
      >
        <Cpu size={14} className="text-ink-soft" />
        <span className="hidden sm:inline">{current.label}</span>
        <Chevron size={14} className={`text-ink-soft transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Model" className="absolute right-0 top-full z-20 mt-1 w-64 animate-rise rounded-xl border border-line bg-white p-1 shadow-xl">
          {MODELS.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === value}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-hover"
              >
                <span className="flex-1">
                  <span className="block text-[13px] font-medium">{m.label}</span>
                  <span className="block text-[12px] text-ink-faint">{m.hint}</span>
                </span>
                {m.id === value && <Check size={14} className="mt-0.5 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
