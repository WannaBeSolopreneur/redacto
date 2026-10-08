import { useMemo } from 'react';
import { applyToText, Replacer } from '../core/transform';
import { docView, store, type DocState } from '../state/app';
import { useSlice } from '../state/store';

export function OutputView({ d }: { d: DocState }) {
  const settings = useSlice(store, (s) => s.settings);
  const { active } = docView(d, settings);
  const text = d.doc!.text;
  // Keyed on the active entities, not the document state, so UI-only changes don't rebuild the text.
  const out = useMemo(() => applyToText(text, active, new Replacer(settings.mode)), [text, active, settings.mode]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <p className="mb-3 text-xs text-muted-foreground">
        {d.doc?.kind === 'docx' ? 'Text only. The downloaded file keeps the original formatting.' : 'This is exactly what the downloaded file will contain.'}
      </p>
      <pre className="rounded-xl border bg-card px-6 py-5 font-mono text-[13px] leading-7 whitespace-pre-wrap shadow-sm [overflow-wrap:anywhere]">{out}</pre>
    </div>
  );
}
