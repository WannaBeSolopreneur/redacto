import type { Entity } from '../core/types';
import type { TableData } from '../formats/table';
import type { TableScanProgress } from './table-scan';

export interface LoadInfo {
  loadMs: number;
  threads: number;
  isolated: boolean;
}

type Reply = { result: Entity[]; info?: Record<string, unknown> };
export interface RunOptions {
  table?: TableData;
  known?: Entity[];
  headers?: boolean[];
  onProgress?: (progress: TableScanProgress) => void;
  /** Aborting stops the run inside the worker at the next chunk, so the queue moves on. */
  signal?: AbortSignal;
}
type Pending = { resolve: (r: Reply) => void; reject: (err: Error) => void; progress?: RunOptions['onProgress'] };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();
const progressListeners = new Set<(p: number) => void>();

/** A small int8 model loads in seconds; anything past this is treated as hung. */
const LOAD_TIMEOUT_MS = 90_000;

/** Fail every in-flight request and drop the worker so the next call starts fresh. */
function failAll(message: string) {
  for (const p of pending.values()) p.reject(new Error(message));
  pending.clear();
  worker?.terminate();
  worker = null;
}

function getWorker() {
  if (worker) return worker;
  // Ask the browser not to evict the cached model files under storage pressure.
  void navigator.storage?.persist?.().catch(() => {});
  worker = new Worker(new URL('./ner.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.kind === 'fatal') {
      failAll(`NER model failed: ${msg.error}`);
      return;
    }
    if (msg.kind === 'progress') {
      progressListeners.forEach((l) => l(msg.progress ?? 0));
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.kind === 'scan-progress') { p.progress?.(msg.progress); return; }
    pending.delete(msg.id);
    if (msg.kind === 'error') p.reject(new Error(msg.error));
    else p.resolve({ result: msg.result, info: msg.info });
  };
  // A crashed worker (e.g. out of memory) never answers; without these the UI would wait forever.
  worker.onerror = (ev) => {
    ev.preventDefault();
    failAll(`NER worker crashed: ${ev.message || 'unknown error (possibly out of memory)'}`);
  };
  worker.onmessageerror = () => failAll('NER worker sent an unreadable message');
  return worker;
}

/** Benchmark-only knobs; see scripts/browser-bench.mjs. */
export interface Overrides {
  threads?: number;
  dtype?: 'q8' | 'fp32';
  noCache?: boolean;
}

function call(kind: 'load' | 'run', model: string, text?: string, overrides?: Overrides, options: RunOptions = {}): Promise<Reply> {
  const id = nextId++;
  const { signal } = options;
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const abort = () => {
      if (!pending.delete(id)) return;
      w.postMessage({ id, kind: 'cancel' });
      reject(new Error('Document processing cancelled'));
    };
    const settle = <T>(fn: (v: T) => void) => (v: T) => { signal?.removeEventListener('abort', abort); fn(v); };
    pending.set(id, { resolve: settle(resolve), reject: settle(reject), progress: options.onProgress });
    w.postMessage({ id, kind, model, text, overrides, table: options.table, known: options.known, headers: options.headers });
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function loadNer(model: string, overrides?: Overrides): Promise<LoadInfo> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const msg = `Model did not finish loading within ${LOAD_TIMEOUT_MS / 1000}s`;
      failAll(msg);
      reject(new Error(msg));
    }, LOAD_TIMEOUT_MS);
  });
  try {
    const { info } = await Promise.race([call('load', model, undefined, overrides), timeout]);
    return info as unknown as LoadInfo;
  } finally {
    clearTimeout(timer);
  }
}

// Runs go through one at a time: interleaved inference calls in the worker only
// compete for the same threads, and a queue keeps progress predictable.
let queue: Promise<unknown> = Promise.resolve();
let queueGeneration = 0;

export function cancelNer() {
  queueGeneration++;
  failAll('Document processing cancelled');
  queue = Promise.resolve();
}

export function runNer(model: string, text: string, overrides?: Overrides, current: () => boolean = () => true, options?: RunOptions): Promise<{ entities: Entity[]; runMs: number }> {
  const generation = queueGeneration;
  const p = queue.then(async () => {
    if (generation !== queueGeneration || !current() || options?.signal?.aborted) throw new Error('Document processing cancelled');
    const { result, info } = await call('run', model, text, overrides, options);
    return { entities: result, runMs: Number(info?.runMs ?? 0) };
  });
  queue = p.catch(() => {});
  return p;
}

export function onNerProgress(fn: (p: number) => void) {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}
