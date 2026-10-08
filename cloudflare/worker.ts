/**
 * Redacto on Cloudflare: static assets from the build, AI models from R2, all on one origin.
 *
 * Models are too big for static assets (25 MiB per file), so they live in an R2 bucket and are streamed through
 * this Worker at /models/*. Serving them from the same origin keeps the app's Content-Security-Policy intact: the
 * browser never talks to any other site.
 *
 * The Worker runs first on every request so the headers in README → Hosting are on every response, 304s included.
 */

// Minimal shapes of the bindings, so this file needs no extra type packages.
interface R2ObjectLike {
  size: number;
  httpEtag: string;
  range?: { offset?: number; length?: number };
  writeHttpMetadata(headers: Headers): void;
  body?: ReadableStream;
}
interface Env {
  /** The one public address. Other hosts (www, workers.dev) redirect here. */
  CANONICAL_HOST?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  MODELS: { get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<R2ObjectLike | null> };
}

const ISOLATION: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const YEAR = 'public, max-age=31536000, immutable';

/** Model weights and wasm barely compress, and compression drops Content-Length (slow loads): never transform them. */
function cacheControl(path: string): string | null {
  if (/^\/(models|vendor)\//.test(path) || /\.(onnx|wasm|traineddata\.gz)$/.test(path)) return `${YEAR}, no-transform`;
  if (path.startsWith('/assets/')) return YEAR; // content-hashed build output
  return null; // HTML and the rest: Cloudflare's default (revalidate)
}

async function model(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const object = await env.MODELS.get(key, { range: request.headers, onlyIf: request.headers });
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  if (!headers.has('Content-Type')) headers.set('Content-Type', key.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  if (!object.body) return new Response(null, { status: 304, headers }); // the If-None-Match precondition matched
  const range = object.range;
  if (range && request.headers.has('Range')) {
    const offset = range.offset ?? 0, length = range.length ?? object.size - offset;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size)); // lets transformers.js preallocate
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // One address, always HTTPS (the app needs a secure context for threads and offline use).
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!local && ((env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST) || url.protocol === 'http:')) {
      if (env.CANONICAL_HOST) url.hostname = env.CANONICAL_HOST;
      url.protocol = 'https:';
      url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    const path = url.pathname;
    const upstream = path.startsWith('/models/') ? await model(request, env, decodeURIComponent(path.slice('/models/'.length))) : await env.ASSETS.fetch(request);
    const response = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(ISOLATION)) response.headers.set(k, v);
    const cache = cacheControl(path);
    if (cache && response.status < 400) response.headers.set('Cache-Control', cache);
    return response;
  },
};
