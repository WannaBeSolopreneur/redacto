import { useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { applyToText } from '../core/transform';
import type { Entity } from '../core/types';
import { columnLabel, csvLiteral, type TableCell, type TableSheet } from '../formats/table';
import { docView, outputReplacer, setCellRedacted, setColumnRedacted, setHeaderRow, store, updateDocUi, type DocState } from '../state/app';
import { useSlice } from '../state/store';
import { flash } from './Workspace';

const ROW_H = 32;
const COL_W = 168;
const ROWNUM_W = 64;

/** Active entities overlapping [start, end), by binary search over the sorted list. */
function within(active: Entity[], start: number, end: number): Entity[] {
  let lo = 0, hi = active.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (active[mid].end <= start) lo = mid + 1;
    else hi = mid;
  }
  const out: Entity[] = [];
  for (let i = lo; i < active.length && active[i].start < end; i++) out.push(active[i]);
  return out;
}

/** Row index holding text offset `at` (rows are laid out in offset order; some may be empty). */
function rowAt(sheet: TableSheet, at: number): number {
  let lo = 0, hi = sheet.rows.length - 1, found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const first = sheet.rows[mid][0];
    if (!first) { hi = mid - 1; continue; }
    if (first.start <= at) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** Spreadsheet grid. Only visible rows and columns are rendered, so sheet size doesn't matter. */
export function TableView({ d, output = false }: { d: DocState; output?: boolean }) {
  const settings = useSlice(store, (s) => s.settings);
  const table = d.doc!.table!;
  const { active } = docView(d, settings);
  const si = Math.min(d.ui.sheet, table.sheets.length - 1);
  const sheet = table.sheets[si];
  const headers = d.tableHeaders[si];
  const replacer = useMemo(() => (output ? outputReplacer(active, settings.mode) : null), [output, active, settings.mode]);
  const hiddenRows = useMemo(() => new Set(sheet.hiddenRows), [sheet]);
  const hiddenCols = useMemo(() => new Set(sheet.hiddenColumns), [sheet]);

  const scroller = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({ count: sheet.rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_H, overscan: 10 });
  const cols = useVirtualizer({ horizontal: true, count: sheet.columnCount, getScrollElement: () => scroller.current, estimateSize: () => COL_W, overscan: 3 });

  // Restore the grid position when (re)entering this sheet; save it when leaving.
  const pos = useRef({ top: d.ui.gridTop, left: d.ui.gridLeft });
  useLayoutEffect(() => {
    if (scroller.current) { scroller.current.scrollTop = pos.current.top; scroller.current.scrollLeft = pos.current.left; }
    return () => updateDocUi(d.id, { gridTop: pos.current.top, gridLeft: pos.current.left });
  }, [d.id, si, output]);

  // Jump to a finding picked in the Detections panel.
  useLayoutEffect(() => {
    const at = d.ui.reveal;
    if (at === null) return;
    const ri = rowAt(sheet, at);
    const ci = Math.max(0, sheet.rows[ri]?.findIndex((c) => at >= c.start && at < c.end) ?? 0);
    rows.scrollToIndex(ri, { align: 'center' });
    cols.scrollToIndex(ci, { align: 'center' });
    const t = setTimeout(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-cell="${ri}:${ci}"]`);
      if (el) flash(el);
      updateDocUi(d.id, { reveal: null });
    }, 60);
    return () => clearTimeout(t);
  }, [d.ui.reveal, sheet, d.id, rows, cols]);

  const vRows = rows.getVirtualItems();
  const vCols = cols.getVirtualItems();
  const padLeft = vCols[0]?.start ?? 0;
  const padRight = cols.getTotalSize() - (vCols.at(-1)?.end ?? 0);
  const padTop = vRows[0]?.start ?? 0;
  const padBottom = rows.getTotalSize() - (vRows.at(-1)?.end ?? 0);

  const cellView = (cell: TableCell | undefined) => {
    if (!cell) return { text: '', hit: undefined as Entity | undefined };
    const hits = within(active, cell.start, cell.end);
    if (!output) return { text: cell.value, hit: hits[0] };
    const local = hits.map((e) => ({ ...e, start: Math.max(e.start, cell.start) - cell.start, end: Math.min(e.end, cell.end) - cell.start }));
    const value = applyToText(cell.value, local, replacer!);
    return { text: d.doc!.kind === 'csv' ? csvLiteral(value) : value, hit: hits[0] };
  };

  return (
    <div className="flex h-full min-h-[60vh] flex-col lg:min-h-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-2">
        {(table.sheets.length > 1 || sheet.hidden) && (
          <div role="tablist" aria-label="Worksheets" className="flex flex-wrap gap-1">
            {table.sheets.map((s, i) => (
              <Button
                key={i}
                role="tab"
                aria-selected={si === i}
                size="sm"
                variant={si === i ? 'default' : 'outline'}
                className="h-7"
                onClick={() => {
                  pos.current = { top: 0, left: 0 };
                  updateDocUi(d.id, { sheet: i, gridTop: 0, gridLeft: 0, reveal: null });
                }}
              >
                {s.name}{s.hidden ? ' · hidden in original' : ''}
              </Button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={headers} disabled={output} onCheckedChange={(v) => setHeaderRow(d.id, si, v === true)} />
          First row is a header
        </label>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {sheet.rows.length.toLocaleString()} rows · {sheet.columnCount.toLocaleString()} columns
        </span>
      </div>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {output
          ? d.doc!.kind === 'xlsx' ? `Clean values preview. This sheet will be named Sheet ${si + 1}.` : 'Preview of exported cell values, including formula-safety apostrophes.'
          : 'Click a cell to redact or keep its entire value. Column actions apply to data rows; the first row is still scanned.'}
        {!!(hiddenRows.size || hiddenCols.size) && ' Hidden rows and columns are shown here and included in detection and export.'}
      </p>

      <div
        ref={scroller}
        tabIndex={0}
        aria-label={`${sheet.name} cells`}
        className="min-h-0 flex-1 overflow-auto border-t bg-card"
        onScroll={(e) => { pos.current = { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }; }}
      >
        <table
          className="table-fixed border-separate border-spacing-0 text-[13px]"
          style={{ width: ROWNUM_W + cols.getTotalSize() }}
          aria-rowcount={sheet.rows.length + 1}
          aria-colcount={sheet.columnCount + 1}
        >
          <thead className="sticky top-0 z-20">
            <tr>
              <th scope="col" className="sticky left-0 z-10 border-r border-b bg-muted px-2 text-left text-xs font-medium text-muted-foreground" style={{ width: ROWNUM_W }}>Row</th>
              {padLeft > 0 && <th aria-hidden style={{ width: padLeft }} className="border-b bg-muted" />}
              {vCols.map((c) => {
                const ci = c.index;
                return (
                  <th key={ci} scope="col" aria-colindex={ci + 2} className="border-r border-b bg-muted px-2 py-1 text-left align-top font-normal" style={{ width: COL_W }}>
                    <div className="font-mono text-xs font-medium text-muted-foreground">
                      {columnLabel(ci)}{hiddenCols.has(ci) ? ' · hidden' : ''}
                    </div>
                    {!output && (
                      <div className="flex gap-2 text-[11px]">
                        <button className="text-primary hover:underline" onClick={() => setColumnRedacted(d.id, si, ci, true)} aria-label={`Redact column ${columnLabel(ci)}`}>Redact column</button>
                        <button className="text-muted-foreground hover:underline" onClick={() => setColumnRedacted(d.id, si, ci, false)} aria-label={`Keep column ${columnLabel(ci)}`}>Keep</button>
                      </div>
                    )}
                  </th>
                );
              })}
              {padRight > 0 && <th aria-hidden style={{ width: padRight }} className="border-b bg-muted" />}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden style={{ height: padTop }} />}
            {vRows.map((r) => {
              const ri = r.index;
              const row = sheet.rows[ri];
              const isHeader = headers && ri === 0;
              return (
                <tr key={ri} aria-rowindex={ri + 2} style={{ height: ROW_H }} className={cn(isHeader && 'font-semibold')}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-b bg-muted px-2 text-left font-mono text-xs font-normal text-muted-foreground"
                    title={hiddenRows.has(ri) ? 'Hidden in original workbook' : undefined}
                  >
                    {ri + 1}{hiddenRows.has(ri) ? '*' : ''}
                  </th>
                  {padLeft > 0 && <td aria-hidden className="border-b" />}
                  {vCols.map((c) => {
                    const ci = c.index;
                    const cell = row[ci];
                    const { text, hit } = cellView(cell);
                    const on = !!hit;
                    return (
                      <td key={ci} data-cell={`${ri}:${ci}`} data-type={hit?.type} className={cn('overflow-hidden border-r border-b p-0', isHeader && 'bg-muted/50', on && 'bg-ent-bg')}>
                        {output ? (
                          <span className={cn('block truncate px-2', on && 'font-mono text-xs text-ent')} title={text}>{text || ' '}</span>
                        ) : (
                          <button
                            className="block h-full w-full truncate px-2 text-left hover:shadow-[inset_0_0_0_1.5px_var(--ring)] disabled:cursor-default disabled:hover:shadow-none"
                            disabled={!cell?.value}
                            aria-pressed={on}
                            aria-label={`${columnLabel(ci)}${ri + 1}: ${cell?.value || 'empty'}. ${on ? 'Redacted; click to keep' : 'Click to redact'}`}
                            title={cell?.value || 'Empty cell'}
                            onClick={() => setCellRedacted(d.id, si, ri, ci, !on)}
                          >
                            {text || ' '}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  {padRight > 0 && <td aria-hidden className="border-b" />}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
