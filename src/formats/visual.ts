import type { Entity } from '../core/types';

/** A character's box in canvas pixels on a given page. */
export interface CharBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Builds a text string alongside a parallel array of per-character boxes, so
 * entity offsets found in the text can be mapped back to page regions.
 */
export class TextMap {
  text = '';
  boxes: (CharBox | null)[] = [];

  /**
   * Append a run of text across a box. `weights` are relative character widths
   * (proportional fonts); without them the run is spread evenly.
   */
  addRun(str: string, box: CharBox, weights?: number[]) {
    const total = weights ? weights.reduce((a, b) => a + b, 0) : str.length;
    let x = box.x;
    for (let i = 0; i < str.length; i++) {
      const w = total ? (box.w * (weights ? weights[i] : 1)) / total : 0;
      this.boxes.push({ page: box.page, x, y: box.y, w, h: box.h });
      x += w;
    }
    this.text += str;
  }

  /** Append a word whose per-symbol boxes are known (OCR). */
  addChars(chars: Array<{ text: string; box: CharBox }>) {
    for (const c of chars) {
      for (let i = 0; i < c.text.length; i++) this.boxes.push(c.box);
      this.text += c.text;
    }
  }

  addBreak(s: string) {
    this.text += s;
    for (let i = 0; i < s.length; i++) this.boxes.push(null);
  }

  /** Rectangles to black out, grouped by page. Adjacent chars on a line merge. */
  rects(entities: Entity[], pad = 3): Map<number, CharBox[]> {
    const out = new Map<number, CharBox[]>();
    for (const e of entities) {
      let cur: CharBox | null = null;
      const flush = () => {
        if (!cur) return;
        const list = out.get(cur.page) ?? [];
        list.push({ page: cur.page, x: cur.x - pad, y: cur.y - pad, w: cur.w + pad * 2, h: cur.h + pad * 2 });
        out.set(cur.page, list);
        cur = null;
      };
      for (let i = e.start; i < e.end; i++) {
        const b = this.boxes[i];
        if (!b) continue;
        const c: CharBox | null = cur;
        // Merge only with the next character on the same line: mostly overlapping
        // vertically (line boxes are padded, so adjacent lines overlap a little) and
        // just to the right. An entity that wraps onto the next line gets its own box
        // there instead of one rectangle spanning both lines edge to edge.
        const overlapY = c ? Math.min(c.y + c.h, b.y + b.h) - Math.max(c.y, b.y) : 0;
        if (
          c &&
          c.page === b.page &&
          overlapY > Math.min(c.h, b.h) * 0.6 &&
          b.x >= c.x - c.h * 0.5 &&
          b.x <= c.x + c.w + c.h
        ) {
          const right = Math.max(c.x + c.w, b.x + b.w);
          const bottom = Math.max(c.y + c.h, b.y + b.h);
          c.x = Math.min(c.x, b.x);
          c.y = Math.min(c.y, b.y);
          c.w = right - c.x;
          c.h = bottom - c.y;
        } else {
          flush();
          cur = { ...b };
        }
      }
      flush();
    }
    return out;
  }
}

export function paintRects(ctx: CanvasRenderingContext2D, rects: CharBox[] | undefined) {
  if (!rects) return;
  ctx.fillStyle = '#000';
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas encode failed'))), type, quality),
  );
}
