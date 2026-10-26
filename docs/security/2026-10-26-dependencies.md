# Dependency remediation — October 26, 2026

The working checkout was updated from **19 known advisory matches (14 high, five medium) to zero** across all **372** supported package/version entries in `package-lock.json`. The final Purple result has complete supported-lockfile coverage, zero skipped entries, no provider errors, and no local sanitizer warnings.

This is **verified dependency remediation**. The malformed ZIP64 denial of service was also reproduced through Redacto's real Office ZIP reader before the update and regression-tested afterward. The other advisory prerequisites were not individually reproduced; zero advisory matches does not certify the entire application free of security issues.

## Changes

| Dependency | Before | After | Reason |
|---|---|---|---|
| @xmldom/xmldom | 0.8.12, URL-pinned | ^0.8.15; locked 0.8.15 | Purple checked 0.8.15 with zero advisory matches. Earlier 0.8.13/0.8.14 retained matches. Replacing the tarball URL with a normal registry range also restores root-constraint visibility to the sanitizer. |
| fflate | ^0.8.2; locked 0.8.2 | ^0.8.3; locked 0.8.3 | Fixes the malformed ZIP64 parser loop. |
| playwright | ^1.49.1; locked 1.49.1 | ^1.55.1; locked 1.55.1 | Purple's checked first patched target; keeps playwright-core at the matching release. |
| wrangler | ^4.149.0; locked 4.149.0 | ^4.153.0; locked 4.153.0 | Published parent upgrade resolves Miniflare 5.20261023.0-beta and Undici 7.30.1. |

No dependency override or local dependency patch was added. Lockfile changes beyond the four direct dependencies are their required Playwright Core, Miniflare, Undici, Workerd and platform binary updates; unrelated versions stayed unchanged. `npm ls` confirms no older nested copies of the four affected packages remain.

Purple's bounded parent search did not identify the new Miniflare route and reported a constraint blocker for Undici. Direct registry inspection of Wrangler 4.153.0 and Miniflare 5.20261023.0-beta established a compatible published parent route; local installation, build, browser checks, Wrangler packaging and its actual local server verified this route.

README now states Node 22.12+ for development. The old and new Wrangler/Miniflare already required Node >=22; Vite already required 22.12+ on that branch. This documents the existing combined tooling floor, rather than introducing a new dependency engine requirement. Verification used Node 22.23.1 and npm.

## Scope and evidence identity

- Transport: native MCP `offense.audit_dependencies`, with lockfiles sanitized by installed Offense 0.5.0.
- Skill updater: current; no skill update or session reload was required.
- Original revision: `1433b667bd549817dfb5b3f5ce2efefb56372558`; remediation was verified as working changes on that base before the deployment and Git publication recorded below.
- Baseline scan UTC: 2026-10-26T22:00:26.997Z.
- Baseline normalized metadata fingerprint: `75b72fe7625109d537f15fc0fb973b47cd689f4140a371e3f3d126a4ed7631a5`.
- Final scan UTC: 2026-10-26T22:06:14.628Z.
- Final normalized metadata fingerprint: `0c536fc7603e38029c1d4f86bd71ea0858a4323cf5b14473c3781080e37bbe36`.
- Final raw lockfile fingerprint from the sanitizer: `f400703099bf982428a15e0674ce5d31ea774bf19c2cf626c0a17e667ab4996e`.
- Final package.json SHA-256: `e1dbfbf394f822a056c7bce676054153c4b0139cb5fd32d40d52b22192ede99f`.
- Final package-lock.json SHA-256: `d25ee359a2b02fc21eabcbe6ad94a6e05760dadd4e7eeb4ea3a3f46168ffbb2f`.
- Final ZIP test SHA-256: `98d8c84dadc7ff3963ecd826db04a73807653b22390a39d533b2b0f5ff41cf01`.
- Raw baseline/final server reports were retained outside the checkout in `/private/tmp/redacto-security-verification-20261026/`.

The initial URL-based xmldom constraint was omitted during sanitization, although its exact locked package version was scanned. The new ordinary registry declaration removes that warning. The temporary candidate's symlinked models/vendor directories were deliberately not followed; the final actual checkout scan has no such warnings. No uncovered manifests, unsupported metadata files, or declared dependency patches were reported. This scope covers npm lockfile metadata, not hidden Python environments, model weights, source-wide analysis, or every possible vulnerability.

## Reproduction and compatibility checks

