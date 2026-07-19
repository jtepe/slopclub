# Marquardt — Glossary

Marquardt is Pi's bash-tool guard extension, named after Sven Marquardt, the famous
Berghain bouncer: it decides which commands get in.

Sharpened during the 2026-07-19 design grilling. Supersedes the glossary in the
original design doc where they differ.

- **Guard (extension)**: The Pi extension that intercepts bash tool calls and produces
  a verdict per call. Scoped to the bash tool plus writes to the protected-path set
  (ADR-005).
- **Segment**: One simple command inside the parsed shell structure of a bash tool
  call — including commands inside pipelines, `&&`/`||`/`;` lists, subshells, and
  command substitutions (ADR-002). The unit that lists and classification operate on.
- **Verdict**: The guard's decision for a whole tool call: `allow`, `human-review`,
  or `deny`. Per-segment verdicts combine by taking the most restrictive
  (deny > human-review > judge > allow).
- **Allow list**: Human-curated regexes (anchored, full-segment) whose matches execute
  without review. Weakest precedence.
- **Deny list**: Human-curated regexes whose matches are refused immediately with
  "tool call denied by policy". Strongest precedence; the only source of hard denies.
- **Human-review list**: Regexes whose matches require interactive human approval.
- **Fallthrough**: A segment matching no list and not classified as an ad-hoc script.
  Routed to human review (ADR-001).
- **Ad-hoc script**: An inline code payload delivered to a known interpreter — via
  code flags (`-c`, `-e`, `--eval`) or heredoc/stdin piping (ADR-006). Routed to the
  judge. A file argument (`python foo.py`) is *not* an ad-hoc script.
- **Judge**: A small/fast LLM on the same provider as the main agent (ADR-004) that
  triages ad-hoc scripts as critical / non-critical. A triage filter, not an
  authority: "critical" escalates to human review with the judge's explanation
  (ADR-003); judge failure escalates likewise (ADR-010).
- **Review prompt**: The interactive approval UI. Offers accept, reject, and
  add-to-list (allow or deny, project- or user-scope) (ADR-001, ADR-007). Absent an
  interactive session, review resolves to deny (ADR-011).
- **Guard config**: The list files, protected-path set, and interpreter table. Lives
  at project and user level; writable only by the human, never by the agent through
  any tool (ADR-005, ADR-007).
- **Protected-path set**: Paths whose writes the guard blocks even from non-bash
  tools: guard config, shell rc files, git hooks, PATH-shim directories (ADR-005).
- **Write-then-execute bypass**: Writing a script/hook/Makefile with unguarded tools,
  then triggering it via an allow-listed command. Accepted residual risk outside the
  protected-path set — documented as a Non-Goal; full containment is a sandbox's job.
