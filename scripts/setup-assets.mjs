// Copies runtime assets out of node_modules and downloads model/OCR data once,
// so the app never touches the network at runtime.
import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const vendor = join(root, 'public', 'vendor');

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

// onnxruntime-web wasm (used by transformers.js). Only the plain CPU build is used;
// the asyncify/jsep/jspi variants exist for WebGPU/WebNN.
for (const f of readdirSync(join(nm, 'onnxruntime-web', 'dist'))) {
  if (/^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f)) {
    copy(join(nm, 'onnxruntime-web', 'dist', f), join(vendor, 'ort', f));
  }
}

// tesseract.js worker + core
copy(join(nm, 'tesseract.js', 'dist', 'worker.min.js'), join(vendor, 'tesseract', 'worker.min.js'));
for (const f of readdirSync(join(nm, 'tesseract.js-core'))) {
  if (f.startsWith('tesseract-core') && /\.(js|wasm)$/.test(f)) {
    copy(join(nm, 'tesseract.js-core', f), join(vendor, 'tesseract', 'core', f));
  }
}

// pdf.js resources (cmaps, standard fonts, image decoders, ICC profiles)
for (const d of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  copy(join(nm, 'pdfjs-dist', d), join(vendor, 'pdfjs', d));
}

// Everything pdf.js may fetch later (fonts for PDFs that don't embed theirs, decoders for scanned
// images, CJK character maps). The app prefetches this list so it keeps working offline after load.
const offline = [];
for (const d of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  for (const f of readdirSync(join(vendor, 'pdfjs', d))) {
    if (!/^LICENSE|quickjs|nowasm_fallback/.test(f)) offline.push(`vendor/pdfjs/${d}/${f}`);
  }
}
writeFileSync(join(vendor, 'offline.json'), JSON.stringify(offline));

async function download(url, dest) {
  if (existsSync(dest)) return;
  process.stdout.write(`downloading ${url} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log('ok');
}

// OCR language data (LSTM-only "best_int", matches tesseract.js default OEM)
await download(
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  join(vendor, 'tesseract', 'lang', 'eng.traineddata.gz'),
);

// Fallback NER model, used as published.
for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx']) {
  await download(`https://huggingface.co/Xenova/bert-base-NER/resolve/main/${f}`, join(root, 'public', 'models', 'Xenova/bert-base-NER', f));
}

// The main OpenMed models are converted locally (fused + int8 + verified) by
// scripts/build-models.sh, which needs python3. Keep in sync with src/ml/models.ts.
const OPENMED = ['OpenMed-PII-SuperMedical-Base-125M-v1', 'OpenMed-PII-LiteClinical-Small-66M-v1'];
const missing = OPENMED.filter((m) => !existsSync(join(root, 'public', 'models', 'OpenMed', m, 'onnx', 'model_quantized.onnx')));
if (missing.length) {
  console.warn(`\nOpenMed models not built yet (${missing.join(', ')}).\nRun: npm run models   (one-time, needs python3)\n`);
}

console.log('assets ready');