| Check | Baseline | Updated |
|---|---|---|
| `npm test` | 99/99 existing tests pass | 101/101 tests pass in candidate and final checkout |
| `npm test -- src/formats/zip.test.ts` | Ordinary ZIP passes; malformed ZIP64 assertion fails because the actual reader times out after three seconds | Both tests pass; malformed ZIP64 produces the controlled invalid-Office-document error |
| `npm run lint` | Exit 0 with existing warnings | Exit 0 with existing warnings; final checkout includes 348 warnings, mostly from the installed third-party Offense skill; application-only candidate has 12 |
| `npm run build` | Pass | Pass in candidate and final checkout; existing large-chunk/dynamic-import warnings remain |
| `node scripts/check-spreadsheet-worker.mjs` | Pass | Pass: production worker, 2,000-row CSV redaction/export and XLSX round-trip |
| `UI_TEST_URL=... node scripts/check-spreadsheet-ui.mjs chromium` | Pass | Pass in candidate and final checkout |
| Same UI check with `webkit` | Pass | Pass in candidate and final checkout |
| `APP_URL=... node scripts/check-offline.mjs` | Pass | Pass in candidate and final checkout: TXT/PDF/DOCX/XLSX/CSV/PNG open and scan offline; script exports PDF/XLSX/CSV/PNG. DOCX export remains covered by unchanged unit tests. |
| `npm exec -- wrangler deploy --dry-run --outdir /private/tmp/redacto-wrangler-security-dry-run` | Not run | Pass on candidate; packaging only, no deployment |
| `wrangler dev --local --infer-origin-from-routes=false --ip 127.0.0.1 --port 8790 --inspector-port 0` and local HTTP assertions | Default route-derived origin caused a self-redirect before the update | Pass with the explicit local-origin flag: HTTP 200 for /app/, COOP/COEP/nosniff headers and CSP in app HTML |
| Final native Purple rescan | 19 matches | Zero matches; 372 checked entries; zero skipped; no warnings |

Normal test expectations were not weakened, removed, mocked or adapted for the upgrades. A real subprocess protects the regression suite from an infinite-loop hang; module startup failures are rethrown and cannot count as a parser rejection. The valid archive control passes before and after. The ZIP64 fixture is synthetic and contains no personal data.

Two exploratory direct Miniflare constructor probes used obsolete option shapes and failed validation before reaching a Worker. They are setup errors, not security reproductions or passing compatibility evidence. Actual Wrangler dry-run and the real Wrangler/Miniflare local server replaced those probes.

Wrangler's default origin inference uses the configured production route, which makes the existing HTTP-to-HTTPS canonical redirect appear as a local self-redirect. This was observed before and after the upgrade. The documented CLI flag `--infer-origin-from-routes=false` preserves the actual local origin for this verification; application redirect behavior and production configuration were not changed.

WebKit automation is not real Safari or an iPhone test. No real-device or deployed-site checks were performed.

## Source context and per-advisory outcomes

- **xmldom:** `src/formats/xlsx-codec.ts` parses uploaded XLSX XML and traverses the DOM. Some parser/recursion advisories are relevant to that boundary, but each malicious input was not independently reproduced. Existing DOCTYPE/ENTITY rejection does not establish mitigation of every issue. Production DOCX uses the browser's DOM parser and serializer; DOCX tests use xmldom.
- **fflate:** `src/formats/zip.ts` invokes `unzipSync` on uploaded Office archives. The missing ZIP64 extra-field fixture reproduced an infinite loop through this real wrapper; the same fixture now throws the user-facing invalid-document error.
- **Playwright:** development browser automation dependency. The reported exposure concerns certain macOS browser installer scripts using insecure TLS downloads. Those installer attacks were not executed. Updated Chromium/WebKit browser automation passed.
- **Undici:** development dependency via Wrangler -> Miniflare. Malicious upstream HTTP/EventSource/SRI scenarios were not individually reproduced. The published parent route and actual local Worker serving path were verified.

Every advisory below remains visible as a historical baseline finding. “Absent” means its package/version match is absent from the final resolved-tree scan, not that the advisory was suppressed.

