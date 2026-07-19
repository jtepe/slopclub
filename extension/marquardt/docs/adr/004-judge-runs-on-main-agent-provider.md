# ADR-004: The judge runs on the same provider as the main agent

Status: Accepted (2026-07-19)

## Context

In a confidential environment, shipping ad-hoc scripts (which may embed secrets pulled
from context) to a *new* cloud endpoint would itself be an exfiltration channel. The
judge also sits on the latency path of every script execution.

## Decision

The judge reuses Pi's already-configured provider and credentials, preferably with a
small/fast model from that provider. No new trust relationship is created: script
content already flows to this provider as conversation and tool-result context.

## Consequences

- No new data-flow surface; the confidentiality boundary stays where it already was.
- Judge availability is coupled to the main provider — an outage degrades to human
  review per ADR-010, it does not brick the agent.
- A local-model option was rejected for now: it conflicts with the minimal-dependency
  constraint and small local models judge poorly. Can be revisited as configuration.
