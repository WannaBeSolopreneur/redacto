import { unpackEntities, type PackedEntities } from '../core/pack';
import type { TableFile } from './table-export';
import type { TableJob } from './table.worker';
import type { LoadedDoc } from './types';

export function runTableJob<T>(job: TableJob, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Document closed')); return; }
    const worker = new Worker(new URL('./table.worker.ts', import.meta.url), { type: 'module' });
    const done = () => { worker.terminate(); clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { done(); reject(new Error('Document closed')); };
    const timer = setTimeout(() => { done(); reject(new Error('Spreadsheet processing timed out. Try a smaller file.')); }, 120_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (e) => { done(); if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.result); };
    worker.onerror = (e) => { e.preventDefault(); done(); reject(new Error('Spreadsheet worker failed. Try a smaller file or reopen the document.')); };
    worker.onmessageerror = () => { done(); reject(new Error('Could not read the spreadsheet worker response.')); };
    try { worker.postMessage(job); } catch (e) { done(); reject(e); }
  });
}

/** Start the spreadsheet worker once so its code is cached (see src/offline.ts). */
export function warmTableWorker() {
  return runTableJob<boolean>({ kind: 'ping' }, new AbortController().signal);
}

export async function loadTableInWorker(file: File, signal?: AbortSignal): Promise<LoadedDoc> {
  const lifetime = new AbortController();
  const abort = () => lifetime.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const dispose = () => { signal?.removeEventListener('abort', abort); lifetime.abort(); };
  try {
    type Loaded = Omit<LoadedDoc, 'export' | 'rules' | 'structural'> & { rules: PackedEntities; structural: PackedEntities };
    const { rules, structural, ...data } = await runTableJob<Loaded>({ kind: 'load', file }, lifetime.signal);
    return { ...data, rules: unpackEntities(rules, data.text), structural: unpackEntities(structural, data.text), dispose,
      async export(entities, replacer) {
        const out = await runTableJob<TableFile>({ kind: 'export', table: data.table!, entities, mode: replacer.mode }, lifetime.signal);
        return { blob: new Blob([out.bytes as BlobPart], { type: out.type }), filename: out.filename };
      },
    };
  } catch (e) { dispose(); throw e; }
}
