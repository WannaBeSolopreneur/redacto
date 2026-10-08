import { createWorker, type Worker as TWorker } from 'tesseract.js';
import { TextMap } from './visual';

const BASE = import.meta.env.BASE_URL;
let worker: Promise<TWorker> | null = null;

function getWorker() {
  worker ??= createWorker('eng', 1, {
    workerPath: `${BASE}vendor/tesseract/worker.min.js`,
    corePath: `${BASE}vendor/tesseract/core`,
    langPath: `${BASE}vendor/tesseract/lang`,
    workerBlobURL: false,
  });
  return worker;
}

/** Start OCR ahead of time: downloads the engine and English data for this browser and keeps them in memory. */
export function warmOcr() {
  return getWorker();
}

/** OCR a canvas and append its words (with symbol-level boxes) to `map`. */
export async function ocrInto(map: TextMap, canvas: HTMLCanvasElement, page: number) {
  const w = await getWorker();
  const { data } = await w.recognize(canvas, {}, { blocks: true, text: true });
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        line.words.forEach((word, i) => {
          if (i > 0) map.addBreak(' ');
          const symbols = word.symbols.length ? word.symbols : [{ text: word.text, bbox: word.bbox }];
          map.addChars(
            symbols.map((s) => ({
              text: s.text,
              // Horizontal extent from the symbol, vertical from the line, so a
              // redaction is a solid bar rather than ragged per-glyph boxes.
              box: { page, x: s.bbox.x0, y: line.bbox.y0, w: s.bbox.x1 - s.bbox.x0, h: line.bbox.y1 - line.bbox.y0 },
            })),
          );
        });
        map.addBreak('\n');
      }
      map.addBreak('\n');
    }
  }
}
