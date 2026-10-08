// Algorithm benchmark with synthetic PII; excludes model download/inference.
// Bundles the real TypeScript modules in memory; creates no generated files.
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

async function module(input) {
  const build = await rolldown({ input });
  try {
    const { output } = await build.generate({ format: 'esm' });
    assert.equal(output.length, 1);
    return await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
  } finally { await build.close(); }
}
const [tables, scans, core] = await Promise.all([
  module('src/formats/table.ts'), module('src/ml/table-scan.ts'), module('src/core/detect.ts'),
]);

const rows = [['Name', 'Email', 'Notes'], ...Array.from({ length: 10_000 }, (_, i) => [
  `Client ${i % 100}`, `client${i % 100}@example.org`, `Called Zyra Okafor about issue ${i % 20}`,
])].map((row) => row.map((value) => ({ value })));
const doc = tables.buildTable([{ name: 'Data', rows }]);
const known = core.ruleCandidates(doc.text, [], doc.structural);
const start = performance.now();
const plan = scans.planTableScan(doc.table, known);
let modelCalls = 0, modelCharacters = 0;
const findings = await scans.scanTable(plan, async (text) => {
  modelCalls++; modelCharacters += text.length;
  return [...text.matchAll(/Zyra Okafor/g)].map((m) => ({ start: m.index, end: m.index + 11, text: m[0], type: 'PERSON', score: 0.99, source: 'ml' }));
});
assert.equal(findings.length, 10_000);
assert.equal(plan.stats.ruleCoveredCells, 20_000);
console.log(JSON.stringify({
  scenario: '10,000-row CSV, name/email columns and 20 repeated note values',
  ...plan.stats, originalModelCharacters: doc.text.length, optimizedModelCharacters: modelCharacters,
  modelCalls, reductionPercent: Number((100 * (1 - modelCharacters / doc.text.length)).toFixed(2)),
  algorithmMs: Math.round(performance.now() - start), excludes: 'actual model inference and download',
}, null, 2));

// Compare the former one-regex-per-name search with the real shared index.
const terms = Array.from({ length: 5_000 }, (_, i) => `Client${String(i).padStart(5, '0')}`);
const text = Array.from({ length: 10 }, () => terms.join(' ')).join('\n');
const entities = terms.map((term, i) => ({ start: i * 12, end: i * 12 + 11, text: term, type: 'PERSON', score: 0.99, source: 'ml' }));
const before = performance.now();
let legacyMatches = 0;
for (const term of terms) for (const _match of text.matchAll(new RegExp(`(?<![\\w])${term}(?![\\w])`, 'g'))) legacyMatches++;
const legacyMs = Math.round(performance.now() - before);
const indexedStart = performance.now();
const repeated = core.withPropagation(text, entities);
const indexedMs = Math.round(performance.now() - indexedStart);
assert.equal(legacyMatches, 50_000);
assert.equal(repeated.length, 50_000);
console.log(JSON.stringify({ scenario: '5,000 distinct names, 50,000 occurrences', legacyMs, indexedMs, matches: repeated.length }, null, 2));
