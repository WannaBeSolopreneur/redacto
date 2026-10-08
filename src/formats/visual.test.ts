import { describe, expect, it } from 'vitest';
import type { Entity } from '../core/types';
import { TextMap } from './visual';

const ent = (start: number, end: number): Entity => ({ start, end, type: 'DATE', text: '', source: 'rule', score: 1 });

describe('TextMap.rects', () => {
  it('merges a run on one line into a single box', () => {
    const m = new TextMap();
    m.addRun('on March 3', { page: 1, x: 0, y: 100, w: 100, h: 14 });
    const r = m.rects([ent(3, 10)], 0).get(1)!;
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(30);
    expect(r[0].w).toBeCloseTo(70);
  });

  it('gives a wrapped entity one box per line, not one spanning the page', () => {
    // Line boxes are padded (h > line spacing), so consecutive lines overlap slightly.
    const m = new TextMap();
    m.addRun('Hospital on March 3', { page: 1, x: 200, y: 100, w: 190, h: 13.8 });
    m.addBreak('\n');
    m.addRun(', 2025.', { page: 1, x: 16, y: 112, w: 70, h: 13.8 });
    const start = 'Hospital on '.length;
    const r = m.rects([ent(start, start + 'March 3\n, 2025'.length)], 0).get(1)!;
    expect(r).toHaveLength(2);
    expect(r[0].x).toBeCloseTo(320);
    expect(r[1].x).toBeCloseTo(16);
    expect(r[1].x + r[1].w).toBeLessThan(80);
  });
});
