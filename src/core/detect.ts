import { detectDenyList, detectRules } from './rules';
import type { Entity, Settings } from './types';

export type NerFn = (text: string) => Promise<Entity[]>;

const SOURCE_RANK = { manual: 3, rule: 2, ml: 1 } as const;

/**
 * Resolve overlapping spans. Manual beats rule beats ML; within a source the
 * longer span wins, then the higher score.
 */
export function resolveOverlaps(entities: Entity[]): Entity[] {
  const sorted = [...entities].sort(
    (a, b) =>
      SOURCE_RANK[b.source] - SOURCE_RANK[a.source] ||
      b.end - b.start - (a.end - a.start) ||
      b.score - a.score,
  );
  // Count accepted starts before candidate.end minus accepted ends at/before
  // candidate.start. The difference is exactly the number of overlaps.
  // Coordinate-compressed Fenwick trees keep each query/update O(log n),
  // instead of scanning all earlier findings for every spreadsheet cell.
  const points = [...new Set(sorted.flatMap((e) => [e.start, e.end]))].sort((a, b) => a - b);
  const indices = new Map(points.map((p, i) => [p, i + 1]));
  const starts = new Int32Array(points.length + 1);
  const ends = new Int32Array(points.length + 1);
  const count = (tree: Int32Array, index: number) => {
    let sum = 0;
    for (let i = index; i > 0; i -= i & -i) sum += tree[i];
    return sum;
  };
  const add = (tree: Int32Array, index: number) => {
    for (let i = index; i < tree.length; i += i & -i) tree[i]++;
  };
  const kept: Entity[] = [];
  for (const e of sorted) {
    const start = indices.get(e.start)!, end = indices.get(e.end)!;
    if (count(starts, end - 1) - count(ends, start) === 0) {
      kept.push(e);
      add(starts, start);
      add(ends, end);
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function filterEntities(entities: Entity[], settings: Settings): Entity[] {
  const allow = new Set(settings.allowList.map((t) => t.trim().toLowerCase()).filter(Boolean));
  return entities.filter(
    (e) =>
      e.source === 'manual' ||
      (settings.enabled[e.type] && e.score >= settings.minScore && !allow.has(e.text.trim().toLowerCase())),
  );
}

/** Instant candidates: regex/checksum rules, always-redact terms and format-derived hits (CSV columns). */
export function ruleCandidates(text: string, denyList: string[], structural: Entity[] = []): Entity[] {
  return [...detectRules(text), ...detectDenyList(text, denyList), ...structural];
}

/** Model hits plus every repeat of them elsewhere in the text, since NER models often miss repeats. */
export function withPropagation(text: string, ml: Entity[]): Entity[] {
  const ok = ml.filter(plausible);
  return ok.concat(propagate(text, ok));
}

/**
 * Shape check for model hits on structured types. In context the model will call
 * the "acme" of a website "acme.com" an EMAIL because the same row has
 * "kelly@acme.com"; a span with no "@" can't be an email.
 */
function plausible(e: Entity): boolean {
  const digits = e.text.replace(/\D/g, '').length;
  switch (e.type) {
    case 'EMAIL':
      return e.text.includes('@');
    case 'PHONE':
      return digits >= 6;
    case 'CREDIT_CARD':
      return digits >= 12;
    case 'SSN':
      return digits >= 9;
    case 'IBAN':
    case 'IP_ADDRESS':
      return digits >= 4;
    default:
      return true;
  }
}

/**
 * Candidates → final entity list for the current settings. Cheap, so settings
 * changes (types, confidence, allow list) re-run only this, never the model.
 */
export function finalize(candidates: Entity[], settings: Settings): Entity[] {
  return resolveOverlaps(filterEntities(candidates, settings));
}

/** One-shot detection (rules + optional model). The app runs the stages separately; this is for tests and scripts. */
export async function detect(
  text: string,
  settings: Settings,
  ner?: NerFn,
  onNerError?: (err: unknown) => void,
  structural: Entity[] = [],
): Promise<Entity[]> {
  let found = ruleCandidates(text, settings.denyList, structural);
  if (settings.useML && ner) {
    // A model failure must never block rule-based redaction.
    try {
      found = found.concat(withPropagation(text, await ner(text)));
    } catch (err) {
      onNerError?.(err);
    }
  }
  return finalize(found, settings);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every whole-word, case-insensitive occurrence of `term` in `text`. */
export function occurrences(text: string, term: string): Array<{ start: number; end: number }> {
  const t = term.trim();
  if (!t) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(t)}(?![\\p{L}\\p{N}_])`, 'giu');
  return [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

const PROPAGATE = new Set<Entity['type']>(['PERSON', 'ORG', 'LOCATION']);

function propagate(text: string, ml: Entity[]): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  const existing = new Set(ml.map((e) => `${e.type}:${e.start}:${e.end}`));
  // Only free-text names are worth repeating. Emails, phones and IDs repeat verbatim and
  // the rules catch them; a model fragment of one (the "acme" of "kelly@acme.com") would
  // otherwise be stamped into unrelated text such as a website column.
  const variants = ml.filter((e) => PROPAGATE.has(e.type)).flatMap((e) => {
    const v = [{ e, term: e.text }];
    // "Maria Gonzalez" also covers a later bare "Maria" or "Gonzalez".
    if (e.type === 'PERSON') {
      for (const part of e.text.split(/\s+/)) if (/^[A-Z][a-z'-]{2,}$/.test(part)) v.push({ e, term: part });
    }
    return v;
  });
  const terms: Array<{ e: Entity; term: string }> = [];
  for (const { e, term } of variants) {
    const key = `${e.type}:${term}`;
    if (seen.has(key) || term.length < 3) continue;
    seen.add(key);
    terms.push({ e, term });
  }
  if (!terms.length) return out;

  // Aho–Corasick: build a shared literal search index, then visit the document
  // once instead of scanning its entire text separately for every unique name.
  // Suffix links avoid copying output lists for nested/prefix-heavy dictionaries.
  interface Node { next: Map<string, number>; fail: number; suffix: number; output: number[] }
  const node = (): Node => ({ next: new Map(), fail: 0, suffix: 0, output: [] });
  const nodes: Node[] = [node()];
  terms.forEach(({ term }, index) => {
    let at = 0;
    for (let i = 0; i < term.length; i++) {
      const ch = term[i];
      let next = nodes[at].next.get(ch);
      if (next === undefined) {
        next = nodes.length;
        nodes.push(node());
        nodes[at].next.set(ch, next);
      }
      at = next;
    }
    nodes[at].output.push(index);
  });
  const queue = [...nodes[0].next.values()];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    for (const [ch, next] of nodes[at].next) {
      let fail = nodes[at].fail;
      while (fail && !nodes[fail].next.has(ch)) fail = nodes[fail].fail;
      nodes[next].fail = nodes[fail].next.get(ch) ?? 0;
      const parent = nodes[next].fail;
      nodes[next].suffix = nodes[parent].output.length ? parent : nodes[parent].suffix;
      queue.push(next);
    }
  }
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    while (at && !nodes[at].next.has(ch)) at = nodes[at].fail;
    at = nodes[at].next.get(ch) ?? 0;
    const end = i + 1;
    for (let match = at; match; match = nodes[match].suffix) for (const index of nodes[match].output) {
      const { e, term } = terms[index];
      const start = end - term.length;
      if (/[\p{L}\p{N}_]$/u.test(text.slice(Math.max(0, start - 2), start)) ||
          /^[\p{L}\p{N}_]/u.test(text.slice(end, end + 2))) continue;
      const key = `${e.type}:${start}:${end}`;
      if (existing.has(key)) continue;
      existing.add(key);
      out.push({ ...e, start, end, text: text.slice(start, end), score: e.score * 0.95 });
    }
  }
  return out;
}
