import { describe, expect, it } from 'vitest';
import { finalize, withPropagation } from './detect';
import { defaultSettings, type Entity } from './types';

const hit = (text: string, term: string, type: Entity['type'] = 'PERSON'): Entity => ({
  start: text.indexOf(term), end: text.indexOf(term) + term.length, text: term, type, source: 'ml', score: 0.99,
});

describe('indexed name propagation', () => {
  it('reuses known detections without allocating duplicates for already scanned occurrences', () => {
    const text = 'Zyra met Zyra.';
    const first = hit(text, 'Zyra');
    const second = { ...first, start: 9, end: 13 };
    expect(withPropagation(text, [first, second])).toEqual([first, second]);
  });

  it('matches many terms together while preserving full names, parts and scores', () => {
    const text = 'Maria Gonzalez met Ann. Gonzalez greeted Maria and Annette. Ann left.';
    const out = finalize(withPropagation(text, [hit(text, 'Maria Gonzalez'), hit(text, 'Ann')]), defaultSettings());
    expect(out.map((e) => [e.start, e.text])).toEqual([
      [0, 'Maria Gonzalez'], [19, 'Ann'], [24, 'Gonzalez'], [41, 'Maria'], [60, 'Ann'],
    ]);
    expect(out.at(-1)?.score).toBeCloseTo(0.9405);
  });

  it('respects unicode word boundaries and punctuation inside names', () => {
    const text = 'José said José. Joséé left. A.B. Labs met A.B. Labs.';
    const settings = defaultSettings();
    settings.enabled.ORG = true;
    const out = finalize(withPropagation(text, [hit(text, 'José'), hit(text, 'A.B. Labs', 'ORG')]), settings);
    expect(out.map((e) => e.text)).toEqual(['José', 'José', 'A.B. Labs', 'A.B. Labs']);
  });
});
