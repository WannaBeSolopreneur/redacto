import { describe, expect, it } from 'vitest';
import { ruleCandidates } from '../core/detect';
import { Replacer } from '../core/transform';
import type { Entity } from '../core/types';
import { buildTable, tableOutput } from '../formats/table';
import * as scans from './table-scan';

const table = (rows: string[][]) => buildTable([{ name: 'Data', rows: rows.map((row) => row.map((value) => ({ value }))) }]);
const hit = (text: string, value: string, type: Entity['type'] = 'PERSON'): Entity => ({
  start: text.indexOf(value), end: text.indexOf(value) + value.length, text: value, type, score: 0.99, source: 'ml',
});

describe('spreadsheet inference reuse', () => {
  it('scans repeated cells once and replaces every occurrence with the same label', async () => {
    const doc = table(Array.from({ length: 10_000 }, () => ['Zyra Okafor']));
    const plan = scans.planTableScan(doc.table, []);
    let calls = 0;
    const result = await scans.scanTable(plan, async (text) => { calls++; return [hit(text, 'Zyra Okafor')]; });
    expect(calls).toBe(1);
    expect(result).toHaveLength(10_000);
    expect(tableOutput(doc.table, result, new Replacer('label'))[0].every((row) => row[0] === '[PERSON_1]')).toBe(true);
    expect(plan.stats).toMatchObject({ cells: 10_000, uniqueValues: 1, reusedCells: 9_999 });
  });

  it('skips fully identified cells but still scans unknown text beside a rule match', async () => {
    const doc = table([['Name', 'Notes'], ['Zyra', 'Contact ann@x.org about Nori']]);
    const known = ruleCandidates(doc.text, [], doc.structural);
    const plan = scans.planTableScan(doc.table, known);
    const scanned: string[] = [];
    const result = await scans.scanTable(plan, async (text) => {
      scanned.push(text);
      return text.includes('Nori') ? [hit(text, 'Nori')] : [];
    });
    expect(scanned.join('\n')).not.toContain('Zyra');
    expect(scanned.join('\n')).toContain('Contact ann@x.org about Nori');
    expect(plan.stats.ruleCoveredCells).toBe(1);
    expect(tableOutput(doc.table, [...known, ...result], new Replacer('label'))[0][1]).toEqual(['[PERSON_1]', 'Contact [EMAIL_1] about [PERSON_2]']);
  });

  it('keeps column contexts separate and does not replace generated headers', async () => {
    const doc = table([['Name', 'Notes'], ['Zyra', 'May'], ['Nori', 'May']]);
    const plan = scans.planTableScan(doc.table, [], [true]);
    const result = await scans.scanTable(plan, async (text) => [
      ...[...text.matchAll(/Notes/g)].map((m) => ({ ...hit(text, 'Notes', 'ORG'), start: m.index, end: m.index + 5 })),
      hit(text, 'May', 'DATE'),
    ]);
    // The header cell is real data; generated "Notes:" prefixes are never detections.
    const notes = result.filter((e) => e.type === 'ORG');
    expect(notes).toHaveLength(1);
    expect(notes[0].start).toBe(doc.table.sheets[0].rows[0][1].start);
    expect(result.filter((e) => e.type === 'DATE')).toHaveLength(2);

    const ambiguous = table([['May', 'May']]);
    expect(scans.planTableScan(ambiguous.table, []).stats.uniqueValues).toBe(2);
  });

  it('preserves embedded newlines, unicode offsets and multiple findings inside repeated cells', async () => {
    const value = '📞 José Álvarez\nEmail ann@x.org';
    const doc = table([[value], [value]]);
    const result = await scans.scanTable(scans.planTableScan(doc.table, [], [false]), async (text) => [hit(text, 'José Álvarez'), hit(text, 'ann@x.org', 'EMAIL')]);
    expect(tableOutput(doc.table, result, new Replacer('label'))[0]).toEqual([
      ['📞 [PERSON_1]\nEmail [EMAIL_1]'], ['📞 [PERSON_1]\nEmail [EMAIL_1]'],
    ]);
  });

  it('never discards unknown unique cells or the tail of a long cell', async () => {
    const doc = table([['ordinary'], ['another value'], ['x '.repeat(2_000) + 'Nori']]);
    const scanned: string[] = [];
    const progress: number[] = [];
    const result = await scans.scanTable(scans.planTableScan(doc.table, []), async (text) => {
      scanned.push(text); return text.includes('Nori') ? [hit(text, 'Nori')] : [];
    }, (p) => progress.push(p.completedValues));
    expect(scanned.join('\n')).toContain('ordinary');
    expect(scanned.join('\n')).toContain('another value');
    expect(scanned.join('\n')).toContain('x '.repeat(2_000) + 'Nori');
    expect(result.map((e) => e.text)).toEqual(['Nori']);
    expect(progress.at(-1)).toBe(3);
  });

  it('uses no model calls when every nonempty cell is already identified', async () => {
    const doc = table([['ann@x.org'], ['ann@x.org'], ['']]);
    let calls = 0;
    const plan = scans.planTableScan(doc.table, ruleCandidates(doc.text, []));
    expect(await scans.scanTable(plan, async () => { calls++; return []; })).toEqual([]);
    expect(calls).toBe(0);
    expect(plan.stats.ruleCoveredCells).toBe(2);
  });

  it('does not skip lower-confidence rules that may be filtered out later', () => {
    const doc = table([['+1 415 555 0134']]);
    expect(scans.planTableScan(doc.table, ruleCandidates(doc.text, [])).stats.uniqueValues).toBe(1);
  });
});
