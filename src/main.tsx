import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { init } from './state/app'
import App from './ui/App'
import './index.css'

// `?bench` exposes the model loader for scripts/browser-bench.mjs instead of
// rendering the app, so load timings aren't skewed by the app's own preload.
if (new URLSearchParams(location.search).has('bench')) {
  void import('./ml/ner').then((ner) => {
    Object.assign(window, { __bench: ner })
    document.body.dataset.bench = 'ready'
  })
} else {
  init()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
