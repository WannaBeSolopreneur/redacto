import { useEffect, useState } from 'react';
import { Lock, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getModel } from '../ml/models';
import { clearAll, store } from '../state/app';
import { useSlice } from '../state/store';
import { AccentBar, Logo, Spinner } from './brand';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const count = useSlice(store, (s) => s.docs.length);
  return (
    <header className="shrink-0 bg-card">
      <AccentBar />
      <div className="flex h-14 items-center justify-between gap-3 border-b px-4">
        <a href={import.meta.env.BASE_URL} aria-label="Redacto home" className="rounded-sm hover:opacity-80">
          <Logo />
        </a>
        <div className="flex items-center gap-2">
          {count > 0 && <ClearWorkspace count={count} />}
          <PrivacyBadge />
          <ModelChip onClick={onOpenSettings} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings">
                <Settings />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}

function ClearWorkspace({ count }: { count: number }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Clear workspace</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clear workspace?</DialogTitle>
          <DialogDescription>
            Close {count} document{count === 1 ? '' : 's'} and discard review changes and custom terms. Downloaded files are not deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" autoFocus>Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={clearAll}>Clear all documents</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrivacyBadge() {
  const offline = useSlice(store, (s) => s.offlineReady);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <span className="size-1.5 bg-teal" aria-hidden />
          <span className="hidden sm:inline">{offline ? 'Ready offline' : 'Processed on this device'}</span>
          <Lock className="sm:hidden" aria-label="Processed on this device" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <p className="font-semibold">Your files never leave this device.</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-muted-foreground">
          <li>Reading, OCR, detection and export all run inside this browser tab.</li>
          <li>The AI model is served with the app and runs locally. No uploads, accounts, analytics or cookies.</li>
          <li>The published build blocks connections to any other site.</li>
          <li>Documents and custom terms stay in memory. Only general preferences are remembered.</li>
        </ul>
        <p className={cn('mt-3 border-t pt-3 text-xs', offline ? 'text-teal-700' : 'text-muted-foreground')}>
          {offline
            ? 'Everything is loaded. You can turn off your Wi-Fi and keep working.'
            : 'Still loading parts of the app. Once this says “Ready offline”, you can turn off your Wi-Fi.'}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ModelChip({ onClick }: { onClick: () => void }) {
  const model = useSlice(store, (s) => s.model);
  const selected = useSlice(store, (s) => s.settings.model);
  const elapsed = useElapsed(model.status === 'loading' ? model.startedAt : null);
  const name = getModel(model.activeId ?? selected).name.split(' · ')[0];

  const label = {
    off: 'Rules only',
    idle: 'AI model: not loaded',
    loading: model.fromDevice
      ? `Loading model from this device ${elapsed}s`
      : model.progress > 0 && model.progress < 100 ? `Downloading model ${Math.round(model.progress)}%` : `Preparing model ${elapsed}s`,
    ready: `AI model: ${name}`,
    error: 'Model failed · rules only',
  }[model.status];
  const title =
    model.status === 'ready' && model.info
      ? `${getModel(model.activeId!).name}. Loaded in ${(model.info.loadMs / 1000).toFixed(1)}s, ${model.info.threads} CPU thread${model.info.threads > 1 ? 's' : ''}${model.lastRunMs !== null ? `, last run ${model.lastRunMs} ms` : ''}.`
      : model.error ?? 'Model settings';
  return (
    <Button variant="outline" size="sm" className="hidden gap-2 text-xs md:inline-flex" onClick={onClick} title={title}>
      {model.status === 'loading' ? (
        <Spinner className="size-3" />
      ) : (
        <span aria-hidden className={cn('size-1.5', model.status === 'ready' ? 'bg-primary' : model.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground/50')} />
      )}
      {label}
    </Button>
  );
}

export function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
}
