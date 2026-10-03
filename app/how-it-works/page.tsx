import type { Metadata } from 'next';
import Link from 'next/link';
import { MAX_ANSWER_ROWS, MAX_ATTEMPTS, MAX_QUESTION_CHARS, MODELS } from '../../lib/api';
import { SAMPLES } from '../../lib/samples';
import { APP_ID, PERSON_ID, SITE_URL, WEBSITE_ID, breadcrumbs, pageMetadata } from '../../lib/seo';
import { Logo } from '../components/Icons';
import { JsonLd } from '../components/JsonLd';

export const metadata: Metadata = pageMetadata({
  title: 'How AskCSV works: SQL in your browser',
  description:
    'How AskCSV turns a plain English question about a CSV into DuckDB SQL that runs in your browser, what the model sees, how answers are checked, and the limits.',
  path: '/how-it-works',
});

const url = `${SITE_URL}/how-it-works`;
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: 'How AskCSV works',
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': APP_ID },
      author: { '@id': PERSON_ID },
      dateModified: '2026-10-04',
    },
    breadcrumbs([
      { name: 'Home', path: '/' },
      { name: 'How it works', path: '/how-it-works' },
    ]),
  ],
};

const STEPS = [
  {
    title: 'Load the data in your tab',
    body: 'Drop a CSV or pick a sample. DuckDB-WASM, a SQL engine compiled to WebAssembly and loaded from the jsDelivr CDN, reads the file into one table inside this browser tab. It then profiles the table with SUMMARIZE and takes 5 random sample rows.',
  },
  {
    title: 'Plan a query',
    body: 'Your question and the table profile go to the AskCSV server, which asks an OpenAI model for a typed plan: a one line intent, one DuckDB query and a chart spec.',
  },
  {
    title: 'Check the SQL is read-only',
    body: 'The server rejects anything that is not a single SELECT or WITH statement, any write or DDL keyword, PRAGMA, SET, ATTACH, INSTALL, and functions that reach outside the table such as read_csv, read_parquet or glob. The browser runs the same check again right before executing, including SQL you edit by hand.',
  },
  {
    title: 'Run it, and repair if needed',
    body: `The query runs in DuckDB in your tab. If it errors, is blocked or returns no rows, the SQL and the error go back to the model for a fix, up to ${MAX_ATTEMPTS} attempts in total. Every attempt is listed under "How I got this".`,
  },
  {
    title: 'Draw the chart',
    body: 'The chart spec is checked against the columns the query actually returned. Unknown or non-numeric columns are dropped, scatter plots need a numeric x axis, and a chart with too many points falls back to a table.',
  },
  {
    title: 'Write and check the answer',
    body: `Up to ${MAX_ANSWER_ROWS} result rows go to the model, which writes one to three sentences. Every number in the answer is matched against the result cells, allowing for rounding such as 38.2k. If a number is not found, the server asks once more. The browser repeats the check and shows a warning naming any number it could not find.`,
  },
];

const LIMITS = [
  'Files: .csv, .tsv or .txt, up to 25 MB, with a header row.',
  'One table at a time. Loading a new file replaces the previous table, so joins across files are not supported.',
  'The model sees a profile of the first 80 columns.',
  `Questions can be up to ${MAX_QUESTION_CHARS} characters. Follow-up questions carry the last 4 answered turns as context.`,
  `Up to ${MAX_ATTEMPTS} query attempts per question.`,
  'The browser reads up to 5,000 rows of a query result and keeps 2,000 for the chart and table.',
  'Charts hold up to 60 bars, 400 line points or 2,000 scatter points before falling back to a table.',
  'The free demo has an hourly question budget per IP address (10 by default in the code). The number left is shown next to the question box.',
];

