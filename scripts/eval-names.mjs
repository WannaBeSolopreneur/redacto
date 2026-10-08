// Name recall / false alarms on scripts/hard-names.json, per model, through the real
// browser pipeline (?bench). Needs `npm run preview` running.
// Usage: node scripts/eval-names.mjs [minScore] [model ids...]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BENCH = process.env.BENCH_URL ?? 'http://localhost:4173/app/?bench';
const MIN = Number(process.argv[2] ?? 0.5);
const MODELS = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['OpenMed/OpenMed-PII-SuperMedical-Base-125M-v1', 'OpenMed/OpenMed-PII-LiteClinical-Small-66M-v1'];
const { cases, clean } = JSON.parse(readFileSync(new URL('./hard-names.json', import.meta.url), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ bypassCSP: true });
await page.goto(BENCH);
await page.waitForSelector('body[data-bench=ready]', { state: 'attached' });

for (const model of MODELS) {
  const info = await page.evaluate((m) => window.__bench.loadNer(m), model);
  let found = 0, total = 0, ms = 0;
  const missed = [];
  for (const c of cases) {
    const r = await page.evaluate(([m, t]) => window.__bench.runNer(m, t), [model, c.text]);
    ms += r.runMs;
    const cover = new Uint8Array(c.text.length);
    for (const e of r.entities) if (e.type === 'PERSON' && e.score >= MIN) cover.fill(1, e.start, e.end);
    for (const n of c.names) {
      total++;
      const at = c.text.indexOf(n);
      let ok = true;
      for (let i = at; i < at + n.length; i++) if (!/[\s.]/.test(c.text[i]) && !cover[i]) ok = false;
      if (ok) found++;
      else missed.push(n);
    }
  }
  const falseAlarms = [];
  for (const t of clean) {
    const r = await page.evaluate(([m, x]) => window.__bench.runNer(m, x), [model, t]);
    ms += r.runMs;
    for (const e of r.entities) if (e.type === 'PERSON' && e.score >= MIN) falseAlarms.push(e.text);
  }
  console.log(`\n${model.split('/')[1]}  load ${(info.loadMs / 1000).toFixed(1)}s  ${ms} ms total`);
  console.log(`  names caught ${found}/${total}   false "names" in clean lines: ${falseAlarms.length}`);
  if (missed.length) console.log(`  missed: ${missed.join(' | ')}`);
  if (falseAlarms.length) console.log(`  false alarms: ${falseAlarms.join(' | ')}`);
}
await browser.close();
