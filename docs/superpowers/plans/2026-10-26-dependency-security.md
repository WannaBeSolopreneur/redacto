# Dependency Security Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Execution is authorized by the user's request to complete remediation end to end.

**Goal:** Remediate the 19 Purple advisory matches while preserving document redaction and local deployment tooling.

**Architecture:** Test a candidate in an isolated temporary copy, then apply the verified dependency files and regression test to this checkout. Prefer compatible published parent upgrades; do not force a conflicting transitive override.

**Tech Stack:** npm, React/Vite, Vitest, Playwright, Wrangler, Purple native MCP.

**Spec:** User request in this conversation: fix the reported dependency issues end to end; preserve Redacto's existing privacy and document handling behavior.

## Global Constraints

- Preserve unrelated Offense setup files and existing application tests.
- No automatic publication or deployment.
- Sanitized dependency metadata only is sent to Purple.
- Retain all findings and coverage gaps, including failures in verification.
- Existing baseline: 99 tests pass, lint exits successfully with pre-existing warnings, production build passes with pre-existing chunk warnings.

## Review Focus

- Malformed ZIP64 archives must terminate with a controlled error rather than freezing the file reader.
- Valid DOCX and XLSX files must retain successful import/redaction/export behavior.
- XLSX worker and browser bundling must keep working after the XML parser update.
- Browser automation must still launch and complete review/download flows after Playwright's update.
- Wrangler's parent upgrade must resolve fixed Undici without incompatible overrides or increasing the existing tooling Node floor.

### Task 1: Reproduce the ZIP64 problem before upgrading

**Files:** Create `src/formats/zip.test.ts`.

- [x] Add a subprocess-bounded test of the actual `readZip` wrapper using a hand-built malformed ZIP64 archive; assert a controlled invalid-document error. Include a valid archive assertion using independent literal text.
- [x] Run against baseline dependencies; observe the child timeout as a failure while normal ZIP extraction passes.

### Task 2: Upgrade affected dependencies

**Files:** Modify `package.json`, `package-lock.json`; update README's development Node requirement if needed for existing tooling.

- [x] Use xmldom 0.8.15, fflate 0.8.3, Playwright 1.55.1 and Wrangler 4.153.0. Verify Wrangler -> Miniflare -> Undici resolves to 7.30.1; registry inspection confirms Miniflare 5.20261023.0-beta pins 7.30.1.
- [x] Preserve other locked versions unless changed by required dependency resolution; explain any additional changes.
- [x] Run ZIP64 regression, full tests, lint and build. Run production spreadsheet-worker and browser import/review/export checks.

### Task 3: Deliver and rescan

**Files:** Apply verified dependency files/test to the working checkout; create `docs/security/2026-10-26-dependencies.md` with evidence and limitations.

- [x] Run the same relevant verification in the final checkout; check installed copies with npm ls.
- [x] Prepare final sanitized metadata and invoke native Purple; compare metadata fingerprints and retain all coverage warnings.
- [x] Save a per-finding outcome and baseline/candidate checks, clearly distinguishing reproduced ZIP64 remediation from dependency-only remediation of the other advisories.
- [x] Review the final diff and report the resulting status and any limitations.

## Execution Notes

Ruling: Use an isolated temporary copy rather than creating a Git worktree; it permits candidate dependency installs and tests without affecting the main checkout until the candidate is verified. The final deliverable remains local working changes.

Ruling: Purple's bounded planning search did not find the newer compatible Miniflare parent. Direct registry inspection found Wrangler 4.153.0 -> Miniflare 5.20261023.0-beta -> Undici 7.30.1; verify this published route locally.

Completion evidence: `docs/security/2026-10-26-dependencies.md`. Final scan: 372 checked package/version entries, zero advisory matches, zero skipped entries and no local warnings. Original99 and final101 tests pass; browser, offline, production worker and actual Wrangler local serving checks completed. At initial remediation completion there was no dependency override, commit, publication or deployment; subsequent authorized deployment and Git publication are recorded in the security report.
