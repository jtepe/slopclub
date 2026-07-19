# ADR-005: Writes to sensitive paths are guarded (protected-path set)

Status: Accepted (2026-07-19)
Amends: original design doc Non-Goal "guard only the bash tool"

## Context

With write tools unguarded, the agent can disarm or bypass the guard without ever
tripping it: write `evil.sh` / a git hook / a Makefile edit / a change to the guard's
own config, then trigger execution via an innocently allow-listed command
(`git commit`, `npm test`, `make`).

## Decision

Write tools stay unguarded in general, but writes targeting a small **protected-path
set** are denied (or escalated to review):

- the guard's own configuration and list files (see ADR-007)
- shell rc/profile files (`.bashrc`, `.profile`, etc.)
- git hooks (`.git/hooks/`)
- PATH-shim locations (`~/.local/bin` and similar user-writable PATH dirs)

## Consequences

- The self-disarm hole is closed cheaply; the guard cannot be reconfigured by the agent.
- The general write-then-execute bypass (write a script, run it via an allowed build
  command) is **accepted residual risk** and must be documented in Non-Goals — this
  guard is a baseline layer, not a sandbox (Gondolin exists for that).
- The protected set itself lives in guard config, which is in the protected set.
