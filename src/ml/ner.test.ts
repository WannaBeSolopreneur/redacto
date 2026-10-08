import { afterEach, describe, expect, it, vi } from 'vitest';
import { withPropagation } from '../core/detect';
import type { Entity } from '../core/types';
import { buildTable, type TableData } from '../formats/table';
import { cancelNer, runNer } from './ner';
import { planTableScan, scanTable, type TableScanProgress } from './table-scan';

class ScanWorker {
  onmessage?: (event: { data: unknown }) => void;
  terminated = false;
  terminate() { this.terminated = true; }
  postMessage(message: { id: number; kind: string; text: string; table?: TableData; known?: Entity[]; headers?: boolean[] }) {
    const job = structuredClone(message); // Throws if a callback leaks into the message.
    void (async () => {
      const entities = job.table ? await scanTable(planTableScan(job.table, job.known ?? [], job.headers), async (text) => {
        const start = text.indexOf('Zyra');
        return start < 0 ? [] : [{ start, end: start + 4, text: 'Zyra', type: 'PERSON', source: 'ml', score: 0.99 }];
      }, (progress) => this.onmessage?.({ data: { id: job.id, kind: 'scan-progress', progress } })) : [];
      if (!this.terminated) this.onmessage?.({ data: { id: job.id, kind: 'result', result: withPropagation(job.text, entities), info: { runMs: 1 } } });
    })();
  }
}

afterEach(() => { cancelNer(); vi.unstubAllGlobals(); });

describe('model worker client', () => {
  it('routes per-document scan progress without resolving early or losing repeated detections', async () => {
    vi.stubGlobal('Worker', ScanWorker);
    vi.stubGlobal('navigator', { storage: { persist: async () => false } });
    const doc = buildTable([{ name: 'Data', rows: [[{ value: 'Zyra' }], [{ value: 'Zyra' }]] }]);
    const progress: TableScanProgress[] = [];
    const result = await runNer('test', doc.text, undefined, () => true, { table: doc.table, known: [], onProgress: (p) => progress.push(p) });
    expect(progress.map((p) => p.completedValues)).toEqual([0, 1]);
    expect(progress.at(-1)?.reusedCells).toBe(1);
    expect(result.entities.map((e) => e.text)).toEqual(['Zyra', 'Zyra']);
  });

  it('aborting a run tells the worker to stop and lets the next run start', async () => {
    const posted: Array<{ id: number; kind: string }> = [];
    class StuckWorker {
      onmessage?: (event: { data: unknown }) => void;
      terminate() {}
      postMessage(m: { id: number; kind: string }) {
        posted.push(m);
        // The first run never finishes on its own; later runs answer at once.
        if (m.kind === 'run' && m.id !== posted[0].id) queueMicrotask(() => this.onmessage?.({ data: { id: m.id, kind: 'result', result: [], info: { runMs: 1 } } }));
      }
    }
    vi.stubGlobal('Worker', StuckWorker);
    vi.stubGlobal('navigator', { storage: { persist: async () => false } });
    const controller = new AbortController();
    const first = runNer('test', 'slow', undefined, () => true, { signal: controller.signal });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const second = runNer('test', 'next');
    controller.abort();
    await expect(first).rejects.toThrow(/cancelled/);
    expect(posted[1]).toMatchObject({ id: posted[0].id, kind: 'cancel' });
    await expect(second).resolves.toMatchObject({ entities: [] });
  });
});
