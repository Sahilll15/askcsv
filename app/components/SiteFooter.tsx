import Link from 'next/link';
import { REPO_URL } from '../../lib/seo';

const TOOLS = [
  { name: 'Interview Coach', url: 'https://interview-coach-seven-rose.vercel.app', what: 'AI mock interview practice' },
  { name: 'Minutes', url: 'https://minutes-sand.vercel.app', what: 'meeting minutes from audio' },
  { name: 'SplitSnap', url: 'https://splitsnap-sandy.vercel.app', what: 'split a bill from a receipt photo' },
  { name: 'ShipNotes', url: 'https://shipnotes-mu.vercel.app', what: 'release notes from GitHub commits' },
  { name: 'ToneRadar', url: 'https://toneradar.vercel.app', what: 'check the tone of a message' },
  { name: 'Headline Arena', url: 'https://headline-arena-gamma.vercel.app', what: 'test and rank headlines' },
  { name: 'FinePrint', url: 'https://fineprint-beta.vercel.app', what: 'find risky clauses in contracts' },
  { name: 'fallacy finder', url: 'https://fallacy-finder-nine.vercel.app', what: 'spot logical fallacies' },
  { name: 'PitchPanel', url: 'https://pitchpanel.vercel.app', what: 'startup pitch feedback' },
  { name: 'Ask India', url: 'https://askindia.online', what: 'answers from official government sites' },
];

const link = 'font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto w-full max-w-[760px] px-4 py-8 text-[12.5px] leading-relaxed text-ink-soft sm:px-6">
        <p>
          Your CSV is read by DuckDB in this tab and never uploaded. OpenAI gets your question, column names, summary stats, 5 sample rows and up to 200 result rows. History stays in this
          browser&apos;s local storage.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/how-it-works" className={link}>
            How it works
          </Link>
          <span>
            Built by{' '}
            <a href="https://sahilchalke.com" className={link}>
              Sahil Chalke
            </a>
          </span>
          <a href={REPO_URL} className={link}>
            Source code
          </a>
        </p>
        <h2 className="mt-6 text-[12px] font-medium text-ink">More tools</h2>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.url}>
              <a href={t.url} className="text-ink hover:underline hover:underline-offset-4">
                {t.name}
              </a>
              <span className="text-ink-faint">, {t.what}</span>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
