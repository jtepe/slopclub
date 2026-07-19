# ADR-010: Judge failure routes to human review

Status: Accepted (2026-07-19)

## Context

The judge call will fail: API errors, timeouts, rate limits, malformed verdicts
(ADR-009). Failing open creates an inducible bypass (oversized scripts, rate-limit
exhaustion); failing closed to a hard deny bricks script execution during provider
outages.

## Decision

After **one retry** on transient errors, any judge failure escalates the command to
**human review**, annotated "judge unavailable". Never silently allow; never hard-deny.

## Consequences

- Provider outages degrade the experience (more review prompts) but not the security
  posture and not the agent's capability.
- In non-interactive runs this composes with ADR-011: judge failure there means deny.
