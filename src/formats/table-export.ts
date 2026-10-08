import Papa from 'papaparse';
import { Replacer } from '../core/transform';
import type { Entity, Mode } from '../core/types';
import { csvLiteral, tableOutput, type TableData } from './table';
import { writeXlsx } from './xlsx-codec';

export interface TableFile { bytes: Uint8Array; filename: string; type: string }

/** The one place spreadsheets are encoded; used by the table worker and the in-thread fallback. */
export async function exportTable(table: TableData, entities: Entity[], mode: Mode): Promise<TableFile> {
  const values = tableOutput(table, entities, new Replacer(mode));
  if (!table.csv) {
    return { bytes: await writeXlsx(table, values), filename: 'redacted-workbook.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  const { delimiter, newline, bom } = table.csv;
  const csv = Papa.unparse(values[0].map((row) => row.map(csvLiteral)), { delimiter, newline });
  // Excel reads a BOM-less CSV in the legacy code page and garbles accented names.
  const bytes = new TextEncoder().encode(bom ? `﻿${csv}` : csv);
  const tsv = delimiter === '\t';
  return { bytes, filename: `redacted-data.${tsv ? 'tsv' : 'csv'}`, type: tsv ? 'text/tab-separated-values' : 'text/csv' };
}
