import { useLayoutEffect, useRef } from 'react';
import { Download, Plus, TriangleAlert, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { awaitingModel, canExport, docView, downloadAll, removeDoc, retryModel, selectDoc, store, updateDocUi, type DocState } from '../state/app';
import { useSlice } from '../state/store';
import { KindIcon, Spinner } from './brand';
import { Findings } from './Findings';
import { OutputView } from './OutputView';
import { PagesView } from './PagesView';
import { TableView } from './TableView';
import { TextView } from './TextView';
import { FilePicker } from './Welcome';

export function Workspace() {
  const docs = useSlice(store, (s) => s.docs);
  const selectedId = useSlice(store, (s) => s.selectedId);
  const doc = docs.find((d) => d.id === selectedId) ?? docs[0];

  return (
    <main className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 overflow-y-auto lg:auto-rows-[minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)_20rem] lg:overflow-hidden">
      <DocList docs={docs} selectedId={doc?.id} />
      {/* Sibling keys must differ: a shared key makes React leave stale panes behind on switching. */}
      {doc && <DocPane key={`pane:${doc.id}`} d={doc} />}
      {doc && <Findings key={`findings:${doc.id}`} d={doc} />}
    </main>
  );
}

function DocList({ docs, selectedId }: { docs: DocState[]; selectedId?: string }) {
  const settings = useSlice(store, (s) => s.settings);
  const exportable = docs.filter(canExport).length;
  const pending = docs.some((d) => d.phase === 'reading' || awaitingModel(d));
  return (
    <nav aria-label="Documents" className="flex min-h-0 flex-col border-b bg-card lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        <span>Files</span>
        <span className="tabular-nums">{docs.length}</span>
      </div>
      <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto px-2 lg:max-h-none lg:flex-1">
        {docs.map((d) => {
          const on = d.id === selectedId;
          return (
            <li key={d.id} className="group relative">
              <button
                onClick={() => selectDoc(d.id)}
                aria-current={on}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 pr-8 text-left transition-colors hover:bg-muted',
                  on && 'bg-accent hover:bg-accent',
                )}
              >
                <KindIcon kind={d.doc?.kind ?? kindFromName(d.name)} className={cn('mt-0.5 text-muted-foreground', on && 'text-primary', d.phase === 'error' && 'text-destructive')} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium" title={d.name}>{d.name}</span>
                  <DocStatus d={d} count={docView(d, settings).active.length} />
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDoc(d.id)}
                aria-label={`Close ${d.name}`}
                title="Close"
                className="absolute top-1.5 right-1 size-7 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X />
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 border-t p-3">
        <FilePicker variant="outline" className="w-full">
          <Plus /> Add files
        </FilePicker>
        {docs.length > 1 && (
          <Button className="w-full" disabled={!exportable || pending} onClick={() => void downloadAll()} title={pending ? 'Wait until every file has been analysed' : undefined}>
            <Download /> Download all ({exportable})
          </Button>
        )}
      </div>
    </nav>
  );
}

function kindFromName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext ?? '')) return 'image';
  return 'text';
}

function DocStatus({ d, count }: { d: DocState; count: number }) {
  const busy = (msg: string) => (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Spinner className="size-3" /> <span className="truncate">{msg}</span>
    </span>
  );
  if (d.phase === 'reading') return busy(d.progress?.msg ?? 'Reading…');
  if (d.phase === 'error') return <span className="text-xs text-destructive">Couldn't open</span>;
  if (d.exporting) return busy('Exporting…');
  if (awaitingModel(d)) return busy(d.mlProgress ? `Scanning ${d.mlProgress.completedValues.toLocaleString()} / ${d.mlProgress.uniqueValues.toLocaleString()}` : 'Finding names…');
  return (
    <span className={cn('text-xs text-muted-foreground', d.mlState === 'failed' && 'text-amber-700')}>
      {count === 0 ? 'Nothing found' : `${count.toLocaleString()} to redact`}
      {d.mlState === 'failed' && ' · rules only'}
    </span>
  );
}

type Tab = 'review' | 'output' | 'pages';

