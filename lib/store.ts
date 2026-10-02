'use client';

import type { Grounding, Usage } from './api';
import type { ChartSpec, Column, ResultRow } from './chartSpec';

export type Attempt = { sql: string; error: string | null; rowCount?: number; manual?: boolean };

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  question: string;
  status: 'planning' | 'running' | 'answering' | 'done' | 'error';
  attempts: Attempt[];
  intent?: string;
  sql?: string;
  chart?: ChartSpec;
  planChart?: ChartSpec;
  note?: string;
  chartWarnings?: string[];
  columns?: Column[];
  rows?: ResultRow[];
  totalRows?: number;
  answer?: string;
  grounding?: Grounding;
  answerStale?: boolean;
  error?: string;
  model?: string;
  usage?: Usage;
  ms?: number;
};

export type UserMessage = { id: string; role: 'user'; text: string };
export type Message = UserMessage | AssistantMessage;

export type DatasetRef = { kind: 'sample'; id: string; name: string; table: string } | { kind: 'upload'; name: string; table: string };

export type Conversation = {
  id: string;
  title: string;
  dataset: DatasetRef;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

const KEY = 'askcsv:conversations:v1';
const MAX_CONVERSATIONS = 40;
const STORED_ROWS = 200;

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]) {
  const trimmed = list
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
    .map((c) => ({
      ...c,
      messages: c.messages.map((m) => (m.role === 'assistant' && m.rows ? { ...m, rows: m.rows.slice(0, STORED_ROWS) } : m)),
    }));
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Quota hit: keep the newest half rather than losing everything.
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed.slice(0, Math.ceil(trimmed.length / 2))));
    } catch {}
  }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function groupByDay(list: Conversation[], now = Date.now()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const day = 864e5;
  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const c of list.slice().sort((a, b) => b.updatedAt - a.updatedAt)) {
    const t = c.updatedAt;
    const g = t >= today ? 0 : t >= today - day ? 1 : t >= today - 7 * day ? 2 : 3;
    groups[g].items.push(c);
  }
  return groups.filter((g) => g.items.length);
}
