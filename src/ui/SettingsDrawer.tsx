import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ENTITY_LABELS, ENTITY_TYPES } from '../core/types';
import { MODELS } from '../ml/models';
import { downloadedModels, removeModel } from '../ml/cache';
import { clearAll, ensureModel, resetSettings, retryModel, store, updateSettings } from '../state/app';
import { useSlice } from '../state/store';
import { Spinner } from './brand';
import { useElapsed } from './TopBar';

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useSlice(store, (s) => s.settings);
  const model = useSlice(store, (s) => s.model);
  const docCount = useSlice(store, (s) => s.docs.length);
  const elapsed = useElapsed(model.status === 'loading' ? model.startedAt : null);
  // The slider moves freely; the (whole-document) re-filter runs once, on release.
  const [threshold, setThreshold] = useState(settings.minScore);
  useEffect(() => setThreshold(settings.minScore), [settings.minScore]);
  // Which models are stored on this device, re-read when the drawer opens and when a load finishes.
  const [stored, setStored] = useState<Map<string, number>>(new Map());
  const refreshStored = () => void downloadedModels().then(setStored).catch(() => {});
  useEffect(() => {
    if (open) refreshStored();
  }, [open, model.status, model.activeId]);
  const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
  const total = [...stored.values()].reduce((a, b) => a + b, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Detection and privacy options. Preferences are saved in this browser; documents never are.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          <Section title="AI model">
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="use-ml" className="flex flex-col items-start gap-1">
                Use the local AI model
                <span className="text-xs font-normal text-muted-foreground">
                  Finds names, places, organisations and other context. Without it only patterns (emails, phones, IDs…) are detected.
                </span>
              </Label>
              <Switch id="use-ml" checked={settings.useML} onCheckedChange={(v) => updateSettings({ useML: v })} />
            </div>
            <RadioGroup value={settings.model} onValueChange={(id) => updateSettings({ model: id, modelChosen: true })} disabled={!settings.useML} aria-label="Model" className="gap-2">
              {MODELS.map((m) => (
                <Label
                  key={m.id}
                  htmlFor={m.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent',
                    !settings.useML && 'opacity-50',
                  )}
                >
                  <RadioGroupItem id={m.id} value={m.id} className="mt-0.5" />
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.description}</span>
                    {stored.has(m.id) ? (
                      <span className="mt-1 flex items-center gap-2 text-xs text-teal-700">
                        <span className="size-1.5 bg-teal" aria-hidden /> On this device · {mb(stored.get(m.id)!)}
                        <button
                          type="button"
                          className="ml-auto text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-40"
                          disabled={model.status === 'loading'}
                          aria-label={`Remove ${m.name} from this device`}
                          onClick={(e) => {
                            e.preventDefault(); // don't select the model
                            void removeModel(m.id).then(refreshStored);
                          }}
                        >
                          Remove
                        </button>
                      </span>
                    ) : (
                      <span className="mt-1 text-xs text-muted-foreground">Downloads {m.sizeMB} MB the first time it's used</span>
                    )}
                  </span>
                </Label>
              ))}
            </RadioGroup>
            {settings.useML && (
              <div className="flex flex-col gap-2 text-sm">
                {model.status === 'idle' && (
                  <Button size="sm" variant="outline" className="w-fit" onClick={() => void ensureModel().catch(() => {})}>Load now</Button>
                )}
                {model.status === 'loading' && (
                  <span className="flex items-center gap-2">
                    <Spinner />{' '}
                    {model.fromDevice
                      ? `Loading from this device… ${elapsed}s`
                      : model.progress > 0 && model.progress < 100 ? `Downloading ${Math.round(model.progress)}%` : `Preparing… ${elapsed}s`}
                  </span>
                )}
                {model.status === 'ready' && model.info && (
                  <span className="text-teal-700">
                    Ready in {(model.info.loadMs / 1000).toFixed(1)}s · {model.info.threads} CPU thread{model.info.threads > 1 ? 's' : ''}
                    {model.lastRunMs !== null && ` · last run ${model.lastRunMs} ms`}
                  </span>
                )}
                {model.status === 'error' && (
                  <span className="flex flex-wrap items-center gap-2 text-destructive">
                    {model.error}
                    <Button size="sm" variant="outline" onClick={retryModel}>Retry</Button>
                  </span>
                )}
                {model.notice && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">{model.notice}</p>}
                {model.info && !model.info.isolated && (
                  <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                    Running on one CPU thread because the page isn't cross-origin isolated (COOP/COEP headers missing). See README → Hosting.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {stored.size
                    ? `${stored.size} model${stored.size > 1 ? 's' : ''} on this device · ${mb(total)}. Each model downloads once, then loads from your device.`
                    : 'Each model downloads once from this site, then loads from your device.'}
                </p>
              </div>
            )}
          </Section>

          <Separator />

          <Section title="What to detect">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ENTITY_TYPES.filter((t) => t !== 'CUSTOM').map((t) => (
                <Label key={t} data-type={t} className="flex items-center gap-2 font-normal">
                  <Checkbox checked={settings.enabled[t]} onCheckedChange={(v) => updateSettings({ enabled: { ...settings.enabled, [t]: v === true } })} />
                  <span className="size-2.5 shrink-0 rounded-sm bg-ent" aria-hidden />
                  <span>
                    {ENTITY_LABELS[t]}
                    {t === 'SENSITIVE' && <span className="text-muted-foreground"> (age, gender, religion…)</span>}
                  </span>
                </Label>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-3">
              <span className="text-sm">
                AI confidence threshold <strong className="tabular-nums">{Math.round(threshold * 100)}%</strong>
              </span>
              <Slider
                min={0.3}
                max={0.99}
                step={0.01}
                value={[threshold]}
                onValueChange={([v]) => setThreshold(v)}
                onValueCommit={([v]) => updateSettings({ minScore: v })}
                aria-label="AI confidence threshold"
              />
              <span className="flex justify-between text-xs text-muted-foreground">
                <span>Catch more</span>
                <span>Fewer false alarms</span>
              </span>
            </div>
          </Section>

          <Separator />

          <Section title="Custom terms">
            <TermList id="deny" label="Always redact" placeholder={'One per line, e.g.\nProject Falcon\nAcme internal'} value={settings.denyList} onCommit={(v) => updateSettings({ denyList: v })} />
            <TermList id="allow" label="Never redact" placeholder={'One per line, e.g.\nsupport@yourcompany.com'} value={settings.allowList} onCommit={(v) => updateSettings({ allowList: v })} />
          </Section>

          <Separator />

          <Section title="Scanned documents">
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="force-ocr" className="flex flex-col items-start gap-1">
                OCR every PDF page
                <span className="text-xs font-normal text-muted-foreground">
                  Also reads text inside images on pages that have a text layer. Slower. Applies to files opened after this is changed.
                </span>
              </Label>
              <Switch id="force-ocr" checked={settings.forceOcr} onCheckedChange={(v) => updateSettings({ forceOcr: v })} />
            </div>
          </Section>

          <Separator />

          <Section title="Privacy">
            <p className="text-sm text-muted-foreground">
              Documents and custom terms exist only in this tab's memory. Clear workspace also removes custom terms. Only general preferences are saved in this browser.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!docCount} onClick={clearAll}>Close all documents</Button>
              <Button size="sm" variant="outline" onClick={resetSettings}>Reset settings</Button>
            </div>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** A newline-separated term list that commits on blur or after a pause, not on every keystroke. */
function TermList({ id, label, placeholder, value, onCommit }: { id: string; label: string; placeholder: string; value: string[]; onCommit: (v: string[]) => void }) {
  const [text, setText] = useState(value.join('\n'));
  const joined = value.join('\n');
  const dirty = lines(text).join('\n') !== joined;
  // Follow outside changes (e.g. reset), but don't eat a trailing newline the user just typed.
  useEffect(() => {
    setText((t) => (lines(t).join('\n') === joined ? t : joined));
  }, [joined]);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => commit.current(lines(text)), 600);
    return () => clearTimeout(t);
  }, [text, dirty]);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => dirty && onCommit(lines(text))} />
    </div>
  );
}
