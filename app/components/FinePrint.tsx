import { Lock } from './Icons';

export function FinePrint() {
  return (
    <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-faint">
      <Lock size={11} /> Your file stays in this browser.<span className="hidden sm:inline"> Answers can be wrong, so check the SQL.</span>
    </p>
  );
}
