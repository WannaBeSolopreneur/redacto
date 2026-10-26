# Client setup

Install only into the user's requested scope. Project scope is the default for this install prompt; add or update the single Offense entry while preserving other servers and settings. Existing customized Offense configuration should be reviewed rather than replaced. Never add authorization headers, tokens or environment secrets: this metadata-only endpoint requires none.

Purple is the product; its dependency-security skill and MCP server are named **offense**. Endpoint: `https://app.purpleteam.sh/mcp` (Streamable HTTP). Tool: `offense.audit_dependencies`.

Installation has three separate results: managed files saved, client configuration verified by that client's own settings/list command, and a callable tool in the active agent session. Report each honestly. Project configuration applies to this checkout; do not imply it installs into other worktrees or all projects.

## Start a new session after installation

End every installation with this explicit instruction: **“Start a new coding-agent session in this same project to load the installed skill and MCP configuration.”** If the installed client also needs a full application or extension restart, describe those exact steps. Do not leave this reminder conditional on a failed tool call.

Files on disk, a working HTTPS helper, or a separate MCP initialization probe do not prove the current agent session has loaded the new capability. Report installation and endpoint verification separately from active-session readiness. Confirm tool discovery in the new session before claiming native MCP is active there.

## Install and update the managed files

Fetch and inspect `scripts/offense.mjs` and `scripts/update.mjs` alongside `SKILL.md`, this reference and `references/verification.md`. Read `https://app.purpleteam.sh/skills/offense/manifest.json`. From the installed directory, run:

```sh
node scripts/update.mjs --skill offense
```

The updater verifies the public release's SHA-256 hashes and records the baseline in `.skill-install.json`. Known unchanged older release files can update safely; unknown or customized files are preserved, with the complete new release staged under `.skill-updates/` for review. It never writes client/MCP settings or unrelated instructions. After reviewing and merging staged files, `node scripts/update.mjs --skill offense --accept-local` records the customized result without treating it as an unmodified upstream file.

Normal helper runs check the manifest automatically. Native MCP-only tasks must invoke this updater first; the hosted server cannot update local files. Applied updates exit 4 and require a new session before continuing; help and preview commands remain offline. Existing installations without the updater need a one-time refresh of these files. A saved older installation will not acquire the updater merely by starting a new session.

## Verify without scanning

Run the installed Node helper after inspecting it:

```sh
node /absolute/path/to/offense/scripts/offense.mjs doctor /absolute/path/to/project
```

Doctor performs bounded, credential-free MCP initialization and tool discovery; it does not audit dependencies or change client configuration. It reports managed-file presence and project-settings observations separately. Only the client's own settings can confirm its effective configuration, and only the agent's actual tool list can confirm the active session. A successful probe must still end with the new-session instruction after installation.

For a later HTTPS audit, the helper writes a separate local `trace.json` containing only fixed stage/outcome enums, aggregate counts, bounded durations and fresh run IDs. It does not send that trace anywhere. `audit ... --no-trace` disables export, and an export failure does not fail the audit. Use the returned path only when `traceStatus` is `saved`; disabled or failed export can leave an older file unchanged. To share minimized diagnostics, share **only `trace.json`**: the full audit, remediation prompt, doctor report and terminal logs can contain project details. A helper trace does not prove that this session loaded MCP or that unobserved agent edits/tests ran.

Use the helper's supported Node transport rather than inventing Python/curl probes. If a request fails, retain its HTTP status, safe request/edge ID and retry hint; an HTML 403 can be an edge-policy problem rather than a missing OAuth credential. Do not request tokens or weaken security settings to make a probe pass. Fall back to the same HTTPS audit capability when native MCP cannot load, and identify that transport in the result.

## Make the installed capability discoverable

Keep existing skill metadata and project instructions. Confirm that generic dependency-security requests and “Use Purple” select this skill. If the client's project instructions have no equivalent routing, append one short section to its supported instructions file, such as `AGENTS.md` for Codex, without replacing content:

> For dependency-security requests, use the installed Offense skill (Purple dependency intelligence). Prefer the existing `offense.audit_dependencies` tool; if absent from this session, use the skill's bundled HTTPS helper. Preserve local coverage warnings and verify fixes with the current agent's tools.

Use the actual installed skill path when adding a project reference. Reuse an equivalent section instead of duplicating it. The install-only request still stops after connection verification and the new-session reminder.

## Codex

Merge this table into the trusted project's `.codex/config.toml`:

```toml
[mcp_servers.offense]
url = "https://app.purpleteam.sh/mcp"
tool_timeout_sec = 120
```

Use `.agents/skills/offense/` for the project skill. Inspect the installed client's help and configuration before using `codex mcp add`; its default can be user-wide, so do not silently broaden a project installation. If project configuration is restricted by host policy, use the existing authorized connection or the HTTP helper and report the restriction.

## Claude Code

After checking the installed CLI's help, its project-scoped command is:

```sh
claude mcp add --transport http offense --scope project https://app.purpleteam.sh/mcp
```

The equivalent project `.mcp.json` entry is:

```json
{"mcpServers":{"offense":{"type":"http","url":"https://app.purpleteam.sh/mcp"}}}
```

Use `.claude/skills/offense/` for the project skill. Do not replace an existing `.mcp.json` document with this example; merge its single entry. Preserve the client's native project-trust checks.

## Cursor

Merge the following single entry into `.cursor/mcp.json`:

```json
{"mcpServers":{"offense":{"url":"https://app.purpleteam.sh/mcp"}}}
```

Use the installed client's documented project skill or rules mechanism for these instructions. Confirm the server is enabled and its tool is available; a saved file alone does not prove connectivity.

## Other agents and constrained environments

Discover the client's documented MCP installation mechanism and its existing Offense connection before writing settings. Use its supported project skill location. If remote MCP is unsupported, the bundled `offense.mjs audit` helper calls the same hosted capability through HTTPS; do not install a different provider or request a second OAuth flow. If filesystem, Node.js, repository access or network permission is absent, report that specific missing capability.

After adding the server, initialize it and list tools through the client's documented workflow. Verify `offense.audit_dependencies` is listed. An install-only request stops after verification and the new-session reminder above. In the new session, the user can ask: “Check my dependencies for security issues and fix anything critical.”

Official references (checked October 24, 2026): [Codex MCP configuration](https://developers.openai.com/codex/mcp), [Claude Code MCP setup and scopes](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://cursor.com/docs/mcp). Recheck the installed client's documentation if its configuration differs.
