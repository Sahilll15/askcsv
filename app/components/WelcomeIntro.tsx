import Link from 'next/link';
import { Lock, Logo } from './Icons';

/** Static welcome copy, rendered on the server so it is in the HTML before the app loads. */
export function WelcomeIntro() {
  return (
    <>
      <div className="flex gap-3">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-white">
          <Logo size={16} />
        </div>
        <p className="max-w-lg rounded-2xl bg-sunk px-4 py-3 text-[14.5px] leading-relaxed">
          Hi, I am AskCSV. Give me a spreadsheet and ask about it in plain English. I write the SQL, run it in your browser, chart the result, and tell you what it says.{' '}
          <Link href="/how-it-works" className="text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink">
            See how it works
          </Link>
          .
        </p>
      </div>

      <h1 className="mt-10 font-display text-[40px] leading-[1.05] tracking-tight sm:text-5xl">
        <span className="mb-2 block font-sans text-[13px] font-medium leading-snug tracking-normal text-ink-soft">
          AskCSV, ask questions about a CSV in plain English
        </span>
        Ask your data <em className="text-accent">anything.</em>
      </h1>
    </>
  );
}

export function PrivacyNote() {
  return (
    <p className="mt-8 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-faint">
      <Lock size={14} className="mt-0.5 shrink-0" />
      <span>
        Your file is loaded into DuckDB inside this tab and is never uploaded. The model only sees column names, summary stats, 5 sample rows, and the rows your query returns (at most 200).
      </span>
    </p>
  );
}