| Package | Severity | Advisory | Outcome |
|---|---|---|---|
| @xmldom/xmldom@0.8.12 | high | [GHSA-27p8-2357-5qqv](https://osv.dev/vulnerability/GHSA-27p8-2357-5qqv) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-2v35-w6hq-6mfw](https://osv.dev/vulnerability/GHSA-2v35-w6hq-6mfw) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-4w3w-2rp5-g8jm](https://osv.dev/vulnerability/GHSA-4w3w-2rp5-g8jm) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | medium | [GHSA-6gmq-8vp8-gcm6](https://osv.dev/vulnerability/GHSA-6gmq-8vp8-gcm6) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | medium | [GHSA-6h8r-xr42-gp59](https://osv.dev/vulnerability/GHSA-6h8r-xr42-gp59) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-8344-3jmq-59r6](https://osv.dev/vulnerability/GHSA-8344-3jmq-59r6) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-93r5-fhx6-vmg9](https://osv.dev/vulnerability/GHSA-93r5-fhx6-vmg9) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-965w-775f-mr7g](https://osv.dev/vulnerability/GHSA-965w-775f-mr7g) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-c7q8-3ch8-vqpv](https://osv.dev/vulnerability/GHSA-c7q8-3ch8-vqpv) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-f6ww-3ggp-fr8h](https://osv.dev/vulnerability/GHSA-f6ww-3ggp-fr8h) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-j759-j44w-7fr8](https://osv.dev/vulnerability/GHSA-j759-j44w-7fr8) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-w2rr-34g9-rvrj](https://osv.dev/vulnerability/GHSA-w2rr-34g9-rvrj) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-x4fp-j954-r2f4](https://osv.dev/vulnerability/GHSA-x4fp-j954-r2f4) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| @xmldom/xmldom@0.8.12 | high | [GHSA-x6wf-f3px-wcqx](https://osv.dev/vulnerability/GHSA-x6wf-f3px-wcqx) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| fflate@0.8.2 | medium | [GHSA-px8p-9vwx-vf98](https://osv.dev/vulnerability/GHSA-px8p-9vwx-vf98) | Absent; actual ZIP64 reader regression verified before/after |
| playwright@1.49.1 | high | [GHSA-7mvr-c777-76hp](https://osv.dev/vulnerability/GHSA-7mvr-c777-76hp) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| undici@7.29.1 | medium | [GHSA-4qv8-2p9j-2685](https://osv.dev/vulnerability/GHSA-4qv8-2p9j-2685) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| undici@7.29.1 | medium | [GHSA-f72v-6w45-q472](https://osv.dev/vulnerability/GHSA-f72v-6w45-q472) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |
| undici@7.29.1 | high | [GHSA-xjj6-f33q-929c](https://osv.dev/vulnerability/GHSA-xjj6-f33q-929c) | Absent; dependency upgrade and compatibility verified; exploit not reproduced |

## Review, delivery and rollback

A read-only independent review found no critical, important or minor code issues. It checked the manifest/lock consistency, resolved dependency chain, regression test and Node documentation, and independently exercised the ordinary/malformed ZIP reader behavior. A follow-up review matched both retained Purple reports, all 19 historical advisory IDs, coverage, fingerprints and current file hashes to this document. It did not independently execute the historical baseline or Purple/browser/build runs; those executions are recorded from the primary agent's results above.

The initial remediation step made no commits, PRs, merges or deployments. The user subsequently authorized deployment and Git publication; that release is recorded below. Existing Offense setup files were preserved.

To undo this remediation, restore only the changed dependency declarations/lockfile and README line from the base revision, remove the new ZIP regression test, then run `npm ci`. This restores the known vulnerable versions, so use it only for an intentional rollback; do not discard unrelated local changes.

## Authorized production release

On October 26, 2026, the user authorized deployment to the existing Cloudflare Worker and publication to the existing GitHub repository.

- Production: https://redacto.cc/app/ (Worker `redacto`).
- Cloudflare version: `38bd13a3-428b-469c-a50a-8b73e82ad2af`.
- Deployment: `b9061a8d-6f8d-440e-a68d-f3ff3fc53a83`, created `2026-10-26T22:24:10.747913Z`; read-back confirmed this exact version receives 100% of traffic.
- Previous production version: `d8c71753-1cc1-4423-be04-841cd025526f`, retained in Cloudflare's deployment history.
- `npm test` passed again before release: 101 tests in 16 files.
- `npm run deploy` rebuilt and deployed successfully through Wrangler 4.153.0. Twelve changed static assets were uploaded; existing R2 models were reused.
- Live landing/app HTML and the new app, ZIP and spreadsheet-worker JavaScript files match the local production build by SHA-256. COOP/COEP headers and the www-to-canonical redirect passed live checks.
- Existing spreadsheet import/review/download tests passed against production in Chromium and WebKit.
- The production offline check passed: all six document formats opened/scanned after cutting network access, with PDF/XLSX/CSV/PNG exports verified by that script.
- Git publication targets `main` at `https://github.com/WannaBeSolopreneur/redacto.git`; this record is included with the dependency fixes, regression test and project-local Offense setup.
