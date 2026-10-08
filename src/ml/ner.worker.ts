/// <reference lib="webworker" />
import '../polyfills';
import { env, pipeline, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { Entity, EntityType } from '../core/types';
import { getModel } from './models';
import type { TableData } from '../formats/table';
import { planTableScan, scanTable } from './table-scan';
import { withPropagation } from '../core/detect';
import { modelChunks } from './chunks';

const BASE = new URL(import.meta.env.BASE_URL, self.location.origin).href;

// Everything is served from this origin; never reach out to the Hub or a CDN.
env.allowRemoteModels = false;
env.allowLocalModels = true;
// Must be root-relative, not an absolute http URL: transformers.js only runs its
// local file-existence checks for non-URL paths, and otherwise skips the tokenizer.
env.localModelPath = `${import.meta.env.BASE_URL}models/`;
env.backends.onnx.wasm!.wasmPaths = {
  wasm: `${BASE}vendor/ort/ort-wasm-simd-threaded.wasm`,
  mjs: `${BASE}vendor/ort/ort-wasm-simd-threaded.mjs`,
};

// Threads need cross-origin isolation (COOP/COEP); without it ORT silently runs
// single-threaded. Set the count explicitly so we can report what's in use.
let THREADS = self.crossOriginIsolated ? Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))) : 1;
env.backends.onnx.wasm!.numThreads = THREADS;

/** Benchmark-only knobs (scripts/browser-bench.mjs); must arrive before the first load. */

interface Overrides {
  threads?: number;
  dtype?: 'q8' | 'fp32';
  noCache?: boolean;
}

// Surface async failures from inside onnxruntime/emscripten that would otherwise be swallowed.
self.addEventListener('unhandledrejection', (ev) => {
  self.postMessage({ kind: 'fatal', error: String(ev.reason) });
});

const loaded = new Map<string, Promise<TokenClassificationPipeline>>();