const card = 'rounded-2xl border border-line bg-panel p-5 sm:p-6';
const h2 = 'font-display text-3xl tracking-tight';

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-12 pt-6 sm:px-6 sm:pt-10">
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ink-soft">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink hover:underline hover:underline-offset-4">
          <Logo size={20} /> AskCSV
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">How it works</span>
      </nav>

      <h1 className="mt-8 font-display text-[40px] leading-[1.05] tracking-tight sm:text-5xl">How AskCSV works</h1>
      <div className="mt-5 space-y-3 text-[15px] leading-relaxed">
        <p>AskCSV answers questions about a CSV file in plain English. It writes a DuckDB SQL query, runs it in your browser, draws a chart and writes a short answer.</p>
        <p>Your file is never uploaded. The model sees a summary of the table and the rows a query returns, not the file.</p>
        <p>Every number in the answer is checked in code against the query result. The check proves the number is in the result, not that the sentence around it is right, so read the SQL for anything important.</p>
        <p>It is free to use, with an hourly question limit.</p>
      </div>
      <p className="mt-6">
        <Link href="/" className="inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black">
          Try it with a sample
        </Link>
      </p>

      <section aria-labelledby="steps" className="mt-12">
        <h2 id="steps" className={h2}>
          From question to answer
        </h2>
        <ol className="mt-5 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-medium text-accent-deep">
                {i + 1}
              </span>
              <div>
                <h3 className="text-[15px] font-medium">{s.title}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="where" className="mt-12">
        <h2 id="where" className={h2}>
          What runs where
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={card}>
            <h3 className="text-[14px] font-medium">In your browser</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
              <li>Reading the CSV and storing it as a table</li>
              <li>Profiling columns and picking sample rows</li>
              <li>Running every SQL query</li>
              <li>The second read-only check</li>
              <li>Drawing the chart as SVG</li>
              <li>The second number check on the answer</li>
              <li>Conversation history, in local storage</li>
            </ul>
          </div>
          <div className={card}>
            <h3 className="text-[14px] font-medium">On the server</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
              <li>The hourly question limit, counted per IP address</li>
              <li>Calls to the OpenAI Responses API with structured output</li>
              <li>The first read-only check on the model&apos;s SQL</li>
              <li>The first number check on the answer, with one retry</li>
            </ul>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              Models: {MODELS[0].label} by default, or {MODELS[1].label}. You pick one in the menu at the top of the app.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="privacy" className="mt-12">
        <h2 id="privacy" className={h2}>
          What the model sees
        </h2>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          The CSV file itself never leaves your device. These parts of it do, through the AskCSV server to OpenAI:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-soft">
          <li>To write SQL: your question, the table name and row count, column names and types, per-column stats (min, max, average, distinct count, share of nulls, and for text columns with 40 or fewer distinct values the 12 most common values with counts), and 5 sample rows with text cut to 120 characters.</li>
          <li>For follow-ups and repairs: the last 4 questions with their intent and SQL, and the SQL and error of failed attempts.</li>
          <li>To write the answer: your question, the intent, the SQL, the result column names and up to {MAX_ANSWER_ROWS} result rows.</li>
        </ul>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          The AskCSV server does not save any of this. It only records when each IP address asked, to enforce the hourly limit. What OpenAI keeps is set by its API data policy, not by this app. Your conversations, including up to 200 result rows per answer, stay in this browser&apos;s local storage until you delete them. Uploaded files are not kept, so you drop the file again to continue an old conversation.
        </p>
      </section>

      <section aria-labelledby="example" className="mt-12">
        <h2 id="example" className={h2}>
          An example
        </h2>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          On the SaaS subscriptions sample, the question &quot;What is active MRR by plan?&quot; leads to a query like this one. The model writes its own SQL each time, so yours may differ.
        </p>
        <pre className="sql mt-3 overflow-x-auto rounded-xl border border-line bg-sunk p-4">{`SELECT plan, ROUND(SUM(mrr_usd), 2) AS active_mrr
FROM subscriptions
WHERE status = 'active'
GROUP BY plan
ORDER BY active_mrr DESC`}</pre>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Result of the example query</caption>
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">plan</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">active_mrr</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[12.5px]">
              {[
                ['Enterprise', '419479.65'],
                ['Scale', '247350.75'],
                ['Growth', '126749.21'],
                ['Starter', '44160.99'],
              ].map(([plan, mrr]) => (
                <tr key={plan} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{plan}</td>
                  <td className="px-4 py-2 text-right">{mrr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">The model is told to chart a few categories like these as bars.</p>
      </section>

      <section aria-labelledby="samples" className="mt-12">
        <h2 id="samples" className={h2}>
          Sample datasets
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {SAMPLES.map((s) => (
            <li key={s.id} className={card}>
              <h3 className="text-[14px] font-medium">{s.name}</h3>
              <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">{s.blurb}</p>
              <p className="mt-2 font-mono text-[11px] text-ink-faint">{s.rows}</p>
              <ul className="mt-3 space-y-1 text-[12.5px] leading-snug text-ink-soft">
                {s.questions.slice(0, 2).map((q) => (
                  <li key={q}>&quot;{q}&quot;</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="limits" className="mt-12">
        <h2 id="limits" className={h2}>
          Limits
        </h2>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-soft">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
