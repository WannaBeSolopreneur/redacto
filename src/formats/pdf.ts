// The legacy build polyfills newer JS (e.g. the global `Iterator`, Safari 18.4+) so
// PDFs work on older Safari such as 16.x; the modern build crashes there on import.
import { getDocument, GlobalWorkerOptions, Util, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { PDFDocument } from 'pdf-lib';
import { ocrInto } from './ocr';
import { baseName, type LoadedDoc, type PageImage, type Progress } from './types';
import { canvasToBlob, paintRects, TextMap } from './visual';

// Our own worker wrapper (pdf.worker.ts) loads polyfills before pdf.js's worker code.
GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });

const BASE = import.meta.env.BASE_URL;
const SCALE = 2; // render at 144 dpi
const MIN_TEXT_CHARS = 25; // below this a page is treated as scanned

async function renderPage(pdf: PDFDocumentProxy, n: number) {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return { page, viewport, canvas };
}

interface Placed {
  item: TextItem;
  x: number;
  /** Top of the box and baseline, in canvas pixels. */
  top: number;
  base: number;
  fontH: number;
  w: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

/** Relative glyph widths from a similar system font. PDFs only give a run's total width. */
function charWeights(str: string, family: string): number[] {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const out: number[] = [];
  for (const ch of str) {
    const key = `${family}\0${ch}`;
    let w = widthCache.get(key);
    if (w === undefined) {
      if (measureCtx) {
        measureCtx.font = `100px ${family}`;
        w = measureCtx.measureText(ch).width;
      }
      w = w && w > 0 ? w : 50;
      widthCache.set(key, w);
    }
    // One weight per UTF-16 unit so weights line up with string indices.
    out.push(w);
    if (ch.length > 1) out.push(0);
  }
  return out;
}

/**
 * Lay out a page's text in reading order: lines top to bottom, items left to
 * right. Content-stream order is arbitrary (a statement can store the account
 * number long before its "Account Number:" label), which hides label/value
 * pairs from the rules and scrambles context for the model. Large horizontal
 * gaps (separate columns) become tabs so entities never merge across them.
 */
function layoutText(map: TextMap, items: TextItem[], vt: number[], page: number, styles: Record<string, { fontFamily: string }>) {
  const placed: Placed[] = items
    .filter((i) => i.str.length > 0)
    .map((item) => {
      const tx = Util.transform(vt, item.transform);
      const fontH = Math.hypot(tx[2], tx[3]);
      return { item, x: tx[4], base: tx[5], top: tx[5] - fontH, fontH, w: item.width * SCALE };
    })
    .sort((a, b) => a.base - b.base || a.x - b.x);

  const lines: Placed[][] = [];
  for (const p of placed) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(p.base - line[0].base) <= Math.min(p.fontH, line[0].fontH) * 0.5) line.push(p);
    else lines.push([p]);
  }

  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let prevEnd: number | null = null;
    for (const p of line) {
      if (prevEnd !== null) {
        const gap = p.x - prevEnd;
        if (gap > p.fontH * 1.5) map.addBreak('\t');
        else if (
          !/\s$/.test(map.text) &&
          !/^\s/.test(p.item.str) &&
          // Separate words; also adjacent number columns, which can sit almost flush ("1,114.61" "3,481.26").
          (gap > p.fontH * 0.1 || (/\d$/.test(map.text) && /^[-$(\d]/.test(p.item.str) && gap > -p.fontH * 0.3))
        )
          map.addBreak(' ');
      }
      const family = styles[p.item.fontName]?.fontFamily ?? 'sans-serif';
      map.addRun(p.item.str, { page, x: p.x, y: p.top, w: p.w, h: p.fontH * 1.15 }, charWeights(p.item.str, family));
      prevEnd = Math.max(prevEnd ?? -Infinity, p.x + p.w);
    }
    map.addBreak('\n');
  }
}

export async function loadPdf(file: File, opts: { forceOcr: boolean }, progress: Progress): Promise<LoadedDoc> {
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${BASE}vendor/pdfjs/cmaps/`,
    standardFontDataUrl: `${BASE}vendor/pdfjs/standard_fonts/`,
    wasmUrl: `${BASE}vendor/pdfjs/wasm/`,
    iccUrl: `${BASE}vendor/pdfjs/iccs/`,
  });
  const pdf = await task.promise;

  const map = new TextMap();
  const notes: string[] = [];
  const pages: PageImage[] = [];
  let ocrPages = 0;

  for (let n = 1; n <= pdf.numPages; n++) {
    progress(`Reading page ${n} of ${pdf.numPages}`, (n - 1) / pdf.numPages);
    const { page, viewport, canvas } = await renderPage(pdf, n);
    const content = await page.getTextContent();
    const items = content.items.filter((i): i is TextItem => 'str' in i);
    const charCount = items.reduce((s, i) => s + i.str.trim().length, 0);

    if (opts.forceOcr || charCount < MIN_TEXT_CHARS) {
      progress(`OCR page ${n} of ${pdf.numPages}`, (n - 1) / pdf.numPages);
      await ocrInto(map, canvas, n);
      ocrPages++;
    } else {
      layoutText(map, items, viewport.transform, n, content.styles);
    }
    map.addBreak('\n\n');
    // Keep a compressed copy of the page for the on-screen review.
    pages.push({ url: URL.createObjectURL(await canvasToBlob(canvas, 'image/jpeg', 0.85)), width: canvas.width, height: canvas.height });
    canvas.width = canvas.height = 0;
    page.cleanup();
  }

  if (ocrPages) notes.push(`${ocrPages} page(s) had no text layer and were OCR'd; check them carefully.`);
  notes.push('Output pages are flattened images: the original text layer, metadata, annotations and attachments are removed.');

  return {
    kind: 'pdf',
    name: file.name,
    text: map.text,
    visual: true,
    notes,
    pages,
    boxes: (e) => map.rects([e]),
    async export(entities, _replacer, progress, areas = []) {
      const rects = map.rects(entities);
      const out = await PDFDocument.create();
      for (let n = 1; n <= pdf.numPages; n++) {
        progress?.(`Writing page ${n} of ${pdf.numPages}`, (n - 1) / pdf.numPages);
        // Re-rendered from the original at full quality, not from the review JPEGs.
        const { canvas } = await renderPage(pdf, n);
        paintRects(canvas.getContext('2d')!, [...(rects.get(n) ?? []), ...areas.filter((a) => a.page === n)]);
        const jpg = await canvasToBlob(canvas, 'image/jpeg', 0.92);
        canvas.width = canvas.height = 0;
        const img = await out.embedJpg(await jpg.arrayBuffer());
        const p = out.addPage([img.width / SCALE, img.height / SCALE]);
        p.drawImage(img, { x: 0, y: 0, width: img.width / SCALE, height: img.height / SCALE });
      }
      out.setProducer('redact-local');
      out.setCreator('redact-local');
      const bytes = await out.save();
      return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), filename: `${baseName(file.name)}.redacted.pdf` };
    },
    dispose() {
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      void task.destroy();
    },
  };
}
