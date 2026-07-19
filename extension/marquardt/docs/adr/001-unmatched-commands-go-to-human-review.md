# ADR-001: Unmatched commands go to human review, with add-to-list affordance

Status: Accepted (2026-07-19)

## Context

The three lists (allow / human-review / deny) plus the ad-hoc-script judge path do not
cover the full input space: a plain command matching no list (e.g. `terraform apply`
before anyone listed it) had no defined route. The routing function must be total.

## Decision

A bash segment that matches no list and is not an ad-hoc script (see ADR-006) is routed
to **human review**. The review prompt offers, besides accept/reject, the option to add
the command (as a pattern) to the allow or deny list, so the lists learn over time and
review fatigue decreases with use.

## Consequences

- The guard is fail-safe by default: nothing novel executes without a human or the judge
  having seen it.
- Early sessions are review-heavy; the add-to-list affordance is the mechanism that
  amortizes this. Persistence of these additions is governed by ADR-007.
- Alternative rejected: judging everything unmatched. Kept the judge scoped to scripts
  (ADR-006) so plain commands stay deterministic and cheap.
