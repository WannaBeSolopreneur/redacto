# Redact Local: workspace redesign proposal

Status: proposed design for review; product implementation has not started.

## Product contract

An open-source web app with no login: open a document, detect identifying information locally, review and correct the findings, and export a sanitized copy. Preserve the existing detection engine while replacing fragile orchestration and rebuilding the interface around this workflow.

Assumption: document contents remain on the device. Model and application assets may be downloaded; documents, extracted text, findings, and replacement keys are not uploaded or persisted by default. Browser-only processing is a boundary we can test, not a promise of perfect security or perfect detection.

## Findings from the current code

- `npm test`: 29 tests pass across two core/column test files. These do not establish workflow correctness.
- `npm run build`: fails with nine TypeScript errors. App.tsx consumes `previewText` and `previews`, which are absent from ExportResult and current exporters; PDF cleanup calls a method absent from the installed proxy type.
- App.tsx combines import, detection, review decisions, export, progress, errors, and layout. Import and export completions have no document/revision guard. An obsolete operation can publish into the current workspace. This is a code-level finding; browser reproduction remains to be performed.
- A shared `busy` string represents multiple independent operations. One completion can clear another operation's status.
- Reset does not call LoadedDoc.dispose. useNer's cache retains source text and inference results across documents without a size limit or session-clear operation.
- Visual formats provide page images and box mappings, but the review UI only renders extracted text. The output UI expects previews the exporters do not supply.
- The production CSP allows same-origin connections. Its current comment overstates this as making data exfiltration physically impossible.
- DOCX explicitly leaves embedded images unscanned. PDF OCR normally runs only on pages with little extractable text, so mixed text/image pages need separate coverage handling.

## Alternatives

1. Patch the existing component: quickest initial repair, but leaves operation ownership and review/navigation behavior coupled.
2. Preserve the engine and format adapters, replace session orchestration and UI: recommended. Addresses the observed failures while retaining working model investment.
3. Rewrite the entire app and engine: largest regression surface, with no evidence that replacing the detector is necessary.

## Interaction design

Use one stable document workspace with three stages: Open, Review, Export. Stage navigation changes the view, not document ownership.

Open presents a file drop target and a paste-text option. Show supported formats and the local-processing explanation. Sample content is an explicit action. Advanced detection settings stay collapsed.

Review presents the document centrally, a compact findings panel, and a persistent progress/status area. PDF/image review shows actual pages with selectable redaction overlays; text and tables use format-appropriate views. Selecting a finding scrolls to its location. Provide keyboard-accessible keep/redact controls, manual additions, and undo/redo. Show incomplete OCR/detection coverage beside the affected content.

Export previews the exact revision being exported, names the output format, and explains any fidelity changes. PDF/image outputs are flattened with redactions burned in; editable-format support must clearly state what it has inspected. A changed review decision invalidates the prepared export. Replacement keys are a separate explicit download identified as containing original sensitive values.

Starting a new document clears the old session after confirming loss of review edits, where applicable. Failed imports offer retry or return to the prior usable document. Closing the document releases owned resources and references; do not claim guaranteed memory zeroization in JavaScript.

## Architecture and invariants

UI components dispatch commands to a document-session controller. The controller owns the source document, review decisions, operation status, errors, and export revision. The detector and format adapters remain independently usable services.

Use a typed reducer with explicit workflow states: empty, importing, detecting, reviewing, exporting, and recoverable failure. Track model readiness separately from document processing. View navigation must not initiate processing merely by mounting a screen.

Every operation carries a session ID and operation ID. Every detection/export carries its input revision. Accept results only when those identifiers match the active session and requested revision. Abort supported operations; discard and dispose obsolete results when cancellation is unavailable. Cancel superseded queued inference and serialize access to mutable format resources.

Separate detection inputs from presentation and export settings. Changing replacement style must not rerun inference. Cache inference only within bounded, explicitly owned scopes; clearing a session clears document-bearing cache entries while retaining reusable model weights.

Adapters expose format capabilities, extracted text and positions, coverage warnings, preview preparation, sanitized export, and disposal. Preview and export share the same immutable review snapshot. Exports must not mutate shared source state across concurrent requests.

Download requires a prepared artifact matching the current session and review revision. Pending detection blocks normal export. Failed/partial detection requires explicit acknowledgement of the coverage limitation before any degraded export; it must never appear complete.

## Privacy, coverage, and performance

Keep document state in memory by default; exclude content from logs, analytics, URLs, and persistent browser storage. Audit outbound requests, including same-origin requests. Ship local runtime assets and document required hosting headers. Test supported-format output for retained sensitive content, metadata, annotations, attachments, and embedded material. Unsupported content must produce an actionable coverage warning or block export as appropriate.

First release scope is the current supported formats: text, PDF, common raster images, DOCX, CSV/TSV. Unknown binary formats must be rejected instead of decoded as text. “Any document” is the longer-term direction, not a claim that every format or embedded object is already handled.

Keep inference and OCR off the UI thread where supported. Render long documents incrementally and only retain needed page previews. Bound caches and queued work. Measure cold model startup, warm detection, import/export time, peak memory, and responsiveness using representative small and large fixtures before setting performance budgets.

## Delivery sequence and acceptance

1. Restore build correctness and add regression coverage for switching documents during import/export, stale completions, model switching, and cleanup.
2. Introduce session ownership and revision checks while retaining the existing interface temporarily.
3. Build the new Open/Review/Export workspace and format-appropriate review surfaces.
4. Harden format coverage and exports; verify privacy boundaries and resource lifetimes.
5. Validate accessibility, Chromium/Firefox/WebKit workflows, representative large documents, and open-source setup documentation.

Acceptance requires a passing build and tests, no obsolete result replacing current state, no stale artifact download, navigation preserving review decisions, functional review previews, explicit partial-coverage handling, disposal of owned document resources, and browser checks showing no document content in outbound requests. Passing these checks is not a guarantee that automated detection finds every identifier.
