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

/** Model id → bytes on this device, for models whose weights are fully stored. */
export async function downloadedModels(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const cache = await open();
  if (!cache) return out;
  const keys = await cache.keys();
  for (const m of MODELS) {
    const files = keys.filter((r) => new URL(r.url).pathname.includes(prefix(m.id)));
    const weights = files.find((r) => r.url.endsWith(`/${m.file}`));
    if (!weights) continue;
    let bytes = 0;
    for (const r of files) {
      const res = await cache.match(r);
      bytes += Number(res?.headers.get('content-length') ?? 0);
    }
    out.set(m.id, bytes || m.sizeMB * 1e6);
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