function DocPane({ d }: { d: DocState }) {
  const visual = !!d.doc?.visual;
  // Chosen lazily: while the file is still being read we don't know if it's visual yet.
  const tab = d.ui.tab ?? (visual ? 'pages' : 'review');
  const body = useRef<HTMLDivElement>(null);
  // Scroll position lives in a ref and is saved when leaving the view. Writing it to the
  // store on every scroll event re-rendered the whole workspace while scrolling.
  const pos = useRef({ top: d.ui.scrollTop, left: d.ui.scrollLeft });
  const setTab = (next: Tab) => {
    pos.current = { top: 0, left: 0 };
    updateDocUi(d.id, { tab: next, scrollTop: 0, scrollLeft: 0, reveal: null });
  };
  useLayoutEffect(() => {
    if (body.current) {
      body.current.scrollTop = pos.current.top;
      body.current.scrollLeft = pos.current.left;
    }
    return () => updateDocUi(d.id, { scrollTop: pos.current.top, scrollLeft: pos.current.left });
  }, [d.id, tab]);
  useLayoutEffect(() => {
    const start = d.ui.reveal;
    if (start === null || !body.current || d.doc?.table) return; // tables reveal inside TableView
    const el = body.current.querySelector<HTMLElement>(`[data-ent="${start}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      flash(el);
      updateDocUi(d.id, { reveal: null });
    }
  }, [d.id, d.ui.reveal, tab, d.doc?.table]);

  if (d.phase === 'reading' || d.phase === 'error' || !d.doc) {
    const f = d.progress?.fraction;
    return (
      <section className="grid min-h-80 place-items-center bg-muted/40 p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center shadow-sm">
          {d.phase === 'error' ? (
            <>
              <TriangleAlert className="size-6 text-destructive" />
              <h2 className="font-semibold">Couldn't open {d.name}</h2>
              <p className="text-sm text-muted-foreground">{d.error}</p>
              <Button variant="outline" onClick={() => removeDoc(d.id)}>Close</Button>
            </>
          ) : (
            <>
              <Spinner className="size-6 text-primary" />
              <strong>{d.progress?.msg ?? 'Reading…'}</strong>
              <h2 className="text-sm font-normal text-muted-foreground">{d.name}</h2>
              {f !== undefined && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(f * 100)}%` }} />
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );
  }

  const tabs: Array<[Tab, string, string]> = visual
    ? [
        ['pages', 'Redacted pages', "The pages as they'll be downloaded. Click a box to keep that text, or drag to black out anything else."],
        ['review', 'Extracted text', 'The text read from the pages. Select words to redact them everywhere.'],
      ]
    : [
        ['review', 'Review', 'Everything found, highlighted. Click a highlight to keep it, or select text to add it.'],
        ['output', 'Redacted result', 'Exactly what the downloaded file will contain.'],
      ];
  const notes = d.doc.notes.filter(Boolean);

  return (
    <section className="flex min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <KindIcon kind={d.doc.kind} className="text-primary" />
          <div className="min-w-0">
            <h2 className="truncate font-mono text-sm font-medium" title={d.name}>{d.name}</h2>
            <p className="text-xs text-muted-foreground">
              {d.doc.kind.toUpperCase()}
              {d.doc.pages ? ` · ${d.doc.pages.length} page${d.doc.pages.length > 1 ? 's' : ''}` : ''} · {formatSize(d.size)}
            </p>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {tabs.map(([id, label, help]) => (
              <Tooltip key={id}>
                {/* Wrapped: the tooltip trigger sets its own data-state, which would hide the active-tab style. */}
                <TooltipTrigger asChild>
                  <span className="flex h-full">
                    <TabsTrigger value={id}>{label}</TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{help}</TooltipContent>
              </Tooltip>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 empty:hidden">
        <ModelBanner d={d} />
        {d.doc.kind === 'xlsx' && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Values-only Excel export</AlertTitle>
            <AlertDescription>
              Formulas, original formatting and embedded content are removed. Hidden cells are included.
              {d.doc.notes.filter((n) => /^\d+ formula/.test(n)).map((n) => <span key={n}> {n}</span>)}
            </AlertDescription>
          </Alert>
        )}
        {notes.length > 0 && (
          <Collapsible className="rounded-md border bg-card text-sm">
            <CollapsibleTrigger className="w-full px-3 py-2 text-left text-muted-foreground hover:text-foreground">
              About this file ({notes.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="list-disc space-y-1 px-3 pb-3 pl-7 text-muted-foreground">
                {notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <div
        ref={body}
        className="min-h-[60vh] flex-1 overflow-auto lg:min-h-0"
        onScroll={(e) => { pos.current = { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }; }}
      >
        {tab === 'pages' && <PagesView d={d} />}
        {tab === 'review' && (d.doc.table ? <TableView d={d} /> : <TextView d={d} />)}
        {tab === 'output' && (d.doc.table ? <TableView d={d} output /> : <OutputView d={d} />)}
      </div>
    </section>
  );
}

/** Briefly ring an element the user jumped to. */
export function flash(el: HTMLElement) {
  el.animate?.(
    [{ boxShadow: '0 0 0 4px var(--gold)' }, { boxShadow: '0 0 0 4px transparent' }],
    { duration: 1400, easing: 'ease-out' },
  );
}

function ModelBanner({ d }: { d: DocState }) {
  if (awaitingModel(d))
    return (
      <Alert className="border-primary/20 bg-accent">
        <Spinner className="text-primary" />
        <AlertTitle>Finding names and other context with the AI model…</AlertTitle>
        <AlertDescription>
          <span>
            Pattern matches (emails, phones, IDs) are shown meanwhile. Download unlocks when it's done.
            {d.mlProgress && (
              <>
                {' '}Checked {d.mlProgress.completedValues.toLocaleString()} of {d.mlProgress.uniqueValues.toLocaleString()} distinct values.
                {d.mlProgress.reusedCells > 0 && ` Reusing results for ${d.mlProgress.reusedCells.toLocaleString()} repeated cells.`}
                {d.mlProgress.ruleCoveredCells > 0 && ` ${d.mlProgress.ruleCoveredCells.toLocaleString()} cells already identified by rules.`}
              </>
            )}
          </span>
        </AlertDescription>
      </Alert>
    );
  if (d.mlState === 'failed')
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>The AI model didn't run, so names may be missed.</AlertTitle>
        <AlertDescription>
          <span>Only pattern-based detection was applied. {d.mlError}</span>
          <Button size="sm" variant="outline" className="mt-1" onClick={retryModel}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  return null;
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
