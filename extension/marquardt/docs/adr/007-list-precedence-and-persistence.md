# ADR-007: Precedence deny > review > allow; lists persist in config the agent cannot edit

Status: Accepted (2026-07-19)

## Context

A segment can match multiple lists; review-time "add to list" decisions (ADR-001) need
a durable, tamper-resistant home.

## Decision

- **Precedence:** when a segment matches multiple lists, deny > human-review > allow.
- **Persistence:** review-time additions are written to a project-level or user-level
  guard config file; the review prompt lets the human choose the scope.
- **Tamper resistance:** these config files are in the protected-path set (ADR-005).
  The agent cannot create, edit, or delete them through any tool.

## Consequences

- A broad allow pattern can never override a targeted deny.
- The lists improve monotonically with use without re-asking every session.
- Regex entries should be treated as anchored full-segment matches to avoid accidental
  substring allows (e.g. `rm` matching inside `firm`); loose patterns are a foot-gun
  the config format should discourage.
