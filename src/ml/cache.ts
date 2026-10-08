import { MODELS, type NerModel } from './models';

/**
 * Models downloaded on this device. transformers.js keeps every model file it fetches in the browser's Cache
 * Storage ("transformers-cache"), so a model is downloaded once and loads from the device after that.
 */
const CACHE = 'transformers-cache';
const prefix = (id: string) => `/models/${id}/`;

async function open(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE);
  } catch {
    return null; // Cache Storage disabled (some private modes)
  }
}

/**
 * Model id → size of the models stored on this device.
 *
 * Only the list of stored file names is read, never a file. Opening a stored 67-357 MB model just to read its
 * size (cache.match) can make Safari hold the whole file in memory, and doing that on the start screen, on
 * Activate and in Settings, on top of the model's own load, crashed iPhones once a model was stored. Sizes come
 * from the model catalogue.
 */
export async function downloadedModels(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const cache = await open();
  if (!cache) return out;
  const paths = (await cache.keys()).map((r) => new URL(r.url).pathname);
  for (const m of MODELS) {
    if (paths.some((p) => p.includes(prefix(m.id)) && p.endsWith(`/${m.file}`))) out.set(m.id, m.sizeMB * 1e6);
  }
  return out;
}

export async function isModelDownloaded(model: NerModel): Promise<boolean> {
  return (await downloadedModels()).has(model.id);
}

/** Delete a model's files from this device. It downloads again the next time it's used. */
export async function removeModel(id: string): Promise<void> {
  const cache = await open();
  if (!cache) return;
  for (const r of await cache.keys()) if (new URL(r.url).pathname.includes(prefix(id))) await cache.delete(r);
}
