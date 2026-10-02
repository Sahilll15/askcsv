'use client';

import { useMemo, useState } from 'react';
import { groupByDay, type Conversation } from '../../lib/store';
import { Chat, Close, Compose, Database, Info, Logo, Search, Trash } from './Icons';

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onAbout: () => void;
};

function RailButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg transition ${active ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:bg-hover hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

export function Sidebar({ conversations, activeId, open, onClose, onSelect, onNew, onDelete, onAbout }: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groupByDay(q ? conversations.filter((c) => c.title.toLowerCase().includes(q) || c.dataset.name.toLowerCase().includes(q)) : conversations);
  }, [conversations, query]);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 animate-fade bg-ink/20 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[288px] bg-canvas transition-transform duration-300 md:static md:z-auto md:translate-x-0 ${open ? 'translate-x-0 shadow-2xl md:shadow-none' : '-translate-x-full'}`}
        aria-label="Conversations"
      >
        <nav className="flex w-12 flex-col items-center gap-2 py-3" aria-label="App">
          <div className="mb-2"><Logo size={24} /></div>
          <RailButton label="Conversations" onClick={() => setSearching(false)} active>
            <Chat size={16} />
          </RailButton>
          <RailButton label="Datasets" onClick={onNew}>
            <Database size={16} />
          </RailButton>
          <div className="flex-1" />
          <RailButton label="How AskCSV handles your data" onClick={onAbout}>
            <Info size={16} />
          </RailButton>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col py-3 pr-2">
          <div className="flex h-8 items-center gap-1 pl-1">
            <span className="flex-1 text-[15px] font-semibold tracking-tight">AskCSV</span>
            <button type="button" onClick={onNew} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-hover hover:text-ink" aria-label="New analysis" title="New analysis">
              <Compose size={15} />
            </button>
            <button
              type="button"
              onClick={() => setSearching((s) => !s)}
              aria-pressed={searching}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-hover hover:text-ink"
              aria-label="Search conversations"
              title="Search"
            >
              <Search size={15} />
            </button>
            <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-hover md:hidden" aria-label="Close sidebar">
              <Close size={15} />
            </button>
          </div>

          {searching && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="mt-2 animate-rise rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
            />
          )}

          <div className="scroll-thin mt-4 flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="px-2 text-[12.5px] leading-relaxed text-ink-faint">
                Your analyses show up here. They are saved in this browser only.
              </p>
            ) : groups.length === 0 ? (
              <p className="px-2 text-[12.5px] text-ink-faint">Nothing matches &ldquo;{query}&rdquo;.</p>
            ) : (
              groups.map((g) => (
                <section key={g.label} className="mb-4">
                  <h2 className="mb-1 px-2 text-[11.5px] font-medium text-ink-faint">{g.label}</h2>
                  <ul>
                    {g.items.map((c) => (
                      <li key={c.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelect(c.id)}
                          aria-current={c.id === activeId ? 'page' : undefined}
                          className={`w-full truncate rounded-lg py-1.5 pl-2 pr-8 text-left text-[13px] transition ${c.id === activeId ? 'bg-hover font-medium text-ink' : 'text-ink-soft hover:bg-hover/70 hover:text-ink'}`}
                        >
                          {c.title}
                          <span className="block truncate text-[11px] font-normal text-ink-faint">{c.dataset.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(c.id)}
                          aria-label={`Delete ${c.title}`}
                          className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-faint opacity-0 transition hover:bg-white hover:text-bad focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
