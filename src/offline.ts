/**
 * Fetch everything the app may need later, in the background, so it keeps working if the network goes away
 * after load ("turn off your Wi-Fi"). The model is loaded first by the app itself; this covers the rest:
 * every format's code, the workers, pdf.js's fonts and image decoders, and the OCR engine.
 *
 * Code and vendor files are kept by the browser's HTTP cache (they are served with long-lived caching, see
 * README → Hosting); the OCR engine stays loaded in memory.
 */
export async function warmForOffline(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const [, , , , tables, ocr] = await Promise.all([
    import('./formats/pdf'), // also starts the pdf.js worker
    import('./formats/docx'),
    import('./formats/image'),
    import('./formats/zip'),
    import('./formats/table-client'),
    import('./formats/ocr'),
  ]);
  const files: string[] = await fetch(`${base}vendor/offline.json`).then((r) => r.json());
  // A few at a time: this is background work and shouldn't compete with what the user is doing.
  for (let i = 0; i < files.length; i += 6) {
    await Promise.all(files.slice(i, i + 6).map((f) => fetch(base + f).then((r) => r.arrayBuffer())));
  }
  await tables.warmTableWorker();
  await ocr.warmOcr();
}
