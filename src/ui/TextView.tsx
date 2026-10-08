import { useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ENTITY_LABELS, type Entity } from '../core/types';
import { addManual, docView, store, toggleOccurrence, type DocState } from '../state/app';
import { useSlice } from '../state/store';

interface Segment {
  start: number;
  end: number;
  entity?: Entity;
}

/** About this many characters per block; blocks off-screen skip layout (content-visibility). */
const BLOCK_CHARS = 3000;

/** Plain/entity segments, grouped into blocks that never split an entity. */
function buildBlocks(text: string, entities: Entity[]): Segment[][] {
  const segs: Segment[] = [];
  let pos = 0;
  for (const e of entities) {
    if (e.start > pos) segs.push({ start: pos, end: e.start });
    segs.push({ start: e.start, end: e.end, entity: e });
    pos = e.end;
  }
  if (pos < text.length) segs.push({ start: pos, end: text.length });

  const blocks: Segment[][] = [];
  let cur: Segment[] = [];
  let size = 0;
  for (const s of segs) {
    if (s.entity || s.end - s.start <= BLOCK_CHARS) {
      cur.push(s);
      size += s.end - s.start;
    } else {
      // Split long plain runs at line breaks so blocks stay small.
      let a = s.start;
      while (a < s.end) {
        let b = Math.min(s.end, a + BLOCK_CHARS - size);
        if (b < s.end) {
          const nl = text.lastIndexOf('\n', b);
          if (nl > a) b = nl + 1;
        }
        cur.push({ start: a, end: b });
        size += b - a;
        a = b;
        if (size >= BLOCK_CHARS) {
          blocks.push(cur);
          cur = [];
          size = 0;
        }
      }
    }
    if (size >= BLOCK_CHARS) {
      blocks.push(cur);
      cur = [];
      size = 0;
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** Offset of a DOM point within the full text, using data-start on segment elements. */
function offsetOf(node: Node, offset: number): number | null {
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest('[data-start]');
  if (!el) return null;
  return Number(el.getAttribute('data-start')) + (node.nodeType === Node.TEXT_NODE ? offset : 0);
}

const SOURCE: Record<Entity['source'], string> = { ml: 'AI model', rule: 'pattern', manual: 'added by you' };

export function TextView({ d }: { d: DocState }) {
  const settings = useSlice(store, (s) => s.settings);
  const view = docView(d, settings);
  const text = d.doc!.text;
  const blocks = useMemo(() => buildBlocks(text, view.entities), [text, view.entities]);
  const ref = useRef<HTMLDivElement>(null);

  const onSelect = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current?.contains(sel.anchorNode) || !ref.current.contains(sel.focusNode)) return;
    const a = offsetOf(sel.anchorNode!, sel.anchorOffset);
    const b = offsetOf(sel.focusNode!, sel.focusOffset);
    if (a === null || b === null) return;
    let start = Math.min(a, b);
    let end = Math.max(a, b);
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end - start < 1 || end - start > 500) return;
    addManual(d.id, start, end);
    sel.removeAllRanges();
  };

  if (!text.trim()) {
    return (
      <div className="m-6 flex flex-col items-center gap-1 rounded-xl border border-dashed p-10 text-center">
        <strong>No text was found in this file.</strong>
        <span className="text-sm text-muted-foreground">
          {d.doc!.visual ? 'You can still black out areas by dragging on the page.' : 'There is nothing to redact.'}
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <p className="mb-3 text-xs text-muted-foreground">Click a highlight to keep it. Select any text to redact it everywhere it appears.</p>
      <div
        ref={ref}
        onMouseUp={onSelect}
        onTouchEnd={() => setTimeout(onSelect, 0)}
        className="rounded-xl border bg-card px-6 py-5 font-mono text-[13px] leading-7 whitespace-pre-wrap shadow-sm [overflow-wrap:anywhere]"
      >
        {blocks.map((block) => (
          // Off-screen blocks skip layout and paint, so long documents stay fast.
          <div key={block[0].start} className="[contain-intrinsic-size:auto_600px] [content-visibility:auto]">
            {block.map((s) => {
              const t = text.slice(s.start, s.end);
              if (!s.entity) return <span key={s.start} data-start={s.start}>{t}</span>;
              const e = s.entity;
              const off = view.isOff(e);
              return (
                <mark
                  key={s.start}
                  data-start={s.start}
                  data-ent={s.start}
                  data-type={e.type}
                  className={cn(
                    'cursor-pointer rounded-sm px-0.5 text-inherit box-decoration-clone',
                    off ? 'bg-transparent text-muted-foreground line-through decoration-ent/60 outline-1 outline-ent/40 outline-dashed' : 'bg-ent-bg shadow-[inset_0_-2px_0_var(--ent)]',
                    e.source === 'manual' && !off && 'shadow-[inset_0_0_0_1.5px_var(--ent)]',
                  )}
                  title={`${ENTITY_LABELS[e.type]} · ${SOURCE[e.source]}${e.source === 'ml' ? ` ${Math.round(e.score * 100)}%` : ''}\n${e.source === 'manual' ? 'Click to remove' : off ? 'Kept. Click to redact' : 'Click to keep this one'}`}
                  onClick={() => toggleOccurrence(d.id, e)}
                >
                  {t}
                </mark>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
