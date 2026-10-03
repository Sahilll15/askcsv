import { z } from 'zod';
import { ChartSpecSchema } from './chartSpec';

export const MODELS = [
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', hint: 'Fast and cheap' },
  { id: 'gpt-5.5', label: 'GPT-5.5', hint: 'Slower, better at tricky SQL' },
] as const;
export const DEFAULT_MODEL = 'gpt-5.4-mini';

export const MAX_QUESTION_CHARS = 500;
export const MAX_ANSWER_ROWS = 200;
export const MAX_ATTEMPTS = 3;

const cell = z.union([z.string().max(300), z.number(), z.boolean(), z.null()]);
const row = z.record(z.string().max(128), cell);

export const ProfileSchema = z.object({
  table: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/),
  rowCount: z.number().int().nonnegative(),
  columns: z
    .array(z.object({ name: z.string().min(1).max(128), type: z.string().max(60), stats: z.string().max(500) }))
    .min(1)
    .max(80),
  sampleRows: z.array(row).max(5),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PlanRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  model: z.string().max(40).optional(),
  profile: ProfileSchema,
  history: z
    .array(z.object({ question: z.string().max(MAX_QUESTION_CHARS), intent: z.string().max(300), sql: z.string().max(8000) }))
    .max(4),
  attempts: z.array(z.object({ sql: z.string().max(8000), error: z.string().max(800) })).max(MAX_ATTEMPTS - 1),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const PlanSchema = z.object({
  intent: z.string().describe('One line, plain English: what the query computes'),
  sql: z.string().describe('A single DuckDB SELECT or WITH query against the table'),
  chart: ChartSpecSchema,
});
export type Plan = z.infer<typeof PlanSchema>;

export const AnswerRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  model: z.string().max(40).optional(),
  intent: z.string().max(300),
  sql: z.string().max(8000),
  columns: z.array(z.object({ name: z.string().max(128), type: z.string().max(60) })).min(1).max(60),
  rows: z.array(row).max(MAX_ANSWER_ROWS),
  totalRows: z.number().int().nonnegative(),
});
export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;

export const AnswerSchema = z.object({
  answer: z.string().describe('One to three plain sentences that answer the question from the result'),
});

export type Usage = { inputTokens: number; outputTokens: number; costUsd: number };
export type Grounding = { ok: boolean; checked: number; unsupported: string[] };
/** Hourly question budget for the caller. resetAt is epoch ms. */
export type Quota = { limit: number; remaining: number; resetAt: number };
export type PlanResponse = Plan & { model: string; usage: Usage; quota: Quota };
export type AnswerResponse = { answer: string; grounding: Grounding; retried: boolean; model: string; usage: Usage; quota: Quota };
/** Body of every 429 from /api/plan and /api/answer. */
export type LimitBody = Quota & { error: string; reason: 'questions' | 'no_live_question'; remaining: 0 };
