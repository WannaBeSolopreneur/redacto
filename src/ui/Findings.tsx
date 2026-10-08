import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Download, KeyRound, Redo2, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ENTITY_LABELS, type Entity, type EntityType, type Mode } from '../core/types';
import {
  acknowledgeExport,
  awaitingModel,
  canExport,
  docView,
  downloadDoc,
  downloadKey,
  entityKey,
  redoReview,
  resetReview,
  revealEntity,
  setValues,
  store,
  undoReview,
  updateSettings,
  type DocState,
} from '../state/app';
import { useSlice } from '../state/store';
import { Spinner } from './brand';
import { sparkle } from './sparkle';

const MODES: Array<{ id: Mode; label: string; example: string }> = [
  { id: 'label', label: 'Labels', example: '[PERSON_1]' },
  { id: 'pseudonymize', label: 'Fake data', example: 'Alex Morgan' },
  { id: 'redact', label: 'Redacted', example: '[REDACTED]' },
];

interface Value {
  key: string;
  text: string;
  count: number;
  off: number;
  first: Entity;
}

interface Group {
  type: EntityType;
  values: Value[];
  count: number;
  off: number;
}

function groupEntities(entities: Entity[], isOff: (e: Entity) => boolean): Group[] {
  const byType = new Map<EntityType, Map<string, Value>>();
  for (const e of entities) {
    let values = byType.get(e.type);
    if (!values) byType.set(e.type, (values = new Map()));
    const k = entityKey(e);
    let v = values.get(k);
    if (!v) values.set(k, (v = { key: k, text: e.text.replace(/\s+/g, ' ').trim(), count: 0, off: 0, first: e }));
    v.count++;
    if (isOff(e)) v.off++;
  }
  return [...byType]
    .map(([type, values]) => {
      const list = [...values.values()].sort((a, b) => b.count - a.count || a.first.start - b.first.start);
      return { type, values: list, count: list.reduce((s, v) => s + v.count, 0), off: list.reduce((s, v) => s + v.off, 0) };
    })
    .sort((a, b) => b.count - a.count);
}

type Row = { kind: 'group'; g: Group; open: boolean } | { kind: 'value'; g: Group; v: Value } | { kind: 'areas'; n: number };

/** Tri-state for a set: all on, some on, none. */
const checkState = (off: number, count: number) => (off === 0 ? true : off < count ? 'indeterminate' : false);

