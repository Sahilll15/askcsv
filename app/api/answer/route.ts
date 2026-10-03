import { zodTextFormat } from 'openai/helpers/zod';
import { AnswerRequestSchema, AnswerSchema, type AnswerRequest, type AnswerResponse } from '../../../lib/api';
import { checkGrounding } from '../../../lib/grounding';
import { readJson } from '../../server/http';
import { addUsage, openai, resolveModel, upstreamError, usageOf } from '../../server/openai';
import { clientIp, limited, quota } from '../../server/ratelimit';

const MAX_BYTES = 256 * 1024;

const INSTRUCTIONS = `You explain a SQL result to a busy person in one to three short sentences.
Hard rule: every number you write must appear in the result rows, either exactly or rounded (e.g. 38214 may be written as 38.2k or $38k).
Do not compute new numbers (no differences, ratios, growth rates or totals) unless that value is a column in the result.
Name the specific categories or dates the numbers belong to. If the result is empty or cannot answer the question, say so plainly.
No preamble, no markdown, no hedging filler.`;

function buildInput(body: AnswerRequest, feedback?: string[]) {
  const truncated = body.totalRows > body.rows.length ? ` (showing the first ${body.rows.length} of ${body.totalRows})` : '';
  const parts = [
    `Question: ${body.question}`,
    `What the query computes: ${body.intent}`,
    `SQL: ${body.sql}`,
    `Columns: ${body.columns.map((c) => `${c.name} ${c.type}`).join(', ')}`,
    `Result rows${truncated}, JSON:`,
    JSON.stringify(body.rows),
  ];
  if (feedback?.length) {
    parts.push(
      `Your previous answer used numbers that are not in the result: ${feedback.join(', ')}. Rewrite it using only numbers present in the rows.`,
    );
  }
  return parts.join('\n');
}

export async function POST(req: Request) {
  const body = await readJson(req, MAX_BYTES, AnswerRequestSchema);
  if (body instanceof Response) return body;

  const gate = await quota.followup(clientIp(req));
  if (!gate.ok) return limited(gate);

  const model = resolveModel(body.model);
  const ask = (feedback?: string[]) =>
    openai().responses.parse({
      model,
      instructions: INSTRUCTIONS,
      input: buildInput(body, feedback),
      reasoning: { effort: 'low' },
      max_output_tokens: 2000,
      text: { format: zodTextFormat(AnswerSchema, 'grounded_answer') },
    });

  try {
    let response = await ask();
    let usage = usageOf(model, response.usage);
    let answer = response.output_parsed?.answer?.trim() ?? '';
    let grounding = checkGrounding(answer, body.rows, [body.question]);
    let retried = false;

    // One corrective retry, then ship it with the flag so the UI can warn.
    if (!grounding.ok) {
      retried = true;
      response = await ask(grounding.unsupported);
      usage = addUsage(usage, usageOf(model, response.usage));
      const second = response.output_parsed?.answer?.trim() ?? '';
      const secondCheck = checkGrounding(second, body.rows, [body.question]);
      if (second && secondCheck.unsupported.length <= grounding.unsupported.length) {
        answer = second;
        grounding = secondCheck;
      }
    }
    if (!answer) return Response.json({ error: 'The model returned an empty answer.' }, { status: 502 });

    const result: AnswerResponse = { answer, grounding, retried, model, usage, quota: gate.quota };
    return Response.json(result);
  } catch (err) {
    return upstreamError(err);
  }
}
