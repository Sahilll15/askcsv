'use client';

import dynamic from 'next/dynamic';
import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_MODEL } from '../lib/api';
import { Composer } from './components/Composer';
import { FinePrint } from './components/FinePrint';
import { Menu } from './components/Icons';
import { ModelPicker } from './components/ModelPicker';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';

type Slots = { intro: ReactNode; note: ReactNode };
const SlotContext = createContext<Slots>({ intro: null, note: null });
const noop = () => {};

// Mirrors AskApp's empty state so the server HTML has the welcome copy and the swap does not shift.
function Shell() {
  const { intro, note } = useContext(SlotContext);
  return (
    <div className="flex h-dvh md:gap-1 md:p-2" aria-busy="true">
      <Sidebar conversations={[]} activeId={null} open={false} onClose={noop} onSelect={noop} onNew={noop} onDelete={noop} onAbout={noop} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-panel md:rounded-2xl md:border md:border-line">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-hover md:hidden" aria-label="Open conversations">
            <Menu size={17} />
          </button>
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium">New analysis</p>
          <ModelPicker value={DEFAULT_MODEL} onChange={noop} />
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-4 pb-8 pt-6 sm:px-6 sm:pt-10">
            <Welcome loading={null} onSample={noop} onFile={noop} intro={intro} note={note} />
          </div>
        </div>
        <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
          <div className="mx-auto w-full max-w-[760px]">
            <Composer disabled placeholder="Pick a sample or drop a CSV to start" datasetLabel={null} onSend={noop} onPickFile={noop} onDataset={noop} />
            <FinePrint />
          </div>
        </div>
      </main>
    </div>
  );
}

// History lives in localStorage, so render client-only rather than hydrate an empty sidebar.
const AskApp = dynamic(() => import('./AskApp'), { ssr: false, loading: Shell });

export default function ClientApp({ intro, note }: Slots) {
  return (
    <SlotContext.Provider value={{ intro, note }}>
      <AskApp intro={intro} note={note} />
    </SlotContext.Provider>
  );
}
