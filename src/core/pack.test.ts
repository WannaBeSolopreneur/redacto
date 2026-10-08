import { describe, expect, it } from 'vitest';
import { packEntities, unpackEntities } from './pack';
import { detectRules } from './rules';

describe('packed entities', () => {
  it('round-trip rule hits exactly, including scores', () => {
    const text = 'Mail ann@example.org or call (555) 010-1234 by 3/4/2025. SSN 123-45-6789.';
    const rules = detectRules(text);
    expect(rules.length).toBeGreaterThan(3);
    expect(unpackEntities(packEntities(rules), text)).toEqual(rules);
  });
});
