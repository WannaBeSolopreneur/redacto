// Polyfills for Safari 16.x (macOS 13 and earlier ship it), limited to what our
// dependencies actually call. Each entry names its user; re-check when upgrading them.
// pdf.js's legacy build already bundles its own core-js for Iterator helpers and the
// new Set methods, so those aren't repeated here.
// Imported first in every JS realm we control: the page and our workers.
// core-js only patches what's missing, so modern browsers are unaffected.
import 'core-js/actual/promise/with-resolvers'; // pdf.js (page and worker); Safari 17.4
import 'core-js/actual/array-buffer/transfer-to-fixed-length'; // pdf.js worker, system fonts; Safari 17.4

// Async iteration of ReadableStream (`for await (const chunk of stream)`) is
// missing from Safari in every version so far. pdf.js uses it for page text, and
// transformers.js to store downloaded model files in the browser cache (it swallows
// the error, so without this Safari silently re-downloads the model on every visit).
// (TypeScript's DOM types already declare these members, hence the loose cast.)
if (typeof ReadableStream !== 'undefined') {
  const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
  if (!proto[Symbol.asyncIterator]) {
    proto.values = function (this: ReadableStream, { preventCancel = false } = {}) {
      const reader = this.getReader();
      return {
        async next() {
          try {
            const r = await reader.read();
            if (r.done) reader.releaseLock();
            return r as IteratorResult<unknown>;
          } catch (e) {
            reader.releaseLock();
            throw e;
          }
        },
        async return(value?: unknown) {
          if (!preventCancel) {
            const cancelled = reader.cancel(value);
            reader.releaseLock();
            await cancelled;
          } else reader.releaseLock();
          return { done: true, value } as IteratorResult<unknown>;
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    };
    proto[Symbol.asyncIterator] = proto.values;
  }
}
