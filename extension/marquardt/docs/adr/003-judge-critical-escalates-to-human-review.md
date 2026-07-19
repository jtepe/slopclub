# ADR-003: A "critical" judge verdict escalates to human review, not hard deny

Status: Accepted (2026-07-19)
Supersedes: original design doc Scenario 5 (hard deny)

## Context

The judge LLM will produce false positives. A hard deny on a false positive blocks
legitimate work with no recourse, and a hard deny invites the agent LLM into a
rewrite-and-retry loop that doubles as judge probing.

## Decision

When the judge deems a script critical, the guard routes the call to **human review**
and shows the human the judge's explanation of why it was flagged. The judge is a triage
filter, not an authority: humans only see what the judge (or list fallthrough) surfaces,
which is the anti-fatigue goal.

## Consequences

- No unrecoverable false positives; the human is the final authority on flagged scripts.
- The judge's explanation must be part of its required output schema (ADR-009).
- Hard deny remains available only via the deny list, which is human-curated.
