# ADR-008: Allow exactly one vetted shell-parser dependency

Status: Accepted (2026-07-19)
Amends: original design doc constraint "no extra dependencies"

## Context

Per-segment matching (ADR-002) requires parsing real bash: pipelines, lists, subshells,
substitutions, heredocs, quoting. A correct hand-rolled parser is a serious project and
a wrong one is a security bypass — worse than the supply-chain risk the no-dependency
constraint was protecting against.

## Decision

The constraint is relaxed for **one** well-audited, version-pinned shell parsing
library (tree-sitter-bash / shell-parse class). All other code remains Pi packages +
node stdlib only.

## Consequences

- The parser dependency must be pinned exactly and reviewed on upgrade; it is part of
  the guard's trusted computing base.
- Parser failure or constructs outside its coverage still fail closed (route to judge
  or human review, never allow) per ADR-002 — so even a parser bug degrades to review,
  not to bypass, as long as "unparsed ⇒ not allowed" is enforced.
