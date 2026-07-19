# ADR-011: Without an interactive human, review means deny

Status: Accepted (2026-07-19)

## Context

Three paths now terminate in human review (fallthrough ADR-001, judge-critical ADR-003,
judge-failure ADR-010), but Pi may run non-interactively: CI, headless, background
tasks. The review-time add-to-list affordance also presumes a human.

## Decision

- If no interactive session is attached, anything that would require human review is
  **denied**, with the message: "requires human review; rerun interactively or extend
  the allow list."
- In an interactive session where the user has walked away, the review prompt simply
  blocks until answered — no auto-deny timeout.

## Consequences

- Headless runs only execute allow-listed commands and judge-passed scripts; teams
  automate by curating their allow list, not by weakening the guard.
- No "allow with audit log" headless mode: that would recreate yolo-mode in exactly the
  environments (CI with credentials) where it is most dangerous.
