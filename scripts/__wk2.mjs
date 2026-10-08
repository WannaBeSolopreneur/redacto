import { webkit } from 'playwright';
const ctx = await webkit.launchPersistentContext(process.env.PROFILE, { viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://redacto.cc/app/');
const r = await page.evaluate(async () => {
  const c = await caches.open('transformers-cache');
  let t = performance.now(); const keys = await c.keys(); const tKeys = performance.now() - t;
  const onnx = keys.find((k) => k.url.endsWith('.onnx'));
  t = performance.now(); const res = onnx ? await c.match(onnx) : null; const tMatch = performance.now() - t;
  return { files: keys.length, onnx: onnx?.url.split('/models/')[1], tKeys: Math.round(tKeys), tMatch: Math.round(tMatch), len: res?.headers.get('content-length') };
});
console.log(JSON.stringify(r));
await ctx.close();
