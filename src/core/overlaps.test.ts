import { describe, expect, it } from 'vitest';
import { resolveOverlaps } from './detect';
import type { Entity } from './types';

const e = (start: number, end: number, source: Entity['source'] = 'rule', score = 1): Entity => ({ start, end, source, score, type: 'PERSON', text: 'name' });

describe('overlap resolution for large tables', () => {
  it('keeps adjacent spans and honors manual priority over containing model spans', () => {
    const input = [e(0, 20, 'ml'), e(4, 8, 'manual'), e(8, 12), e(12, 16), e(4, 9, 'ml')];
    expect(resolveOverlaps(input).map((x) => [x.start, x.end])).toEqual([[4, 8], [8, 12], [12, 16]]);
  });

  it('rejects enclosing and interior overlaps, but allows exact boundary contact', () => {
    expect(resolveOverlaps([e(10, 20, 'manual'), e(0, 30), e(12, 18), e(0, 10), e(20, 30)]).map((x) => [x.start, x.end])).toEqual([[0, 10], [10, 20], [20, 30]]);
  });

  it('handles 50,000 non-overlapping table detections', () => {
    const input = Array.from({ length: 50_000 }, (_, i) => e(i * 10, i * 10 + 5));
    const start = performance.now();
    const result = resolveOverlaps(input);
    console.log(`50,000 detections resolved in ${Math.round(performance.now() - start)} ms`);
    expect(result).toHaveLength(50_000);
    expect(result[49_999].start).toBe(499_990);
  });
});
