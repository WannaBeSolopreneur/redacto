import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { downloadedModels, removeModel } from '../ml/cache';
import { IS_PHONE, MODELS, modelCard } from '../ml/models';
import { store, updateSettings } from '../state/app';
import { useSlice } from '../state/store';

const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

/** Which models are stored on this device; re-read whenever a model finishes loading. */
export function useStoredModels(enabled = true) {
  const model = useSlice(store, (s) => s.model);
  const [stored, setStored] = useState<Map<string, number>>(new Map());
  const refresh = () => void downloadedModels().then(setStored).catch(() => {});
  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, model.status, model.activeId]);
  return { stored, refresh, total: [...stored.values()].reduce((a, b) => a + b, 0) };
}

/** The model list: pick one, see whether it's already on this device, remove stored ones. */
export function ModelPicker({ stored, refresh, disabled }: { stored: Map<string, number>; refresh: () => void; disabled?: boolean }) {
  const settings = useSlice(store, (s) => s.settings);
  const loading = useSlice(store, (s) => s.model.status === 'loading');
  return (
    <RadioGroup
      value={settings.model}
      onValueChange={(id) => updateSettings({ model: id, modelChosen: true })}
      disabled={disabled || loading}
      aria-label="AI model"
      className="gap-2"
    >
      {MODELS.map((m) => (
        <Label
          key={m.id}
          htmlFor={m.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border bg-card p-3 font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent',
            (disabled || loading) && 'opacity-60',
          )}
        >
          <RadioGroupItem id={m.id} value={m.id} className="mt-0.5" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold">{m.name.split(' · ')[0]}</span>
              <span className="text-xs text-muted-foreground">{m.name.split(' · ')[1]}</span>
              {IS_PHONE && m.sizeMB > 150 && (
                <span className="border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">Heavy for phones</span>
              )}
              <a
                href={modelCard(m)}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                aria-label={`${m.name} model card on Hugging Face`}
                onClick={(e) => e.stopPropagation()}
              >
                Model card <ArrowUpRight className="size-3" />
              </a>
            </span>
            <span className="text-xs text-muted-foreground">{m.description}</span>
            {stored.has(m.id) ? (
              <span className="mt-1 flex items-center gap-2 text-xs text-teal-700">
                <span className="size-1.5 bg-teal" aria-hidden /> On this device · {mb(stored.get(m.id)!)}
                <button
                  type="button"
                  className="ml-auto text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-40"
                  disabled={loading}
                  aria-label={`Remove ${m.name} from this device`}
                  onClick={(e) => {
                    e.preventDefault(); // don't select the model
                    void removeModel(m.id).then(refresh);
                  }}
                >
                  Remove
                </button>
              </span>
            ) : (
              <span className="mt-1 text-xs text-muted-foreground">{m.sizeMB} MB download, once</span>
            )}
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

export { mb };
