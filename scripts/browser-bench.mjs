// Cross-browser model benchmark: load time (cold + cached), inference time and
// accuracy on held-out Nemotron-PII docs, in Chromium, Firefox and WebKit.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/browser-bench.mjs [docs]
import { readFileSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';

const URL = process.env.BENCH_URL ?? 'http://localhost:4173/app/?bench';
const N_DOCS = Number(process.argv[2] ?? 25);
const MODELS = [
  'OpenMed/OpenMed-PII-SuperMedical-Base-125M-v1',
  'OpenMed/OpenMed-PII-LiteClinical-Small-66M-v1',
];

const docs = readFileSync('build-models/eval/nemotron_test.jsonl', 'utf8')
  .trim()
  .split('\n')
  .slice(-N_DOCS) // tail rows: furthest from anything we looked at while debugging
  .map((l) => {
    const r = JSON.parse(l);
    const spans = r.spans;
    return { text: r.text, spans: spans.map((s) => [s.start, s.end]) };
  });

/** Character-level PII recall/precision: what matters for redaction is covering the right characters. */
function score(results) {
  let gold = 0, hit = 0, predChars = 0, predHit = 0;
  for (const { doc, ents } of results) {
    const g = new Uint8Array(doc.text.length), p = new Uint8Array(doc.text.length);
    for (const [s, e] of doc.spans) g.fill(1, s, e);
    for (const e of ents) p.fill(1, e.start, e.end);
    for (let i = 0; i < g.length; i++) {
      if (/\s/.test(doc.text[i])) continue;
      gold += g[i]; hit += g[i] & p[i]; predChars += p[i]; predHit += g[i] & p[i];
    }
  }
  return { recall: hit / gold, precision: predHit / predChars };
}

async function benchOne(browserType, model) {
  const browser = await browserType.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const loadOnce = async () => {
    await page.goto(URL);
    await page.waitForSelector('body[data-bench=ready]', { state: 'attached' });
    return page.evaluate(async (id) => {
      const t0 = performance.now();
      const info = await window.__bench.loadNer(id);
      return { wallMs: Math.round(performance.now() - t0), ...info };
    }, model);
  };
  const row = { browser: browserType.name(), model: model.split('/')[1].replace('OpenMed-PII-', '').replace('-v1', '') };
  try {
    const cold = await loadOnce();
    const results = [];
    let runMs = 0;
    for (const doc of docs) {
      const r = await page.evaluate(([id, text]) => window.__bench.runNer(id, text), [model, doc.text]);
      runMs += r.runMs;
      results.push({ doc, ents: r.entities });
    }
    const warm = await loadOnce(); // same context: model files come from the browser cache
    const { recall, precision } = score(results);
    Object.assign(row, {
      coldLoadS: (cold.wallMs / 1000).toFixed(1),
      cachedLoadS: (warm.wallMs / 1000).toFixed(1),
      threads: cold.threads,
      isolated: cold.isolated,
      msPerDoc: Math.round(runMs / docs.length),
      piiRecall: recall.toFixed(3),
      piiPrecision: precision.toFixed(3),
    });
  } catch (e) {
    row.error = String(e).slice(0, 120);
  }
  if (errors.length) row.pageErrors = errors.slice(0, 2).join(' | ').slice(0, 120);
  await browser.close();
  return row;
}

const rows = [];
for (const bt of [chromium, firefox, webkit]) {
  for (const m of MODELS) {
    const r = await benchOne(bt, m);
    console.log(JSON.stringify(r));
    rows.push(r);
  }
}
console.table(rows);
