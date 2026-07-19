# ADR-006: An ad-hoc script is an inline payload to a known interpreter

Status: Accepted (2026-07-19)

## Context

With ADR-001, unmatched plain commands go to human review while ad-hoc scripts go to
the judge — so the script/command boundary decides the route and must be deterministic.

## Decision

A segment is classified as an **ad-hoc script** iff a known interpreter receives inline
code:

- code-flag invocations: `python -c`, `node -e`/`--eval`, `ruby -e`, `perl -e`,
  `sh|bash -c`, and similar
- heredocs or stdin piped into an interpreter (`python <<EOF`, `echo ... | sh`)

`python foo.py` (a file argument, no inline payload) is a **plain command**: it matches
the lists or falls through to human review per ADR-001.

## Consequences

- Deterministic and explainable routing; no heuristic "looks like code" guessing.
- Executing files the agent previously wrote is not judge-covered — that is part of the
  accepted write-then-execute residual risk (ADR-005). Reviewers of `python foo.py`
  at the review prompt may inspect the file themselves.
- The interpreter and code-flag table is guard config and thus protected (ADR-005).
