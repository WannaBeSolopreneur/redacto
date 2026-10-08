import { applyToText, Replacer } from '../core/transform';
import type { Entity } from '../core/types';
import { classifyColumn } from './columns';

export interface TableCell {
  value: string;
  start: number;
  end: number;
  scalar?: number | boolean;
}
export interface TableSheet {
  name: string;
  rows: TableCell[][];
  columnCount: number;
  headerRow: boolean;
  hidden?: boolean;
  hiddenRows?: number[];
  hiddenColumns?: number[];
}
export interface TableData {
  sheets: TableSheet[];
  /** Set for CSV/TSV sources. `bom`: write a UTF-8 BOM so Excel detects the encoding. */
  csv?: { delimiter: string; newline: string; bom: boolean };
}
export interface SheetInput {
  name: string;
  rows: Array<Array<{ value: string; scalar?: number | boolean }>>;
  hidden?: boolean;
  hiddenRows?: number[];
  hiddenColumns?: number[];
}

export function columnLabel(index: number): string {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}

const NUMERIC = /^[\s$€£¥(+-]*\d[\d.,/:\s-]*%?\)?\s*$/;

/**
 * Whether row one is a header. A recognised column name ("Email", "First Name") decides
 * it; otherwise row one must look like labels (short, distinct, starting with a letter,
 * no emails or long digit runs) above a column of numbers or dates, as in a bank export
 * "Date, Description, Amount". Getting it wrong is cheap: row one is scanned either way.
 */
export function looksLikeHeader(rows: Array<Array<{ value: string }>>): boolean {
  const head = (rows[0] ?? []).map((c) => c.value.trim());
  if (head.some((v) => classifyColumn(v) !== null)) return true;
  const filled = head.filter(Boolean);
  if (filled.length < 2 || new Set(filled.map((v) => v.toLowerCase())).size !== filled.length) return false;
  if (!filled.every((v) => v.length <= 40 && /^\p{L}/u.test(v) && !v.includes('@') && !/\d{3}/.test(v))) return false;
  const body = rows.slice(1, 21);
  return head.some((h, ci) => h && !/\d/.test(h) && body.some((r) => NUMERIC.test(r[ci]?.value ?? '')));
}

/** Every cell, including row one, has reviewable offsets. Context is never exported. */
export function buildTable(inputs: SheetInput[]): { table: TableData; text: string; structural: Entity[] } {
  let text = '';
  const sheets = inputs.map((input): TableSheet => {
    const headerRow = looksLikeHeader(input.rows);
    const rows = input.rows.map((row, ri) => {
      const cells = row.map((cell, ci) => {
        text += `${ri > 0 && headerRow ? input.rows[0]?.[ci]?.value || columnLabel(ci) : columnLabel(ci)}: `;
        const start = text.length;
        text += cell.value;
        const end = text.length;
        text += ' | ';
        return { ...cell, start, end };
      });
      text += '\n';
      return cells;
    });
    text += '\n';
    return { ...input, rows, columnCount: rows.reduce((n, row) => Math.max(n, row.length), 0), headerRow };
  });
  const table = { sheets };
  return { table, text, structural: tableStructural(table) };
}

export function tableStructural(table: TableData, headers = table.sheets.map((s) => s.headerRow)): Entity[] {
  return table.sheets.flatMap((sheet, si) => {
    if (!headers[si]) return [];
    const types = (sheet.rows[0] ?? []).map((c) => classifyColumn(c.value));
    return sheet.rows.slice(1).flatMap((row) => row.flatMap((cell, ci): Entity[] =>
      types[ci] && cell.value.trim() ? [{ start: cell.start, end: cell.end, text: cell.value, type: types[ci]!, source: 'rule', score: 0.99 }] : [],
    ));
  });
}

/** Clip detections to real cells; never replace generated context or swallow adjacent values. */
export function tableEntities(table: TableData, entities: Entity[]): Entity[] {
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const out: Entity[] = [];
  let cursor = 0;
  for (const sheet of table.sheets) for (const row of sheet.rows) for (const cell of row) {
    while (cursor < sorted.length && sorted[cursor].end <= cell.start) cursor++;
    for (let i = cursor; i < sorted.length && sorted[i].start < cell.end; i++) {
      const e = sorted[i];
      const start = Math.max(e.start, cell.start), end = Math.min(e.end, cell.end);
      if (end > start) out.push({ ...e, start, end, text: cell.value.slice(start - cell.start, end - cell.start) });
    }
  }
  return out;
}

/** Shared by preview and export, with one replacement map across all sheets. */
export function tableOutput(table: TableData, entities: Entity[], replacer: Replacer): string[][][] {
  const clipped = tableEntities(table, entities);
  let cursor = 0;
  return table.sheets.map((sheet) => sheet.rows.map((row) => row.map((cell) => {
    const local: Entity[] = [];
    while (cursor < clipped.length && clipped[cursor].start < cell.end) {
      const e = clipped[cursor++];
      if (e.end > cell.start) local.push({ ...e, start: e.start - cell.start, end: e.end - cell.start });
    }
    return applyToText(cell.value, local, replacer);
  })));
}

/** Neutralise spreadsheet formula injection. Plain numbers ("-350.00", "+44") are data, not formulas, and stay as they are. */
export function csvLiteral(value: string): string {
  if (/^[+-]?(?:\d[\d,]*)?(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return value;
  return /^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
}
