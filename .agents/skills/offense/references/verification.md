# Coverage and local verification

The hosted service receives sanitized npm/pnpm lockfile metadata. Source review, unsupported ecosystems, local patches and executable verification stay with the coding agent. An advisory match is retained even when local evidence establishes a mitigation. Nothing in this reference authorizes publication, deployment or a scan beyond the user's task.

## Finish the coverage work

Read `clientCoverage.evidence.coverage` in the saved `audit.json`. Each uncovered manifest, unsupported file and declared local patch has a concrete task. Archived/example directories remain visible until their scope has been explicitly reviewed; their path alone is not grounds to exclude them.

- **Uncovered JavaScript manifest:** find its covering importer or generate and review a lockfile with the project's existing package manager in an isolated checkout. A declared version range is not an installed version. Rescan the resolved tree.
- **Python requirements or pyproject:** use the agent's existing Python tooling and connections to establish exact installed/locked versions and audit them separately. Respect Python versions, markers, extras and platform constraints. Requirements containing ranges, conditional pins, URL references or included files remain unresolved until reviewed; do not upload registry credentials or treat the count of exact-looking pins as a completed scan.
- **Other unsupported managers:** use their existing audit tooling; preserve the ecosystem and scope in the combined report. “Unsupported” is an explicit coverage gap, not a clean result.
- **Local patch:** inspect the patch and advisory prerequisites, confirm the installed package identity and changed file hashes, and run the targeted security regression plus normal checks. A declaration, hash or a passing unrelated test does not establish mitigation.

The helper's local inventory records file paths, patch hashes and next actions. These are saved locally and are not added to the hosted request. It does not run project code, install dependencies or contact another scanner as a side effect of inventory.

Repository identity uses bounded read-only Git index/tree/name listings and hashes raw tracked bytes locally. It never runs Git status/diff refresh or configured clean filters. A clean result requires the raw files, modes and index to match the pinned commit, with no untracked files. Symlinks/submodules, conversion-dependent content, subdirectory-only selections or exhausted byte/file/time limits need explicit review rather than borrowing a clean result. Git hooks, fsmonitor, optional locks and network protocols are disabled for these identity reads.

## Record the compatibility tradeoffs

Before modifying a dependency, run the original normal tests/typechecks/builds. Repeat the same commands in the same workspaces after the patch. Serialize package installation before parallel test runs; overlapping automatic installs can cause patch-application/setup failures that say nothing about security.

Capture changed runtime floors, configuration defaults, removed behavior and test changes. If a unit test starts mocking an iframe, network, storage or another real boundary, identify what it still proves and retain an appropriate integration/browser check. Do not silently substitute a narrower test and call coverage unchanged.

For security proof, use the same advisory-specific regression against the pinned baseline and candidate. Establish that setup completed, the baseline failed for the expected security assertion, and the candidate passed it. A missing module, install error, timeout, generic crash or normal-test pass is insufficient. Review that the reproduced behavior matches the actual advisory prerequisites.

## Optional reviewed evidence file

Use `node /installed/offense/scripts/offense.mjs audit /repository --evidence /outside/repository/verification.json` to attach an explicitly reviewed local record. The helper validates bounded artifact hashes, package/advisory/version identity, current commit, a clean candidate checkout, the current normalized dependency fingerprint and the review expiry. Commit the reviewed candidate in its isolated checkout before accepting commit-bound evidence. A record is not an instruction to execute commands, and the helper does not rerun them.

All artifact paths are relative. Logs and the regression test are relative to the evidence JSON's directory; patch and installed-package files are relative to the selected checkout. Symlinked final files, path traversal and files resolving outside the selected directory are refused. Keep secrets out of recorded logs.

The minimal shape is:

