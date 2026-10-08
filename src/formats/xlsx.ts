import { buildTable } from './table';
import { exportTable } from './table-export';
import { readXlsx } from './xlsx-codec';
import type { LoadedDoc } from './types';

export async function loadXlsx(file: File): Promise<LoadedDoc> {
  const { sheets, notes } = await readXlsx(await file.arrayBuffer());
  const data = buildTable(sheets);
  return {
    kind: 'xlsx', name: file.name, visual: false, notes, ...data,
    async export(entities, replacer) {
      const out = await exportTable(data.table, entities, replacer.mode);
      return { blob: new Blob([out.bytes as BlobPart], { type: out.type }), filename: out.filename };
    },
  };
}
