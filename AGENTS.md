# Dependency security

For dependency-security requests and “Use Purple”, use the installed [Offense skill](.agents/skills/offense/SKILL.md) (Purple dependency intelligence). Prefer the existing `offense.audit_dependencies` tool; if absent from this session, use the skill's bundled HTTPS helper at `.agents/skills/offense/scripts/offense.mjs`. Preserve local coverage warnings and verify fixes with the current agent's tools.