```json
{
  "schemaVersion": "offense.verification.v1",
  "repositoryRevision": "<full candidate commit>",
  "baselineRevision": "<full vulnerable baseline commit>",
  "metadataFingerprint": "<normalized fingerprint from the current audit>",
  "reviewedBy": "<reviewer>",
  "reviewedAt": 1792910000000,
  "expiresAt": 1792996400000,
  "findings": [{
    "advisoryId": "<exact advisory ID>",
    "package": "<package name>",
    "version": "<exact matched installed version>",
    "testCoverageReviewed": true,
    "behaviorChanges": [{
      "description": "<runtime, behavior or test-coverage change>",
      "verification": "<how the changed behavior and remaining integration coverage were checked>"
    }],
    "normalChecks": {
      "baseline": [{
        "id": "normal-tests",
        "workspace": ".",
        "command": ["npm", "test"],
        "exitCode": 0,
        "setupPassed": true,
        "timedOut": false,
        "truncated": false,
        "log": { "path": "baseline/normal.log", "sha256": "<64 hexadecimal characters>" }
      }],
      "candidate": [{
        "id": "normal-tests",
        "workspace": ".",
        "command": ["npm", "test"],
        "exitCode": 0,
        "setupPassed": true,
        "timedOut": false,
        "truncated": false,
        "log": { "path": "candidate/normal.log", "sha256": "<64 hexadecimal characters>" }
      }]
    },
    "securityRegression": {
      "assertionId": "reject-oversize",
      "assertion": "<specific expected secure behavior>",
      "advisoryPrerequisites": "<affected API, configuration and attacker-controlled input>",
      "reviewedFailureReason": "<why the baseline failure demonstrates this security issue rather than broken setup>",
      "test": { "path": "security.test.mjs", "sha256": "<64 hexadecimal characters>" },
      "baseline": {
        "id": "security",
        "workspace": ".",
        "command": ["node", "--test", "security.test.mjs"],
        "exitCode": 1,
        "failureKind": "security_assertion",
        "setupPassed": true,
        "timedOut": false,
        "truncated": false,
        "log": { "path": "baseline/security.log", "sha256": "<64 hexadecimal characters>" }
      },
      "candidate": {
        "id": "security",
        "workspace": ".",
        "command": ["node", "--test", "security.test.mjs"],
        "exitCode": 0,
        "setupPassed": true,
        "timedOut": false,
        "truncated": false,
        "log": { "path": "candidate/security.log", "sha256": "<64 hexadecimal characters>" }
      }
    },
    "patch": {
      "path": "patches/package.patch",
      "sha256": "<reviewed patch SHA-256>",
      "installedManifest": { "path": "node_modules/package/package.json", "sha256": "<installed manifest SHA-256>" },
      "appliedFiles": [{ "path": "node_modules/package/index.js", "sha256": "<reviewed applied file SHA-256>" }]
    }
  }]
}
```

Use actual millisecond timestamps with a review window no longer than 30 days. `behaviorChanges: []` means the reviewer found none. Omit `patch` for an unpatched package. The security regression must emit an exact standalone line `OFFENSE_SECURITY_ASSERTION_FAILED reject-oversize` only for the intended assertion failure, and `OFFENSE_SECURITY_ASSERTION_PASSED reject-oversize` after that same assertion passes. Substitute the actual assertion ID. A marker alone is not proof: the named reviewer must inspect the test, advisory prerequisites, failure reason and command results.

The local assessment distinguishes:

| Status | Required evidence |
| --- | --- |
| `advisory_match` | Insufficient or stale local verification; the match remains visible. |
| `compatibility_verified` | Matching passing baseline/candidate normal checks and reviewed behavior/coverage changes. Security proof is still incomplete. |
| `security_regression_verified` | Compatibility evidence plus a reviewed assertion-specific baseline failure and candidate pass with verified artifacts. |
| `mitigation_verified` | The security regression and compatibility evidence, plus the declared patch hash, installed identity and applied-file integrity. The published vulnerable version remains an advisory match. |

The assessment applies only to exact matching advisory/package/version records in this audit. Evidence for absent or different findings is retained as an explicit warning rather than borrowed for another finding. The helper validates reviewed records; it does not independently attest execution or the correctness of the review. It never hides findings, calls metadata matches “confirmed discoveries,” or increments hosted confirmation/leaderboard metrics.
