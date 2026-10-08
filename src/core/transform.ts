import type { Entity, EntityType, Mode } from './types';

const FAKE: Partial<Record<EntityType, string[]>> = {
  PERSON: ['Alex Morgan', 'Jordan Lee', 'Taylor Reed', 'Casey Brooks', 'Riley Hayes', 'Morgan Diaz', 'Jamie Patel', 'Avery Chen', 'Quinn Foster', 'Drew Kim'],
  ORG: ['Acme Corp', 'Globex Inc', 'Initech', 'Umbrella LLC', 'Stark Industries', 'Wayne Enterprises'],
  LOCATION: ['Springfield', 'Riverton', 'Lakeside', 'Fairview', 'Greenville', 'Madison'],
  ADDRESS: ['123 Main Street', '456 Oak Avenue', '789 Pine Road', '22 Elm Lane', '9 Cedar Court'],
  EMAIL: ['user1@example.com', 'user2@example.com', 'user3@example.com', 'user4@example.com'],
  PHONE: ['(555) 010-0001', '(555) 010-0002', '(555) 010-0003', '(555) 010-0004'],
  SSN: ['000-00-0001', '000-00-0002', '000-00-0003'],
  CREDIT_CARD: ['0000 0000 0000 0001', '0000 0000 0000 0002'],
  URL: ['https://example.com/1', 'https://example.com/2'],
  DATE: ['01/01/2000', '02/02/2000', '03/03/2000', '04/04/2000'],
  ZIP: ['00001', '00002', '00003'],
  IP_ADDRESS: ['192.0.2.1', '192.0.2.2', '192.0.2.3'],
};

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Identifies "the same value" across occurrences, e.g. every "Maria Gonzalez" in a document. */
export const valueKey = (e: Pick<Entity, 'type' | 'text'>) => `${e.type}:${norm(e.text)}`;

/** Identifies one occurrence. */
export const occurrenceKey = (e: Pick<Entity, 'start' | 'end'>) => `${e.start}:${e.end}`;

/**
 * Produces replacement strings. One instance per document keeps the mapping
 * consistent: the same original always gets the same replacement.
 */
export class Replacer {
  private map = new Map<string, string>();
  private counters = new Map<EntityType, number>();
  readonly mode: Mode;

  constructor(mode: Mode) {
    this.mode = mode;
  }

  replace(e: Pick<Entity, 'type' | 'text'>): string {
    if (this.mode === 'redact') return '[REDACTED]';
    const key = valueKey(e);
    let r = this.map.get(key);
    if (r) return r;
    const n = (this.counters.get(e.type) ?? 0) + 1;
    this.counters.set(e.type, n);
    const pool = FAKE[e.type];
    if (this.mode === 'pseudonymize' && pool && n <= pool.length) r = pool[n - 1];
    else r = `[${e.type}_${n}]`;
    this.map.set(key, r);
    return r;
  }

  /** original -> replacement, for an audit/key file. */
  mapping(): Array<{ type: string; original: string; replacement: string }> {
    return [...this.map].map(([k, replacement]) => {
      const i = k.indexOf(':');
      return { type: k.slice(0, i), original: k.slice(i + 1), replacement };
    });
  }
}

/** Apply non-overlapping, sorted entities to a string. */
export function applyToText(text: string, entities: Entity[], replacer: Replacer): string {
  let out = '';
  let pos = 0;
  for (const e of entities) {
    out += text.slice(pos, e.start) + replacer.replace(e);
    pos = e.end;
  }
  return out + text.slice(pos);
}
