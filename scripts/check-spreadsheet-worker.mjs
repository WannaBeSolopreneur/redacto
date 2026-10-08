// Exercises the actual Vite-built worker in an isolated JS worker. This checks
// bundling and data transfer, not browser UI or Safari compatibility.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { unzipSync } from 'fflate';

const filename = (await readdir('dist/assets')).find((f) => /^table\.worker-.*\.js$/.test(f));
assert.ok(filename, 'Run npm run build first');
const moduleUrl = pathToFileURL(resolve('dist/assets', filename)).href;

async function run(job) {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    global.self = global;
    global.postMessage = (message, options) => parentPort.postMessage(message, options?.transfer);
    // The browser worker has neither Node Buffer nor process globals.
    global.Buffer = undefined;
    global.process = undefined;
    import(workerData.url).then(() => parentPort.on('message', job => {
      if(job.kind === 'load') job.file = new File([job.file.bytes], job.file.name);
      self.onmessage({data: job});
    })).catch(e => parentPort.postMessage({error: e.stack}));
  `, { eval: true, workerData: { url: moduleUrl } });
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker timed out')), 30_000);
      worker.once('error', (e) => { clearTimeout(timeout); reject(e); });
      worker.once('message', (message) => { clearTimeout(timeout); if (message.error) reject(new Error(message.error)); else resolve(message.result); });
      worker.postMessage(job);
    });
  } finally { await worker.terminate(); }
}

const rows = ['Name,Code', ...Array.from({ length: 2000 }, (_, i) => `Person ${i},${String(i).padStart(5, '0')}`)];
const start = performance.now();
const csv = await run({ kind: 'load', file: { name: 'contacts.csv', bytes: rows.join('\n') } });
assert.equal(csv.table.sheets[0].rows.length, 2001);
assert.equal(csv.table.sheets[0].rows[1][1].value, '00000');
// Detections arrive packed as typed arrays (src/core/pack.ts); only the Name column (PERSON, type 0) is structural here.
const { starts, ends, types } = csv.structural;
assert.equal(starts.length, 2000);
assert.ok(types.every((t) => t === 0));
assert.ok(csv.rules.starts instanceof Int32Array);
const structural = [...starts].map((start, i) => ({ start, end: ends[i], text: csv.text.slice(start, ends[i]), type: 'PERSON', source: 'rule', score: 0.99 }));
const { bytes } = await run({ kind: 'export', table: csv.table, entities: structural, mode: 'label' });
const text = new TextDecoder().decode(bytes);
assert.ok(text.includes('[PERSON_1],00000'));
assert.ok(!text.includes('Person 1999'));

// A table without CSV metadata is written as a workbook.
const { bytes: xlsx } = await run({ kind: 'export', table: { ...csv.table, csv: undefined }, entities: structural, mode: 'label' });
const zip = unzipSync(new Uint8Array(xlsx));
assert.ok(zip['xl/worksheets/sheet1.xml']);
const reloaded = await run({ kind: 'load', file: { name: 'clean.xlsx', bytes: xlsx } });
assert.equal(reloaded.table.sheets[0].rows[1][0].value, '[PERSON_1]');
assert.equal(reloaded.table.sheets[0].rows[1][1].value, '00000');
console.log(`Production spreadsheet worker passed: 2,000-row CSV import/redaction/export and XLSX round-trip (${Math.round(performance.now() - start)} ms total on this machine).`);
