import { describe, expect, it } from 'vitest';
import { detect, resolveOverlaps, withPropagation } from './detect';
import { detectRules } from './rules';
import { applyToText, Replacer } from './transform';
import { defaultSettings, type Entity } from './types';

const types = (text: string) => detectRules(text).map((e) => [e.type, e.text]);

describe('rules', () => {
  it('finds structured identifiers', () => {
    const t = types(
      'Email jane.doe@mail.com or call (415) 555-0134. SSN 123-45-6789, card 4111 1111 1111 1111, IP 10.0.0.12.',
    );
    expect(t).toContainEqual(['EMAIL', 'jane.doe@mail.com']);
    expect(t).toContainEqual(['PHONE', '(415) 555-0134']);
    expect(t).toContainEqual(['SSN', '123-45-6789']);
    expect(t).toContainEqual(['CREDIT_CARD', '4111 1111 1111 1111']);
    expect(t).toContainEqual(['IP_ADDRESS', '10.0.0.12']);
  });

  it('needs a digit in labelled IDs', () => {
    expect(types('Open Account settings, then Insurance member no. XHM449201773.')).toEqual([['ID_NUMBER', 'XHM449201773']]);
  });

  it('finds bank transaction IDs', () => {
    const ids = types('Web ID: 381204417 | PPD ID: 5902218836 | Transaction#: 41190563388 | Ref No. AB12345').map((t) => t[1]);
    expect(ids).toEqual(expect.arrayContaining(['381204417', '5902218836', '41190563388', 'AB12345']));
  });

  it('rejects invalid checksums', () => {
    expect(types('card 4111 1111 1111 1112')).not.toContainEqual(['CREDIT_CARD', '4111 1111 1111 1112']);
    expect(types('SSN 000-12-3456')).not.toContainEqual(['SSN', '000-12-3456']);
  });

  it('finds addresses, dates, ids, ibans', () => {
    const t = types('Lives at 1600 Pennsylvania Avenue, Washington DC 20500. Born March 3, 1984. MRN: 00012345. IBAN GB82 WEST 1234 5698 7654 32');
    expect(t).toContainEqual(['ADDRESS', '1600 Pennsylvania Avenue']);
    expect(t).toContainEqual(['DATE', 'March 3, 1984']);
    expect(t).toContainEqual(['ZIP', '20500']);
    expect(t).toContainEqual(['ID_NUMBER', '00012345']);
    expect(t).toContainEqual(['IBAN', 'GB82 WEST 1234 5698 7654 32']);
  });
});

describe('detect + transform', () => {
  const e = (start: number, end: number, source: Entity['source'], score = 0.9): Entity => ({
    start, end, type: 'PERSON', text: 'x', source, score,
  });

  it('resolves overlaps preferring rule over ml, then longer', () => {
    const r = resolveOverlaps([e(0, 10, 'ml'), e(2, 5, 'rule'), e(20, 30, 'ml'), e(20, 25, 'ml')]);
    expect(r.map((x) => [x.start, x.end])).toEqual([[2, 5], [20, 30]]);
  });

  it('labels consistently and propagates ML names', async () => {
    const text = 'John Smith met Sarah. Later John Smith left. Smith said bye.';
    const ner = async () => [{ start: 0, end: 10, type: 'PERSON', text: 'John Smith', source: 'ml', score: 0.99 } as Entity];
    const ents = await detect(text, defaultSettings(), ner);
    expect(applyToText(text, ents, new Replacer('label'))).toBe('[PERSON_1] met Sarah. Later [PERSON_1] left. [PERSON_2] said bye.');
  });

  it('honours allow and deny lists', async () => {
    const s = { ...defaultSettings(), useML: false, denyList: ['Project Falcon'], allowList: ['support@acme.com'] };
    const text = 'Ask support@acme.com about project falcon.';
    const ents = await detect(text, s);
    expect(applyToText(text, ents, new Replacer('redact'))).toBe('Ask support@acme.com about [REDACTED].');
  });
});

describe('model hit sanity checks', () => {
  it('drops email/phone fragments that are not shaped like one', () => {
    const text = 'Website: acme.com | Email: kelly@acme.com | Phone: call me';
    const ml = (s: string, type: Entity['type']): Entity => {
      const start = text.indexOf(s);
      return { start, end: start + s.length, type, text: s, source: 'ml', score: 0.9 };
    };
    const out = withPropagation(text, [ml('acme', 'EMAIL'), ml('kelly@acme.com', 'EMAIL'), ml('call me', 'PHONE')]);
    expect(out.map((e) => e.text)).toEqual(['kelly@acme.com']);
  });
});
