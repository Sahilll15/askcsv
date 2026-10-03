'use client';

import dynamic from 'next/dynamic';

function Shell() {
  return (
    <div className="flex h-dvh gap-2 p-2" aria-busy="true">
      <h1 className="sr-only">AskCSV, ask questions about a CSV in plain English</h1>
      <div className="hidden w-64 flex-col gap-3 p-3 md:flex">
        <div className="skeleton h-6 w-28" />
        <div className="skeleton mt-6 h-4 w-16" />
        <div className="skeleton h-7 w-full" />
        <div className="skeleton h-7 w-4/5" />
      </div>
      <div className="flex-1 rounded-2xl border border-line bg-panel" />
    </div>
  );
}

// History lives in localStorage, so render client-only rather than hydrate an empty sidebar.
const AskApp = dynamic(() => import('./AskApp'), { ssr: false, loading: Shell });

export default function ClientApp() {
  return <AskApp />;
}
