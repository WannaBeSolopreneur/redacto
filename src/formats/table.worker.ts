import { packedBuffers, packEntities } from '../core/pack';
import { detectRules } from '../core/rules';
import type { Entity, Mode } from '../core/types';
import type { TableData } from './table';
import { exportTable } from './table-export';
import { loadCsv } from './csv';
import { loadXlsx } from './xlsx';

export type TableJob = { kind: 'ping' } | { kind: 'load'; file: File } | { kind: 'export'; table: TableData; entities: Entity[]; mode: Mode };

// Each worker runs one job and is terminated on completion or document close.
self.onmessage = async (event: MessageEvent<TableJob>) => {
  try {
    const job = event.data;
    if (job.kind === 'ping') self.postMessage({ result: true }); // loaded: used to cache this worker for offline use
    else if (job.kind === 'load') {
      const doc = job.file.name.toLowerCase().endsWith('.xlsx') ? await loadXlsx(job.file) : await loadCsv(job.file);
      // Rules run here rather than on the page: ~0.25 s per 500k cells of UI freeze otherwise.
      const rules = packEntities(detectRules(doc.text));
      const structural = packEntities(doc.structural ?? []);
      self.postMessage(
        { result: { kind: doc.kind, name: doc.name, visual: false, notes: doc.notes, table: doc.table, text: doc.text, rules, structural } },
        { transfer: [...packedBuffers(rules), ...packedBuffers(structural)] },
      );
    } else {
      const out = await exportTable(job.table, job.entities, job.mode);
      self.postMessage({ result: out }, { transfer: [out.bytes.buffer] });
    }
  } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : String(e) }); }
};