export function Findings({ d }: { d: DocState }) {
  const settings = useSlice(store, (s) => s.settings);
  const modelActive = useSlice(store, (s) => s.model.activated);
  const view = docView(d, settings);
  const groups = useMemo(() => groupEntities(view.entities, view.isOff), [view]);
  // Collapsed state per type; large groups start collapsed.
  const [toggled, setToggled] = useState<ReadonlySet<EntityType>>(new Set());
  const isOpen = (g: Group) => (g.values.length <= 12) !== toggled.has(g.type);
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const g of groups) {
      const open = (g.values.length <= 12) !== toggled.has(g.type);
      out.push({ kind: 'group', g, open });
      if (open) for (const v of g.values) out.push({ kind: 'value', g, v });
    }
    if (d.areas.length) out.push({ kind: 'areas', n: d.areas.length });
    return out;
  }, [groups, toggled, d.areas.length]);

  const scroller = useRef<HTMLDivElement>(null);
  const list = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (rows[i].kind === 'value' ? 32 : 40),
    overscan: 12,
  });

  const redacted = view.active.length + d.areas.length;
  const kept = view.entities.length - view.active.length;
  const visual = !!d.doc?.visual;
  const touched = d.excluded.size > 0 || d.excludedValues.size > 0 || d.manual.length > 0 || d.areas.length > 0 || d.cellChoices.size > 0;
  const toggle = (type: EntityType) =>
    setToggled((t) => {
      const n = new Set(t);
      if (!n.delete(type)) n.add(type);
      return n;
    });

  return (
    <aside aria-label="Findings" className="flex min-h-0 flex-col border-t bg-card lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Detections</h2>
        <div className="flex items-center gap-0.5">
          <IconAction label="Undo review change" disabled={!d.undo.length} onClick={() => undoReview(d.id)}><Undo2 /></IconAction>
          <IconAction label="Redo review change" disabled={!d.redo.length} onClick={() => redoReview(d.id)}><Redo2 /></IconAction>
          {touched && <IconAction label="Reset changes" onClick={() => resetReview(d.id)}><RotateCcw /></IconAction>}
        </div>
      </div>

      {d.phase === 'ready' && (
        <div className="mx-4 mb-2 flex items-baseline gap-2 border-b pb-3">
          <span className="text-3xl font-bold tracking-tight tabular-nums">{redacted.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">
            {redacted === 1 ? 'item' : 'items'} will be {visual ? 'blacked out' : 'replaced'}
            {kept > 0 && ` · ${kept.toLocaleString()} kept`}
          </span>
        </div>
      )}
      {d.phase === 'ready' && awaitingModel(d) && (
        <p className="mx-4 mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          {modelActive ? <><Spinner className="size-3" /> More may appear when the AI model finishes.</> : 'Names appear once the AI model is activated.'}
        </p>
      )}
      {d.phase === 'ready' && groups.length === 0 && !awaitingModel(d) && (
        <p className="mx-4 text-sm text-muted-foreground">Nothing detected. Select text in the document to redact it by hand.</p>
      )}

      <div ref={scroller} className="max-h-96 min-h-0 flex-1 overflow-y-auto px-2 lg:max-h-none">
        <div className="relative w-full" style={{ height: list.getTotalSize() }}>
          {list.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div key={item.key} className="absolute inset-x-0" style={{ top: item.start, height: item.size }}>
                {row.kind === 'group' ? (
                  <GroupRow g={row.g} open={isOpen(row.g)} docId={d.id} onToggle={() => toggle(row.g.type)} />
                ) : row.kind === 'value' ? (
                  <ValueRow v={row.v} type={row.g.type} docId={d.id} />
                ) : (
                  <div className="flex h-full items-center gap-2.5 px-2 text-sm">
                    <span className="size-2.5 rounded-sm bg-foreground" aria-hidden />
                    <span className="flex-1 font-medium">Drawn areas</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{row.n}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ExportFooter d={d} visual={visual} hasMapping={view.active.length > 0} mode={settings.mode} />
    </aside>
  );
}

function IconAction({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" disabled={disabled} onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function GroupRow({ g, open, docId, onToggle }: { g: Group; open: boolean; docId: string; onToggle: () => void }) {
  const on = g.count - g.off;
  return (
    <div data-type={g.type} className="flex h-full items-center gap-2.5 rounded-md px-2 hover:bg-muted">
      <Checkbox
        checked={checkState(g.off, g.count)}
        onCheckedChange={() => setValues(docId, g.values.map((v) => v.key), g.off > 0)}
        aria-label={`Redact all ${ENTITY_LABELS[g.type]}`}
      />
      <button onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium">
        <span className="size-2.5 shrink-0 rounded-sm bg-ent" aria-hidden />
        <span className="flex-1 truncate">{ENTITY_LABELS[g.type]}</span>
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {on.toLocaleString()}
          {g.off ? `/${g.count.toLocaleString()}` : ''}
        </span>
        <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>
    </div>
  );
}

function ValueRow({ v, type, docId }: { v: Value; type: EntityType; docId: string }) {
  const allOff = v.off === v.count;
  return (
    <div data-type={type} className="flex h-full items-center gap-2.5 rounded-md pr-2 pl-6 hover:bg-muted">
      <Checkbox checked={checkState(v.off, v.count)} onCheckedChange={() => setValues(docId, [v.key], v.off > 0)} aria-label={`Redact ${v.text}`} />
      <button
        onClick={() => revealEntity(docId, v.first.start)}
        title="Show in document"
        className={cn('flex min-w-0 flex-1 items-center gap-2 text-left text-sm', allOff && 'text-muted-foreground line-through')}
      >
        <span className="truncate border-b-2 border-ent/40">{v.text}</span>
        {v.count > 1 && <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">×{v.count.toLocaleString()}</span>}
      </button>
    </div>
  );
}

const STEPS = ['Detect', 'Review', 'Download'];

function ExportFooter({ d, visual, hasMapping, mode }: { d: DocState; visual: boolean; hasMapping: boolean; mode: Mode }) {
  const ext = d.doc?.table?.csv?.delimiter === '\t' ? 'tsv' : d.name.split('.').pop()?.toLowerCase();
  const outExt = d.doc?.kind === 'xlsx' ? 'XLSX' : d.doc?.kind === 'image' ? 'PNG' : d.doc?.kind === 'pdf' ? 'PDF' : d.doc?.kind === 'docx' ? 'DOCX' : d.doc?.kind === 'csv' ? (ext === 'tsv' ? 'TSV' : 'CSV') : 'TXT';
  const step = d.phase !== 'ready' || awaitingModel(d) ? 0 : canExport(d) ? 2 : 1;
  const activated = useSlice(store, (s) => s.model.activated);

  let label: React.ReactNode = <><Download /> Download redacted {outExt}</>;
  if (d.phase === 'reading') label = 'Reading file…';
  else if (d.phase === 'error') label = 'Nothing to download';
  else if (d.exporting) label = <><Spinner /> {d.exporting.msg}</>;
  else if (awaitingModel(d) && !activated) label = 'Activate the AI model first';
  else if (awaitingModel(d)) label = <><Spinner /> Finding names…</>;

  const button = useRef<HTMLButtonElement>(null);
  const download = async () => {
    if (!(await downloadDoc(d.id))) return;
    sparkle(button.current, 10);
    toast.success('Ready to share with AI', { description: 'Saved to your downloads. Nothing left this device.', icon: <Sparkles className="size-4 text-gold" /> });
  };

  return (
    <div className="flex flex-col gap-3 border-t p-4">
      <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={cn('flex flex-col gap-1.5 text-xs', i <= step ? 'text-foreground' : 'text-muted-foreground', i === step && 'font-semibold')}>
            <span><span className={cn('mr-1.5 font-mono', i <= step ? 'text-primary' : '')}>0{i + 1}</span>{s}</span>
            <span className={cn('h-0.5 rounded-full', i <= step ? 'bg-primary' : 'bg-border')} />
          </li>
        ))}
      </ol>

      {!visual ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Replace with</span>
          <div role="radiogroup" aria-label="Replace with" className="grid grid-cols-3 rounded-lg bg-muted p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => updateSettings({ mode: m.id })}
                title={`e.g. ${m.example}`}
                className={cn('rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors', mode === m.id && 'bg-card text-foreground shadow-sm')}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            e.g. Maria Gonzalez → <span className="font-mono text-foreground">{MODES.find((m) => m.id === mode)!.example}</span>
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Black boxes are burned into the pages. The exported file contains no hidden text, metadata or annotations.</p>
      )}

      {(d.doc?.kind === 'xlsx' || d.mlState === 'failed') && (
        <label className="flex items-start gap-2 text-xs leading-snug">
          <Checkbox className="mt-0.5" checked={d.exportAcknowledged} onCheckedChange={(v) => acknowledgeExport(d.id, v === true)} />
          <span>
            {d.doc?.kind === 'xlsx'
              ? 'I reviewed the values. Export a clean workbook without formulas, original formatting or embedded content.'
              : 'I reviewed the document knowing the AI scan failed.'}
            {d.doc?.kind === 'xlsx' && d.mlState === 'failed' ? ' The AI scan also failed; names may be missed.' : ''}
          </span>
        </label>
      )}

      <Button ref={button} size="lg" className="w-full" disabled={!canExport(d)} onClick={() => void download()}>
        {label}
      </Button>
      {!visual && mode !== 'redact' && hasMapping && canExport(d) && (
        <Button variant="link" size="sm" className="h-auto self-center p-0 text-xs" onClick={() => downloadKey(d.id)} title="Original → replacement table. Store it separately and securely.">
          <KeyRound /> Download re-identification key
        </Button>
      )}
    </div>
  );
}
