import type { Entity } from '../core/types';
import { columnLabel, type TableCell, type TableData } from '../formats/table';

export interface TableScanStats {
  cells: number;
  uniqueValues: number;
  reusedCells: number;
  ruleCoveredCells: number;
}
export interface TableScanProgress extends TableScanStats { completedValues: number }
interface Sample { value: string; context: string; targets: TableCell[] }
export interface TableScanPlan { samples: Sample[]; stats: TableScanStats }

/** Reuse predictions only for identical values in the same sheet/column context. */
export function planTableScan(table: TableData, known: Entity[], headers = table.sheets.map((s) => s.headerRow)): TableScanPlan {
  // Only unfiltered, high-confidence rules can replace a model pass. Lower
  // confidence patterns still need AI, especially if the user raises the cutoff.
  const covered = known.filter((e) => e.source === 'rule' && e.score >= 0.99).sort((a, b) => a.start - b.start);
  const samples: Sample[] = [];
  const stats: TableScanStats = { cells: 0, uniqueValues: 0, reusedCells: 0, ruleCoveredCells: 0 };
  let cursor = 0, coveredEnd = -1;
  table.sheets.forEach((sheet, si) => {
    const contexts = new Map<string, Map<string, Sample>>();
    sheet.rows.forEach((row, ri) => row.forEach((cell, ci) => {
      const trimmed = cell.value.trim();
      if (!trimmed) return;
      stats.cells++;
      const start = cell.start + cell.value.indexOf(trimmed), end = start + trimmed.length;
      while (cursor < covered.length && covered[cursor].start <= start) coveredEnd = Math.max(coveredEnd, covered[cursor++].end);
      if (coveredEnd >= end) { stats.ruleCoveredCells++; return; }
      const context = ri > 0 && headers[si] ? sheet.rows[0]?.[ci]?.value || columnLabel(ci) : columnLabel(ci);
      const key = JSON.stringify([ci, context]);
      let values = contexts.get(key);
      if (!values) { values = new Map(); contexts.set(key, values); }
      const existing = values.get(cell.value);
      if (existing) { existing.targets.push(cell); stats.reusedCells++; }
      else {
        const sample = { value: cell.value, context, targets: [cell] };
        values.set(cell.value, sample);
        samples.push(sample);
      }
    }));
  });
  stats.uniqueValues = samples.length;
  return { samples, stats };
}

/** Pack short values into model-sized batches; map findings back to real cells. */
export async function scanTable(
  plan: TableScanPlan,
  infer: (text: string) => Promise<Entity[]>,
  progress?: (progress: TableScanProgress) => void,
): Promise<Entity[]> {
  const out: Entity[] = [];
  let completedValues = 0;
  progress?.({ ...plan.stats, completedValues });
  for (let next = 0; next < plan.samples.length;) {
    let text = '';
    const batch: Array<{ sample: Sample; start: number; end: number }> = [];
    while (next < plan.samples.length) {
      const sample = plan.samples[next];
      const prefix = `${sample.context}: `;
      // A long free-text cell is sent intact; the normal text scanner chunks it.
      if (batch.length && text.length + prefix.length + sample.value.length + 2 > 1200) break;
      text += prefix;
      const start = text.length;
      text += sample.value;
      batch.push({ sample, start, end: text.length });
      text += '\n\n';
      next++;
    }
    const entities = (await infer(text)).sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const { sample, start, end } of batch) {
      while (cursor < entities.length && entities[cursor].end <= start) cursor++;
      for (let i = cursor; i < entities.length && entities[i].start < end; i++) {
        const e = entities[i];
        const from = Math.max(e.start, start) - start, to = Math.min(e.end, end) - start;
        if (to <= from || !sample.value.slice(from, to).trim()) continue;
        for (const target of sample.targets) out.push({ ...e, start: target.start + from, end: target.start + to, text: target.value.slice(from, to) });
      }
    }
    completedValues += batch.length;
    progress?.({ ...plan.stats, completedValues });
  }
  return out.sort((a, b) => a.start - b.start);
}
