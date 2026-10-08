import { useRef, useState } from 'react';
import { ArrowLeftRight, ArrowRight, ArrowUpRight, Check, ClipboardPaste, Cloud, Download, FileText, Laptop, Lock, Smartphone, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ACCEPT, FORMATS_LABEL } from '../formats';
import { activateModel, addFiles, addText, continueWithoutAI, store, updateSettings } from '../state/app';
import { useSlice } from '../state/store';
import { IS_PHONE, MODELS, getModel, modelCard } from '../ml/models';
import { Spinner } from './brand';
import { useStoredModels } from './ModelPicker';
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

/** Five-step meter: filled squares out of five. */
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`${label}: ${value} of 5`}>
      <span className="w-9 text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn('h-1.5 w-2.5', i <= value ? 'bg-primary' : 'bg-muted')} />
        ))}
      </span>
    </span>
  );
}

/** Cloud → this device → your documents stay here. */
function HowItWorks() {
  const Device = IS_PHONE ? Smartphone : Laptop;
  const node = 'grid size-11 place-items-center border bg-card sm:size-14';
  return (
    <figure aria-label="How it works" className="flex flex-col gap-2">
      <div className="flex items-center">
        <span className={node}><Cloud className="size-5 text-muted-foreground sm:size-6" /></span>
        <span className="relative mx-1 flex flex-1 items-center">
          <span className="h-px flex-1 border-t border-dashed border-primary" />
          <ArrowRight className="-ml-1 size-3.5 text-primary" />
        </span>
        <span className={cn(node, 'relative border-primary bg-accent')}>
          <Device className="size-5 text-primary sm:size-6" />
          <Sparkles className="absolute -top-1.5 -right-1.5 size-3.5 text-gold" />
        </span>
        <span className="relative mx-1 flex flex-1 items-center">
          <span className="h-px flex-1 border-t border-dashed border-teal" />
          <ArrowLeftRight className="size-3.5 text-teal" />
          <span className="h-px flex-1 border-t border-dashed border-teal" />
        </span>
        <span className={cn(node, 'relative')}>
          <FileText className="size-5 sm:size-6" />
          <Lock className="absolute -right-1.5 -bottom-1.5 size-4 bg-background p-0.5 text-teal" />
        </span>
      </div>
      <figcaption className="grid grid-cols-3 text-[11px] leading-tight text-muted-foreground sm:text-xs">
        <span>Download once</span>
        <span className="text-center font-medium text-foreground">AI runs on your device</span>
        <span className="text-right">Files never leave it</span>
      </figcaption>
    </figure>
  );
}

/**
 * First run: get a model onto the device before any document is accepted. Nothing downloads or loads before
 * the click. Sized to fit one phone screen.
 */
function ModelSetup({ onDone }: { onDone: () => void }) {
  const settings = useSlice(store, (s) => s.settings);
  const model = useSlice(store, (s) => s.model);
  const { stored } = useStoredModels();
  const elapsed = useElapsed(model.status === 'loading' ? model.startedAt : null);
  const selected = getModel(settings.model);
  const tier = selected.name.split(' · ')[0];
  const loading = model.status === 'loading';

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5 sm:gap-7 sm:px-6 sm:py-12">
      <h1 className="text-2xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
        First, get the AI model <span className="text-primary">onto this device.</span>
      </h1>

      <HowItWorks />

      <RadioGroup
        value={settings.model}
        onValueChange={(id) => updateSettings({ model: id, modelChosen: true })}
        disabled={loading}
        aria-label="AI model"
        className="grid grid-cols-2 gap-2"
      >
        {MODELS.map((m) => {
          const [name, family] = m.name.split(' · ');
          return (
            <Label
              key={m.id}
              htmlFor={`setup-${m.id}`}
              className={cn(
                'relative flex flex-col items-start gap-1.5 border bg-card p-3 font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:shadow-[inset_0_0_0_1px_var(--primary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                loading && 'opacity-60',
              )}
            >
              <RadioGroupItem id={`setup-${m.id}`} value={m.id} className="sr-only" />
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="text-base font-semibold">{name}</span>
                <a
                  href={modelCard(m)}
                  target="_blank"
                  rel="noreferrer"
                  className="-m-1 p-1 text-muted-foreground hover:text-primary"
                  aria-label={`${family} model card on Hugging Face`}
                  title="Model card on Hugging Face"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ArrowUpRight className="size-3.5" />
                </a>
              </span>
              <Meter label="Finds" value={m.finds} />
              <Meter label="Speed" value={m.speed} />
              <span className={cn('mt-0.5 flex items-center gap-1 text-xs', stored.has(m.id) ? 'text-teal-700' : 'text-muted-foreground')}>
                {stored.has(m.id) ? <><Check className="size-3" /> On device</> : <><Download className="size-3" /> {m.sizeMB} MB</>}
                {IS_PHONE && m.sizeMB > 150 && <span className="ml-1 text-amber-700">· heavy</span>}
              </span>
            </Label>
          );
        })}
      </RadioGroup>

      <div className="flex flex-col items-center gap-3">
        {loading ? (
          <div className="flex w-full flex-col gap-2" role="status">
            <div className="h-10 w-full overflow-hidden border bg-card">
              <div
                className="flex h-full items-center bg-accent transition-[width]"
                style={{ width: `${model.fromDevice ? 100 : Math.max(4, Math.round(model.progress))}%` }}
              />
            </div>
            <span className="flex items-center justify-center gap-2 text-sm">
              <Spinner className="text-primary" />
              {model.fromDevice
                ? `Loading ${tier} from this device… ${elapsed}s`
                : model.progress > 0 && model.progress < 100 ? `Downloading ${tier}… ${Math.round(model.progress)}%` : `Preparing ${tier}… ${elapsed}s`}
            </span>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={() => { onDone(); activateModel(); }}>
            {stored.has(selected.id) ? `Activate ${tier}` : `Download & activate ${tier} (${selected.sizeMB} MB)`}
          </Button>
        )}
        {!loading && (
          <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => { onDone(); continueWithoutAI(); }}>
            Continue without AI (patterns only)
          </Button>
        )}
        {model.status === 'error' && <p className="w-full bg-red-50 p-2 text-xs text-destructive">{model.error}</p>}
      </div>
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
