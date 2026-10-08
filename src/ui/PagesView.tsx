import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ENTITY_LABELS } from '../core/types';
import type { Area, PageImage } from '../formats/types';
import type { CharBox } from '../formats/visual';
import { addArea, docView, removeArea, store, toggleOccurrence, type DocState } from '../state/app';
import { useSlice } from '../state/store';

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const BOX = 'absolute cursor-pointer rounded-[1px] p-0';

/** Page images with live black boxes. Click a box to keep that text; drag on the page to black out an area. */
export function PagesView({ d }: { d: DocState }) {
  const settings = useSlice(store, (s) => s.settings);
  const view = docView(d, settings);
  const doc = d.doc!;
  const placed = useMemo(
    () => view.entities.map((e) => ({ e, rects: doc.boxes?.(e) ?? new Map<number, CharBox[]>() })),
    [view.entities, doc],
  );

  return (
    <div className="min-h-full bg-muted/60 px-4 py-5">
      <p className="mx-auto mb-3 max-w-3xl text-xs text-muted-foreground">Click a black box to keep that text. Drag on a page to black out anything else, like signatures or photos.</p>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {doc.pages?.map((p, i) => (
          <Page key={p.url} page={p} n={i + 1} onDraw={(a) => addArea(d.id, a)}>
            {placed.flatMap(({ e, rects }) =>
              (rects.get(i + 1) ?? []).map((r, j) => {
                const off = view.isOff(e);
                return (
                  <button
                    key={`${e.start}-${j}`}
                    data-ent={j === 0 ? e.start : undefined}
                    data-type={e.type}
                    className={cn(BOX, off ? 'border-2 border-dashed border-ent bg-ent-bg/25 hover:bg-ent-bg/50' : 'bg-foreground ring-ent ring-offset-1 hover:ring-2')}
                    style={{ left: pct(r.x / p.width), top: pct(r.y / p.height), width: pct(r.w / p.width), height: pct(r.h / p.height) }}
                    title={`${ENTITY_LABELS[e.type]}: ${e.text}\n${off ? 'Kept. Click to redact' : 'Click to keep'}`}
                    aria-label={`${off ? 'Kept' : 'Redacted'} ${ENTITY_LABELS[e.type]}: ${e.text}`}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={() => toggleOccurrence(d.id, e)}
                  />
                );
              }),
            )}
            {d.areas.map((a, idx) =>
              a.page === i + 1 ? (
                <button
                  key={`area-${idx}`}
                  className={cn(BOX, 'bg-foreground ring-primary ring-offset-1 hover:ring-2')}
                  style={{ left: pct(a.x / p.width), top: pct(a.y / p.height), width: pct(a.w / p.width), height: pct(a.h / p.height) }}
                  title="Drawn by you. Click to remove"
                  aria-label="Remove drawn area"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => removeArea(d.id, idx)}
                />
              ) : null,
            )}
          </Page>
        ))}
      </div>
    </div>
  );
}

function Page({ page, n, onDraw, children }: { page: PageImage; n: number; onDraw: (a: Area) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  /** Pointer position in page-image pixels. */
  const at = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(page.width, Math.max(0, ((ev.clientX - r.left) / r.width) * page.width)),
      y: Math.min(page.height, Math.max(0, ((ev.clientY - r.top) / r.height) * page.height)),
    };
  };

  const rect = drag && {
    x: Math.min(drag.x0, drag.x1),
    y: Math.min(drag.y0, drag.y1),
    w: Math.abs(drag.x1 - drag.x0),
    h: Math.abs(drag.y1 - drag.y0),
  };

  return (
    <figure className="flex flex-col items-center gap-1.5">
      <div
        ref={ref}
        className="relative w-full cursor-crosshair touch-none overflow-hidden rounded-sm bg-white shadow-md ring-1 ring-black/5 select-none"
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
        onPointerDown={(ev) => {
          if (ev.button !== 0) return;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          const p = at(ev);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={(ev) => {
          if (!drag) return;
          const p = at(ev);
          setDrag({ ...drag, x1: p.x, y1: p.y });
        }}
        onPointerUp={() => {
          // Ignore clicks and tiny accidental drags (relative to page size).
          if (rect && rect.w > page.width / 150 && rect.h > page.height / 300) onDraw({ page: n, ...rect });
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <img src={page.url} alt={`Page ${n}`} draggable={false} className="block size-full" />
        {children}
        {rect && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/15"
            style={{ left: pct(rect.x / page.width), top: pct(rect.y / page.height), width: pct(rect.w / page.width), height: pct(rect.h / page.height) }}
          />
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">Page {n}</figcaption>
    </figure>
  );
}
