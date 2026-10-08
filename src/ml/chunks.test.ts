import { readFileSync } from 'node:fs';
import { Tokenizer } from '@huggingface/tokenizers';
import { describe, expect, it } from 'vitest';
import * as chunks from './chunks';

const root = 'public/models/OpenMed/OpenMed-PII-SuperMedical-Base-125M-v1/';
const tokenizer = new Tokenizer(JSON.parse(readFileSync(root + 'tokenizer.json', 'utf8')), JSON.parse(readFileSync(root + 'tokenizer_config.json', 'utf8')));
const count = (text: string) => tokenizer.encode(text).ids.length;

describe('model input coverage', () => {
  it('splits dense table text by actual token count without dropping its tail', () => {
    const text = 'A: 9 | '.repeat(160) + 'Zyra Okafor';
    expect(count(text)).toBeGreaterThan(512); // Reproduces the old silent truncation.
    const parts = [...chunks.modelChunks(text, count, 512)];
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => count(p.text) <= 512)).toBe(true);
    expect(parts.at(-1)?.text).toContain('Zyra Okafor');
    const covered = new Uint8Array(text.length);
    for (const p of parts) {
      expect(p.text).toBe(text.slice(p.offset, p.offset + p.text.length));
      covered.fill(1, p.offset, p.offset + p.text.length);
    }
    expect(covered.every(Boolean)).toBe(true);
  });

  it('overlaps chunk boundaries to retain names across a split', () => {
    const text = 'a'.repeat(1195) + ' Zyra Okafor ' + 'b'.repeat(1500);
    const parts = [...chunks.modelChunks(text, (s) => s.length, 1200)];
    expect(parts.some((p) => p.text.includes('Zyra Okafor'))).toBe(true);
    expect(parts.every((p) => p.text.length <= 1200)).toBe(true);
  });

  it('terminates on very dense unicode without splitting surrogate pairs', () => {
    const text = '📞José🧑🏽'.repeat(300);
    const parts = [...chunks.modelChunks(text, count, 512)];
    expect(parts.at(-1)!.offset + parts.at(-1)!.text.length).toBe(text.length);
    expect(parts.every((p) => !/[\uDC00-\uDFFF]/.test(p.text[0]) && !/[\uD800-\uDBFF]/.test(p.text.at(-1)!))).toBe(true);
    expect(parts.every((p) => count(p.text) <= 512)).toBe(true);
  });
});
