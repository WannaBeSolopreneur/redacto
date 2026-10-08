import { useRef, useState } from 'react';
import { Check, ClipboardPaste, Lock, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ACCEPT, FORMATS_LABEL } from '../formats';
import { activateModel, addFiles, addText, continueWithoutAI, store } from '../state/app';
import { useSlice } from '../state/store';
import { getModel } from '../ml/models';
import { Spinner } from './brand';
import { ModelPicker, useStoredModels } from './ModelPicker';
import { useElapsed } from './TopBar';

export const SAMPLE = `Patient: Maria Gonzalez   DOB: 04/12/1987   MRN: 00483921
Address: 742 Evergreen Terrace, Springfield, IL 62704
Phone: (217) 555-0198   Email: maria.gonzalez@example.org

Maria was seen by Dr. James Whitfield at Springfield General Hospital on March 3, 2025.
Her husband, Carlos Gonzalez, can be reached at +1 217 555 0142.
Billing: card 4111 1111 1111 1111, SSN 123-45-6789. Portal login from 192.168.4.21.`;

/** A button that opens the system file chooser. */
export function FilePicker({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: 'default' | 'outline' | 'ghost' }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} className={className} onClick={() => ref.current?.click()}>
        {children}
      </Button>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // allow choosing the same file again
        }}
      />
    </>
  );
}

/** Coloured replacement chip, as in the brand art. */
export function Chip({ type, children, className }: { type: string; children: React.ReactNode; className?: string }) {
  return (
    <span data-type={type} className={cn('inline-block bg-ent-bg px-1.5 py-0.5 font-mono text-xs font-semibold text-ent shadow-[inset_0_0_0_1px_var(--ent)]', className)}>
      {children}
    </span>
  );
}

const EXAMPLES: Array<[string, string, string]> = [
  ['PERSON', 'Maria Gonzalez', '[PERSON_1]'],
  ['EMAIL', 'maria@example.org', '[EMAIL_1]'],
  ['PHONE', '(217) 555-0198', '[PHONE_1]'],
  ['ID_NUMBER', 'MRN 00483921', '[ID_NUMBER_1]'],
];

const TRUST = [
  { Icon: Lock, title: 'Stays on your device', body: 'Everything runs in this tab. Nothing is sent to a server.' },
  { Icon: Sparkles, title: 'AI and rules together', body: 'A local PII model for names and context, checksummed patterns for cards, IBANs and SSNs.' },
  { Icon: WandSparkles, title: 'You stay in control', body: 'Review every finding, keep what you need, and export a clean copy with no hidden text or metadata.' },
];

function StepHeading({ id, n, done, children }: { id: string; n: number; done: boolean; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-3 text-base font-semibold">
      <span className={cn('grid size-7 place-items-center font-mono text-sm', done ? 'bg-teal text-white' : 'bg-primary text-primary-foreground')}>
        {done ? <Check className="size-4" /> : n}
      </span>
      {children}
    </h2>
  );
}