function load(modelId: string, overrides: Overrides = {}) {
  if (overrides.threads && loaded.size === 0) {
    THREADS = overrides.threads;
    env.backends.onnx.wasm!.numThreads = THREADS;
  }
  if (overrides.noCache) env.useBrowserCache = false;
  const key = `${modelId}:${overrides.dtype ?? ''}`;
  let p = loaded.get(key);
  if (!p) {
    // One model in memory at a time: switching models frees the previous one (100+ MB each).
    for (const [k, other] of loaded) {
      loaded.delete(k);
      void other.then((pipe) => pipe.dispose()).catch(() => {});
    }
    const model = getModel(modelId);
    p = (async () => {
      const ner = (await pipeline('token-classification', model.id, {
        dtype: overrides.dtype ?? model.dtype,
        device: 'wasm',
        // Our models are graph-fused offline, so only cheap rewrites are left to do
        // at load. 'all' (the default) re-runs the full optimizer on every page load,
        // which is most of the "preparing" time in Firefox and Safari.
        session_options: { graphOptimizationLevel: 'basic' },
        progress_callback: (e: { status: string; progress?: number; file?: string }) => {
          if (e.status === 'progress') self.postMessage({ kind: 'progress', file: e.file, progress: e.progress });
        },
      })) as TokenClassificationPipeline;
      // Warm-up: the first inference allocates buffers and JITs kernels.
      await ner('Warm up the model.', { ignore_labels: [] });
      return ner;
    })();
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}

type LabelTypes = Array<EntityType | null>;
const labelTypeCache = new Map<string, LabelTypes>();

/** Model label index → app entity type (null for "O" and labels we don't map). */
function labelTypes(modelId: string, ner: TokenClassificationPipeline): LabelTypes {
  let t = labelTypeCache.get(modelId);
  if (!t) {
    const id2label = (ner.model.config as unknown as { id2label: Record<string, string> }).id2label;
    const map = getModel(modelId).labels;
    const n = Object.keys(id2label).length;
    t = Array.from({ length: n }, (_, k) => map[String(id2label[k]).replace(/^[BIES]-/, '')] ?? null);
    labelTypeCache.set(modelId, t);
  }
  return t;
}

/**
 * Per-token predictions, scored by entity type rather than by raw label.
 *
 * The model spreads its belief over labels we treat as one type (B-first_name,
 * I-first_name, B-last_name, I-last_name are all PERSON). Taking only the top
 * raw label made confident names look uncertain (e.g. 0.23 for "Oluwaseun
 * Adeyemi") so they fell under the confidence cutoff and weren't redacted.
 * Summing probabilities per type fixes that, and a token counts as an entity
 * when its best type beats "not an entity".
 */
async function classify(ner: TokenClassificationPipeline, modelId: string, text: string) {
  const types = labelTypes(modelId, ner);
  const inputs = ner.tokenizer([text], { padding: true, truncation: false });
  const { logits } = await ner.model(inputs);
  const ids = (inputs.input_ids as { tolist(): Array<Array<number | bigint>> }).tolist()[0];
  const [, seq, nl] = logits.dims as number[];
  const data = logits.data as Float32Array;
  const out: Array<{ word: string; type: EntityType | null; score: number }> = [];
  const probs = new Float64Array(nl);
  for (let j = 0; j < seq; j++) {
    const word = ner.tokenizer.decode([Number(ids[j])], { skip_special_tokens: true });
    if (word === '') continue;
    let maxLogit = -Infinity;
    for (let k = 0; k < nl; k++) maxLogit = Math.max(maxLogit, data[j * nl + k]);
    let sum = 0;
    for (let k = 0; k < nl; k++) sum += probs[k] = Math.exp(data[j * nl + k] - maxLogit);
    const byType = new Map<EntityType | null, number>();
    for (let k = 0; k < nl; k++) byType.set(types[k], (byType.get(types[k]) ?? 0) + probs[k] / sum);
    let best: EntityType | null = null;
    let bestP = -1;
    for (const [t, pr] of byType) if (pr > bestP) [best, bestP] = [t, pr];
    out.push({ word, type: best, score: bestP });
  }
  return out;
}

/**
 * Title-case lines written entirely in capitals ("MARIA ELENA GONZALEZ" → "Maria
 * Elena Gonzalez"). The models learned names from normally-cased text and miss
 * many all-caps ones (statement headers, payslips, forms). Character-for-character,
 * so offsets are unchanged; tokens are aligned against the original text.
 */
function normaliseCaps(text: string): string {
  // Per line and per column segment: a caps name often shares a line with a normal-case column.
  return text.replace(/[^\n\t]+/g, (line) => {
    if (/\p{Ll}/u.test(line) || (line.match(/\p{Lu}/gu)?.length ?? 0) < 4) return line;
    let out = '';
    let prevLetter = false;
    for (const ch of line) {
      const isLetter = /\p{L}/u.test(ch);
      const lower = ch.toLowerCase();
      out += isLetter && prevLetter && lower.length === ch.length ? lower : ch;
      prevLetter = isLetter;
    }
    return out;
  });
}

/**
 * transformers.js gives no character offsets and groups sub-word pieces badly
 * (so "okonkwo" can come back as "wo"). Instead we take per-token predictions,
 * align every token to the text ourselves, and widen each hit to whole words.
 */
async function run(text: string, modelId: string, overrides?: Overrides, cancelled = () => false): Promise<Entity[]> {
  const ner = await load(modelId, overrides);
  const entities: Entity[] = [];
  const maxTokens = Math.min(512, ner.tokenizer.model_max_length);
  for (const c of modelChunks(text, (value) => ner.tokenizer.encode(normaliseCaps(value)).length, maxTokens)) {
    if (cancelled()) throw new Error('Document processing cancelled');
    if (!/[\p{L}\p{N}]/u.test(c.text)) continue;
    const tokens = await classify(ner, modelId, normaliseCaps(c.text));
    const lower = c.text.toLowerCase();
    let cursor = 0;
    for (const t of tokens) {
      const piece = t.word.replace(/^##/, '').trim().toLowerCase();
      if (!piece) continue;
      const at = lower.indexOf(piece, cursor);
      // Unalignable piece (e.g. normalised unicode): skip without losing our place.
      if (at < 0 || at - cursor > 40) continue;
      cursor = at + piece.length;
      if (!t.type) continue;
      let s = at;
      let e = cursor;
      while (s > 0 && /[\p{L}\p{N}]/u.test(c.text[s - 1])) s--;
      while (e < c.text.length && /[\p{L}\p{N}]/u.test(c.text[e])) e++;
      // BPE tokens (RoBERTa) can carry surrounding whitespace such as a trailing newline.
      while (s < e && /\s/.test(c.text[s])) s++;
      while (e > s && /\s/.test(c.text[e - 1])) e--;
      if (e <= s) continue;
      entities.push({ start: c.offset + s, end: c.offset + e, type: t.type, text: '', source: 'ml', score: t.score });
    }
  }
  return merge(entities, text);
}

/** Same-type pieces separated only by this are one entity ("Mary-Jane", "a.b.com/x"). Keep in sync with convert_models.py. */
const JOINABLE_GAP = /^[ \-./:@_]{1,2}$/;

/** Whether a gap between two same-type pieces joins them into one entity. */
function joinable(text: string, prevEnd: number, nextStart: number) {
  const gap = text.slice(prevEnd, nextStart);
  if (!JOINABLE_GAP.test(gap)) return false;
  // ". " ends a sentence ("Ask Kevin. Kevin said…") unless it follows an initial ("J. Smith").
  if (/\.\s/.test(gap)) return /(^|[^\p{L}])\p{L}$/u.test(text.slice(Math.max(0, prevEnd - 2), prevEnd));
  return true;
}

/** Merge overlapping or space/hyphen-adjacent spans of the same type ("priya" + "raman"). */
function merge(ents: Entity[], text: string): Entity[] {
  const out: Entity[] = [];
  for (const e of ents.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const prev = out[out.length - 1];
    if (prev && prev.type === e.type && (e.start <= prev.end || joinable(text, prev.end, e.start))) {
      prev.end = Math.max(prev.end, e.end);
      // Every piece was already classified as this type; one confident piece
      // ("Okafor") shouldn't be dragged under the cutoff by a hesitant one ("A.B.").
      prev.score = Math.max(prev.score, e.score);
    } else out.push({ ...e });
  }
  for (const e of out) {
    // Joining can pull in a dangling separator ("4415023377 -"); trim it off both ends.
    while (e.end > e.start && /[\s\-–—.,:;/]/.test(text[e.end - 1])) e.end--;
    while (e.start < e.end && /[\s\-–—.,:;/]/.test(text[e.start])) e.start++;
    e.text = text.slice(e.start, e.end);
  }
  return out.filter((e) => e.text.trim().length >= 2);
}

/** Runs the client gave up on (document closed, model switched, header toggled). */
const cancelledRuns = new Set<number>();

self.onmessage = async (
  ev: MessageEvent<{ id: number; kind: 'load' | 'run' | 'cancel'; model: string; text?: string; overrides?: Overrides; table?: TableData; known?: Entity[]; headers?: boolean[] }>,
) => {
  const { id, kind, model, text, overrides, table, known, headers } = ev.data;
  if (kind === 'cancel') { cancelledRuns.add(id); return; }
  const cancelled = () => cancelledRuns.has(id);
  try {
    if (kind === 'load') {
      const t0 = performance.now();
      await load(model, overrides);
      self.postMessage({
        id,
        kind: 'result',
        result: [],
        info: { loadMs: Math.round(performance.now() - t0), threads: THREADS, isolated: self.crossOriginIsolated },
      });
    } else {
      const t0 = performance.now();
      let lastProgress = -Infinity;
      const entities = table
        ? await scanTable(planTableScan(table, known ?? [], headers), (sample) => run(sample, model, overrides, cancelled), (progress) => {
          const now = performance.now();
          if (now - lastProgress >= 200 || progress.completedValues === progress.uniqueValues) {
            self.postMessage({ id, kind: 'scan-progress', progress });
            lastProgress = now;
          }
        })
        : await run(text ?? '', model, overrides, cancelled);
      // The indexed repeat search also stays off the UI thread.
      const result = withPropagation(text ?? '', entities);
      self.postMessage({ id, kind: 'result', result, info: { runMs: Math.round(performance.now() - t0) } });
    }
  } catch (err) {
    self.postMessage({ id, kind: 'error', error: String(err) });
  } finally {
    cancelledRuns.delete(id);
  }
};
