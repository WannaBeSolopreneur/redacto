/// <reference lib="webworker" />
// pdf.js's worker, started through this wrapper so polyfills load before it.
// Without them, Safari 16 fails inside the worker on Promise.withResolvers.
import '../polyfills';
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