/** Step 1: choose a model and activate it. Nothing downloads or loads before the click. */
function ModelStep() {
  const settings = useSlice(store, (s) => s.settings);
  const model = useSlice(store, (s) => s.model);
  const { stored, refresh } = useStoredModels();
  const elapsed = useElapsed(model.status === 'loading' ? model.startedAt : null);
  const [changing, setChanging] = useState(false);
  const selected = getModel(settings.model);
  const ready = settings.useML && model.status === 'ready';

  if (!settings.useML) {
    return (
      <section aria-labelledby="step-model" className="border bg-card p-5 shadow-sm">
        <StepHeading id="step-model" n={1} done>AI model off: patterns only</StepHeading>
        <p className="mt-2 text-sm text-muted-foreground">
          Emails, phone numbers, IDs, cards and addresses are still found. Names need the AI model.{' '}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={activateModel}>Turn the AI model on</Button>
        </p>
      </section>
    );
  }
  if (ready && !changing) {
    const active = getModel(model.activeId ?? settings.model);
    return (
      <section aria-labelledby="step-model" className="border bg-card p-5 shadow-sm">
        <StepHeading id="step-model" n={1} done>{active.name} is active</StepHeading>
        <p className="mt-2 text-sm text-muted-foreground">
          Running on this device{model.info ? ` · ${model.info.threads} CPU thread${model.info.threads > 1 ? 's' : ''}` : ''}.{' '}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setChanging(true)}>Change model</Button>
        </p>
        {model.notice && <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">{model.notice}</p>}
      </section>
    );
  }
  return (
    <section aria-labelledby="step-model" className="flex flex-col gap-3 border bg-card p-5 shadow-sm">
      <StepHeading id="step-model" n={1} done={false}>Choose your AI model</StepHeading>
      <p className="text-sm text-muted-foreground">It finds names and other context, and runs entirely in this tab. Nothing downloads until you activate it.</p>
      <ModelPicker stored={stored} refresh={refresh} />
      {model.status === 'loading' ? (
        <div className="flex flex-col gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Spinner className="text-primary" />
            {model.fromDevice
              ? `Loading ${selected.name} from this device… ${elapsed}s`
              : model.progress > 0 && model.progress < 100 ? `Downloading ${selected.name}… ${Math.round(model.progress)}%` : `Preparing ${selected.name}… ${elapsed}s`}
          </span>
          {!model.fromDevice && model.progress > 0 && (
            <div className="h-1 w-full overflow-hidden bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(model.progress)}%` }} /></div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={() => { setChanging(false); activateModel(); }}>
            {stored.has(selected.id) ? `Activate ${selected.name.split(' · ')[0]}` : `Download & activate ${selected.name.split(' · ')[0]} (${selected.sizeMB} MB)`}
          </Button>
          <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={continueWithoutAI}>
            Continue without AI (patterns only)
          </Button>
        </div>
      )}
      {model.status === 'error' && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-destructive">{model.error}</p>
      )}
    </section>
  );
}

export function Welcome() {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const filesReady = useSlice(store, (s) => !s.settings.useML || s.model.status === 'ready');

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            Remove personal details <span className="text-primary">before AI sees them.</span>
          </h1>
          <p className="max-w-[48ch] text-lg leading-snug text-secondary-foreground">
            Names, addresses, phone numbers, IDs and 50+ other kinds of personal data are found by an AI model that runs in
            this tab. No uploads. No account.
          </p>

          <ModelStep />

          <section aria-labelledby="step-files" className={cn('border bg-card p-5 shadow-sm transition-opacity', !filesReady && 'opacity-60')}>
            <StepHeading id="step-files" n={2} done={false}>Add your files</StepHeading>
            {!filesReady ? (
              <p className="mt-3 border border-dashed border-input bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                Activate a model above first, or continue without AI.
              </p>
            ) : !pasting ? (
              <div className="mt-3 flex flex-col items-center gap-3 border border-dashed border-input bg-background px-4 py-10 text-center">
                <Upload className="size-6 text-primary" />
                <strong className="text-base font-semibold">Drop files anywhere on this page</strong>
                <span className="text-sm text-muted-foreground">{FORMATS_LABEL}</span>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <FilePicker>Choose files</FilePicker>
                  <Button variant="outline" onClick={() => setPasting(true)}>
                    <ClipboardPaste /> Paste text
                  </Button>
                </div>
                <Button variant="link" size="sm" onClick={() => addText(SAMPLE, 'Sample record.txt')}>
                  <WandSparkles /> or try a sample record
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <Textarea
                  autoFocus
                  rows={9}
                  placeholder="Paste text containing personal information…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) addText(text);
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPasting(false)}>Cancel</Button>
                  <Button disabled={!text.trim()} onClick={() => addText(text)}>Find personal data</Button>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:pt-3">
          <div className="border bg-card p-5">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              <Sparkles className="size-3.5 text-gold" /> Same value, same label
            </p>
            <ul className="flex flex-col divide-y border-t text-sm">
              {EXAMPLES.map(([type, from, to]) => (
                <li key={type} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate text-secondary-foreground">{from}</span>
                  <Chip type={type}>{to}</Chip>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">The AI you share with can still follow who is who.</p>
          </div>
          <ul className="flex flex-col gap-4 text-sm">
            {TRUST.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-3 border-t pt-4">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <strong className="block font-semibold">{title}</strong>
                  <span className="text-muted-foreground">{body}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
