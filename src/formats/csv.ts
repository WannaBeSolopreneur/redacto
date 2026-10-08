import Papa from 'papaparse';
import { buildTable } from './table';
import { exportTable } from './table-export';
import type { LoadedDoc } from './types';

export async function loadCsv(file: File): Promise<LoadedDoc> {
  if (file.size > 30_000_000) throw new Error('CSV files over 30 MB should be split into smaller files.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let source: string;
  // Excel on Windows saves "CSV" in the legacy code page; not valid UTF-8, so fall back to it.
  let legacy = false;
  try { source = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch {
    if (encoding !== 'utf-8') throw new Error('Unsupported text encoding. Save this file as UTF-8 CSV and reopen it.');
    source = new TextDecoder('windows-1252').decode(bytes);
    legacy = true;
  }
  const isTsv = file.name.toLowerCase().endsWith('.tsv');
  const parsed = Papa.parse<string[]>(source.replace(/^\uFEFF/, ''), {
    skipEmptyLines: false, delimiter: isTsv ? '\t' : undefined,
  });
  if (parsed.errors.some((e) => e.type === 'Quotes')) throw new Error('Malformed CSV quoting. Correct the quoted cells and reopen the file.');
  if (parsed.data.length > 100_000 || parsed.data.some((r) => r.length > 1024) || parsed.data.reduce((n, r) => n + r.length, 0) > 500_000) {
    throw new Error('Spreadsheet is too large for this workspace. Split it into files below 100,000 rows, 1,024 columns and 500,000 cells.');
  }
  const delimiter = isTsv ? '\t' : parsed.meta.delimiter || ',';
  const data = buildTable([{ name: 'Sheet 1', rows: parsed.data.map((row) => row.map((value) => ({ value }))) }]);
  data.table.csv = { delimiter, newline: parsed.meta.linebreak || '\r\n', bom: utf8Bom || legacy || encoding !== 'utf-8' };

  return {
    kind: 'csv',
    name: file.name,
    ...data,
    visual: false,
    notes: [
      'All cells are scanned, including the first row. Use “First row is a header” to apply column-name detection.',
      'Formula-like values are exported as text with a leading apostrophe so spreadsheet apps do not execute them.',
      ...(legacy ? ['This file was not UTF-8, so it was read as Windows (Western) text. The export is UTF-8; check accented characters.'] : []),
    ],
    async export(entities, replacer) {
      const out = await exportTable(data.table, entities, replacer.mode);
      return { blob: new Blob([out.bytes as BlobPart], { type: out.type }), filename: out.filename };
    },
  };
}
