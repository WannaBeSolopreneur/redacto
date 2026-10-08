import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'

// Production builds ship a Content-Security-Policy that forbids any network
// request to another origin. Same-origin requests remain permitted for assets.
const CSP = [
  "default-src 'self'",
  "script-src 'self' blob: 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Cross-origin isolation enables SharedArrayBuffer, which onnxruntime-web needs
// to run the model on multiple threads. Without it inference is single-core.
// CORP is also sent so every subresource passes COEP checks on its own.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

// Model weights and wasm barely compress (125 MB -> 105 MB) but on-the-fly gzip
// costs seconds and drops Content-Length, so transformers.js can't preallocate
// and grows its buffer repeatedly (very slow in Firefox: ~28 s vs ~1 s).
// Dropping Accept-Encoding for these paths makes the compression middleware skip them.
const BINARY_ASSET = /^\/(models|vendor)\/|\.(onnx|wasm|traineddata\.gz)$/
const HASHED_ASSET = /^\/assets\//

/**
 * Header policy for dev and preview. Headers are set before the static handler
 * runs so they're present on 304 responses too: WebKit re-checks COEP on a
 * revalidated worker script and blocks it ("access control checks") when a 304
 * arrives without the isolation headers, which broke Safari on page reload.
 */
const serveHeaders = (): Plugin => {
  const apply: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]
    for (const [k, v] of Object.entries(ISOLATION_HEADERS)) res.setHeader(k, v)
    if (BINARY_ASSET.test(path)) {
      delete req.headers['accept-encoding']
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable, no-transform')
    } else if (HASHED_ASSET.test(path)) {
      // Content-hashed build output never changes, so skip revalidation entirely.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
    next()
  }
  return {
    name: 'serve-headers',
    configureServer: (server) => void server.middlewares.use(apply),
    configurePreviewServer: (server) => void server.middlewares.use(apply),
  }
}

const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  plugins: [react(), tailwindcss(), csp(), serveHeaders()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  worker: { format: 'es' },
  // Two pages: the landing page at / and the app at /app/.
  build: {
    rolldownOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
})
