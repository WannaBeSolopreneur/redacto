import { useRef, useState } from 'react';
import { Check, ClipboardPaste, Upload, WandSparkles } from 'lucide-react';
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

const HOW = [
  { title: 'Pick a model', body: 'Larger models find more. Smaller ones are faster.' },
  { title: 'Download it once', body: 'It is saved in this browser. After that it loads from your device, even offline.' },
  { title: 'Add your documents', body: 'They are read in this tab. Nothing is uploaded.' },
];

/**
 * First run: set up the model before any document is accepted. Explains why a download is needed, then lets
 * people pick and activate one. Nothing downloads or loads before the click.
 */
function ModelSetup({ onDone }: { onDone: () => void }) {
  const settings = useSlice(store, (s) => s.settings);
  const model = useSlice(store, (s) => s.model);
  const { stored, refresh } = useStoredModels();
  const elapsed = useElapsed(model.status === 'loading' ? model.startedAt : null);
  const selected = getModel(settings.model);
  const tier = selected.name.split(' · ')[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold tracking-widest text-primary uppercase">Before you add a document</p>
        <h1 className="text-3xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
          First, get the AI model onto this device.
        </h1>
        <p className="text-base leading-relaxed text-secondary-foreground">
          Redacto finds names, addresses and other personal details with a small AI model. The model runs inside this
          browser tab, not on a server, which is why your documents never leave your device. So it has to be on your
          device before you add one.
        </p>
      </header>

      <ol className="grid gap-px border bg-border sm:grid-cols-3">
        {HOW.map((step, i) => (
          <li key={step.title} className="flex gap-3 bg-card p-4 sm:flex-col sm:gap-2">
            <span className="grid size-6 shrink-0 place-items-center bg-primary font-mono text-xs text-primary-foreground">{i + 1}</span>
            <span className="flex flex-col gap-0.5">
              <strong className="text-sm font-semibold">{step.title}</strong>
              <span className="text-sm text-muted-foreground">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="choose-model" className="flex flex-col gap-3">
        <h2 id="choose-model" className="text-base font-semibold">Choose a model</h2>
        <ModelPicker stored={stored} refresh={refresh} />
        {model.status === 'loading' ? (
          <div className="flex flex-col gap-2 border bg-card p-4 text-sm" role="status">
            <span className="flex items-center gap-2">
              <Spinner className="text-primary" />
              {model.fromDevice
                ? `Loading ${tier} from this device… ${elapsed}s`
                : model.progress > 0 && model.progress < 100 ? `Downloading ${tier}… ${Math.round(model.progress)}%` : `Preparing ${tier}… ${elapsed}s`}
            </span>
            {!model.fromDevice && model.progress > 0 && (
              <div className="h-1 w-full overflow-hidden bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(model.progress)}%` }} /></div>
            )}
            <span className="text-xs text-muted-foreground">You can add documents as soon as it's ready.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button size="lg" className="w-full sm:w-auto" onClick={() => { onDone(); activateModel(); }}>
              {stored.has(selected.id) ? `Activate ${tier}` : `Download & activate ${tier} (${selected.sizeMB} MB)`}
            </Button>
            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => { onDone(); continueWithoutAI(); }}>
              Continue without AI (patterns only)
            </Button>
          </div>
        )}
        {model.status === 'error' && <p className="bg-red-50 p-2 text-xs text-destructive">{model.error}</p>}
      </section>
    </div>
  );
}

/** Once a model is active (or AI is off): add documents. */
function AddDocuments({ onChangeModel }: { onChangeModel: () => void }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const settings = useSlice(store, (s) => s.settings);
  const model = useSlice(store, (s) => s.model);
  const active = getModel(model.activeId ?? settings.model);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="grid size-5 place-items-center bg-teal text-white"><Check className="size-3.5" /></span>
          {settings.useML ? (
            <>
              <span><strong className="font-semibold text-foreground">{active.name.split(' · ')[0]}</strong> model is ready on this device.</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={onChangeModel}>Change</Button>
            </>
          ) : (
            <>
              <span>AI model off: emails, phones, IDs and cards are still found, names are not.</span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={onChangeModel}>Set up the AI model</Button>
            </>
          )}
        </p>
        <h1 className="text-3xl leading-[1.08] font-semibold tracking-[-0.03em] sm:text-4xl">Add your documents.</h1>
        {model.notice && <p className="bg-amber-50 p-2 text-xs text-amber-900">{model.notice}</p>}
      </header>

      {!pasting ? (
        <section aria-label="Add files" className="flex flex-col items-center gap-3 border border-dashed border-input bg-card px-4 py-10 text-center sm:py-14">
          <Upload className="size-6 text-primary" />
          <strong className="text-base font-semibold">
            <span className="hidden sm:inline">Drop files anywhere on this page</span>
            <span className="sm:hidden">Choose files to redact</span>
          </strong>
          <span className="text-sm text-muted-foreground">{FORMATS_LABEL}</span>
          <div className="mt-1 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
            <FilePicker>Choose files</FilePicker>
            <Button variant="outline" onClick={() => setPasting(true)}>
              <ClipboardPaste /> Paste text
            </Button>
          </div>
          <Button variant="link" size="sm" onClick={() => addText(SAMPLE, 'Sample record.txt')}>
            <WandSparkles /> or try a sample record
          </Button>
        </section>
      ) : (
        <section aria-label="Paste text" className="flex flex-col gap-3">
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
        </section>
      )}
    </div>
  );
}

export function Welcome() {
  const ready = useSlice(store, (s) => !s.settings.useML || s.model.status === 'ready');
  const [changing, setChanging] = useState(false);
  return (
    <main className="flex-1 overflow-y-auto">
      {ready && !changing ? <AddDocuments onChangeModel={() => setChanging(true)} /> : <ModelSetup onDone={() => setChanging(false)} />}
    </main>
  );
}
