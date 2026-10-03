# AskCSV

Drop a CSV, or pick one of three sample datasets, and ask questions about it in plain English. AskCSV writes the SQL, runs it in your browser, draws a chart, and gives a one or two sentence answer whose numbers are checked against the result.

It is for people who have a spreadsheet and a question but no time to write SQL or build a pivot table: founders looking at a billing export, ops people with a trip log, a shop owner with a sales file.

## How it works

1. **The file stays in the browser.** The CSV is loaded into DuckDB-WASM in the tab. The server never sees it. Only the table schema, per-column stats from `SUMMARIZE`, and 5 sample rows go to the model.
2. **Plan with Structured Outputs.** `POST /api/plan` calls the Responses API with `zodTextFormat`, so the model returns a typed object: a one-line intent, one DuckDB query, and a chart spec (`bar`, `line`, `scatter`, `table` or `number`, plus `x`, `y`, `series`).
3. **Read-only guard, twice.** `lib/sqlGuard.ts` masks strings and comments, then rejects anything that is not a single `SELECT` or `WITH` statement, any write or DDL keyword, `PRAGMA`/`SET`/`ATTACH`/`INSTALL`, and table functions that reach outside the loaded table (`read_csv`, `read_parquet`, `glob`, URLs). The server checks the model's SQL, and the browser checks it again right before executing, including SQL you type by hand.
4. **Repair loop.** If the query errors, is blocked, or returns no rows, the browser sends the SQL and the error back to `/api/plan` and the model fixes it. At most 3 attempts. Every attempt, with its SQL and error, is shown under "How I got this".
5. **Chart spec validation.** `lib/chartSpec.ts` checks the spec against the columns the query actually returned: unknown or non-numeric `y` columns are dropped, a missing `x` is guessed, scatter needs a numeric `x`, number cards need exactly one row, and too many points falls back to a table. Charts are hand-rolled SVG with hover tooltips.
6. **Grounded answer.** `POST /api/answer` sends at most 200 result rows and asks for a short answer that only uses numbers present in them. `lib/grounding.ts` extracts every number from the answer (handles `$85k`, `1,234.5`, `12.5%`, `3.2M`) and matches it against result cells, allowing rounding to the precision it was written at. If anything is unsupported, the server retries once with the offending numbers as feedback. The browser runs the same check again and shows a warning that names any number it could not find.
7. **Follow-ups and history.** The last 4 turns (question, intent, SQL) are sent as context, so "now only annual plans" works. Conversations are kept in `localStorage`, grouped by day in the sidebar. Results can be re-run with edited SQL, downloaded as CSV, and re-explained.

## Cost and abuse controls

- One hourly question budget per IP. The hour starts with the first counted question, and a refused request is not counted. A question is counted once, on the first `/api/plan` call. Repair calls and `/api/answer` (including "Explain again" after editing SQL) do not count, but they only work within 10 minutes of a counted question and have their own cap (`RATE_LIMIT_FOLLOWUPS`), so they cannot be used to keep going once the budget is spent.
- When the budget is spent, every route returns 429 with `{ error, resetAt, limit, remaining: 0 }` and a `retry-after` header. Successful responses carry `quota: { limit, remaining, resetAt }`, and `GET /api/quota` returns the same thing without counting anything.
- The browser shows "N of M questions left this hour" next to the composer. At zero it disables the composer, the suggested questions, SQL re-runs and "Explain again", shows when the limit resets with a countdown, and sends nothing until then.
- Counts are global across instances: they live in Upstash Redis (`rl:askcsv:question:<ip>` and `rl:askcsv:followup:<ip>`), and the 10 minute live-question check reads the same keys. Without the Redis env vars (local dev, tests) the limiter falls back to process memory. If Redis is configured but unreachable, `/api/plan`, `/api/answer` and `/api/quota` return 503 "The service is busy, try again in a minute." instead of running unmetered.
- The IP comes from `x-real-ip`, then the last `x-forwarded-for` entry (the first one is client-controlled). IPv6 addresses are grouped by /64. Input is validated before it counts.
- Body size checked from `content-length` and again after reading: 64 KB for plan, 256 KB for answer. Question capped at 500 characters, history at 4 turns, attempts at 2 prior failures, rows at 200.
- Model names are whitelisted on the server. `reasoning.effort` is `low` and output tokens are capped.
- Each response returns token usage and an estimated cost, shown in the trace.

Rough cost on `gpt-5.4-mini` ($0.75 in / $4.50 out per 1M tokens): a question that works first time is one plan call and one answer call, about $0.004 to $0.008. The worst case (3 plan attempts, a 200-row answer and its retry) is about $0.03. `gpt-5.5` is roughly 7x that.

## Run it

```bash
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY
npm run dev                  # or: npm run build && npx next start -p 3204
npm test                     # SQL guard, grounding check, chart spec, rate limiter
```

Sample data lives in `public/data/` and is generated by `node scripts/gen-data.mjs` (seeded, so it is reproducible). DuckDB-WASM loads its worker and wasm from jsDelivr on first use.

## Config

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Server-side key. Never sent to the browser. |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Model used when the client does not pick one from the whitelist. |
| `RATE_LIMIT_QUESTIONS` | `10` | Questions per IP per window. |
| `RATE_LIMIT_FOLLOWUPS` | 4x questions | Repair and answer calls per IP per window. A question uses at most 3. |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | none | Upstash Redis for shared limits. Set by the Vercel integration; `vercel env pull .env.local` for local use. |
| `RATE_LIMIT_NAMESPACE` | `askcsv` | Redis key namespace; use a different one for local runs against the shared database. |

## Limits

- One table at a time. Joins across files are not supported.
- The grounding check proves that a number is in the result, not that the sentence around it is right. Check the SQL for anything important.
