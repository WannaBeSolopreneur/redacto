# Spreadsheet workflow implementation

User authorized implementation on the existing build, keeping its design. This folder has no Git repository; work is performed in place without commits or an isolated checkout.

## Scope

- Shared cell/sheet representation for CSV, TSV and XLSX; stable text offsets connect detection, grid review and export.
- Include every populated cell (including row one and hidden content) in detection. Header interpretation is explicit and switchable per sheet; it never omits the first row from scanning.
- Paginated grid with sheet tabs, per-cell and whole-column redaction, header-context detection, output preview, and preserved per-document view state.
- Fresh values-only Excel export with generic sheet names, no copied formulas, links, comments, metadata, images or original ZIP members. Warn about cached formula values and removed unsupported content. No legacy XLS/XLSM support.
- Preserve CSV delimiters, quoted cells, blank rows and leading-zero strings. Reject malformed quotes and neutralize formula-like strings on export.
- Guard exports against removed documents and changed review/settings revisions. Clear document-bearing custom terms from persistence and workspace reset. Expose clear workspace in the main toolbar.

## Execution / verification

1. Add failing CSV tests for row-one coverage, malformed quoting, TSV, formula injection, and cell projection. Implement shared table adapter and CSV export.
2. Add Excel round-trip tests for hidden sheets/cells, rich/shared strings, cached/missing formulas, metadata removal, dates and literal formula text. Implement reader and clean writer, with import/export work in a cancellable worker.
3. Add state regressions for column/cell choices, switching, header changes, clear and stale exports. Implement session UI state and export guards.
4. Integrate the grid into the existing document pane and findings navigation; preserve the existing design.
5. Run full tests, lint and build. Exercise spreadsheet UI and export in browsers using synthetic fixtures; document any environment limits.

## Known constraints

This delivers clean tabular values, not full Excel fidelity. Formula results may be stale; formulas without a cached value are blank in the clean output and disclosed. Original sheet names are shown for navigation but exported as Sheet 1, Sheet 2, etc. Full PDF virtualization and model replacement are outside this focused change.

## Progress

- Shared grid data, CSV safety/encoding fixes, Excel values-only codec, short-lived cancellable spreadsheet workers: implemented.
- Cell/column controls, per-document view state, finding navigation, undo/redo, clear-workspace confirmation, sensitive-term persistence removal and stale-export guards: implemented.
- npm registry DNS was unavailable. Used the already cached, integrity-pinned `@xmldom/xmldom` package with existing JSZip for a constrained OOXML reader/writer instead of fetching a general spreadsheet library.
- Automated browser access is blocked in this environment: in-app browser bootstrap returns a sandbox metadata error; Chromium and WebKit processes abort at launch. Browser visual/interaction and actual Safari validation remain unverified.
- Production-worker smoke test uses the actual built worker in Node worker_threads. It verifies worker bundling, structured transfer, CSV redaction/export and Excel round-trip; it does not claim browser compatibility or AI accuracy.
- Final verification: all 73 tests across 8 files pass; TypeScript and production build pass; production-worker 2,000-row CSV import/redaction/export and XLSX round-trip pass (244 ms on this machine, excluding AI inference). Lint exits successfully with 19 existing warnings. Existing large-chunk and ineffective dynamic-import build warnings remain.
- Regression coverage includes exact preservation of numeric identifiers beyond JavaScript's safe integer range by exporting them as literal text. Large finding sets now use indexed overlap checks instead of quadratic comparisons.

## CSV inference speed follow-up

User reported slow CSV processing and requested identifying PII once and reusing it across repeats. The old path inferred over the complete generated table text and only then ran a full-document regex search for every unique name.

- The model worker now plans distinct cell values by sheet/column/header context, scans each once, and projects its findings to every identical cell. All unique unknown values remain eligible; partial rule matches do not skip their surrounding free text. Only whole-cell rules scoring at least 0.99 skip AI so lower-confidence patterns still receive a model pass.
- Header changes, including undo/redo, rerun the document because changing column rules can expose previously skipped cells. Request tokens discard superseded results/progress; export remains locked until the current scan settles.
- A shared Aho–Corasick search index replaces one-regex-per-name propagation. Propagation runs inside the worker and avoids duplicating findings already present.
- Verified an existing truncation defect using the installed model tokenizer: 1,120 dense table characters produce 643 tokens against a 512-token model limit. New token-aware overlapping chunks preserve original offsets and disable silent truncation. Real-tokenizer tests cover dense input, the tail of long cells and surrogate pairs.
- Synthetic algorithm benchmark: a 10,000-row table with name/email columns and 20 repeated note values shrinks model input from 913,034 characters to 859 (99.91% reduction); 20,000 rule-covered cells and 9,980 repeats are reused. Planning/projection took 11 ms with a deterministic inference substitute. Separately, matching 5,000 names across 50,000 occurrences fell from 1,880 ms to 44 ms on this machine. These figures exclude actual model inference/download and are not end-to-end browser speed claims. Reproduce with `node scripts/bench-table-scan.mjs`.
- Verification: 90 tests across 13 files pass; TypeScript/production build pass; production spreadsheet worker smoke check passes (261 ms, excluding AI). Lint succeeds with the same 19 existing warnings. Browser/Safari validation remains unavailable; Node's native ONNX runtime also cannot load on this macOS version, so no new actual-model timing or accuracy claim is made.
