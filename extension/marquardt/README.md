# Marquardt

A bash-tool guard extension for [pi](https://github.com/earendil-works/pi),
named after Sven Marquardt, the famous Berghain bouncer: it decides which
commands get in.

Marquardt intercepts every bash tool call the agent makes and produces a
verdict *before* anything executes:

- **allow** — the command runs silently.
- **deny** — the call is refused with `tool call denied by policy`.
- **human review** — an interactive prompt shows the command and lets you
  accept it once, reject it, or teach the guard by adding it to the allow or
  deny list. In non-interactive sessions, anything that would need review is
  denied instead.

Non-bash tool calls pass through untouched, with one exception: file writes
(`write`, `edit`) and bash redirects targeting the [protected-path
set](#protected-paths) are refused from every tool, so the agent cannot
disarm the guard that constrains it.

## How commands are classified

A bash tool call is parsed (with tree-sitter) into **segments** — the simple
commands inside pipelines, `&&`/`||`/`;` lists, subshells, and command
substitutions. Each segment is classified independently, and the whole call
gets the most restrictive verdict among its segments
(deny > human review > allow).

Per segment, precedence is:

1. **Deny list** match → deny.
2. **Human-review list** match → human review.
3. **Ad-hoc script** (see below) → triaged by the judge.
4. **Allow list** match → allow.
5. Nothing matched (**fallthrough**) → human review.

Note that the deny and review lists outrank the judge, but the allow list
does not — a broad allow pattern can never exempt inline code from triage.

The engine fails closed: a command that cannot be parsed, contains shell
constructs the engine does not confidently understand (loops, conditionals,
assignments, arithmetic, ...), or redirects into a destination it cannot read
statically (variables, substitutions) goes to human review as a whole.

### Ad-hoc scripts and the judge

An **ad-hoc script** is inline code handed to a known interpreter — via a
code flag (`python -c '...'`, `sh -c '...'`, `node -e '...'`), a heredoc, or
a stdin pipe. These are triaged by a **judge LLM** running on the same
provider the agent already uses (preferring a small, fast model from that
provider's catalog — never a new endpoint):

- **non-critical** scripts run without prompting;
- **critical** scripts stop at human review, annotated with the judge's
  explanation;
- a failed or malformed judge call escalates to review annotated
  `judge unavailable`.

`python foo.py` (a file argument, no inline payload) is *not* an ad-hoc
script; it stays a plain command and goes through the lists.

### The review prompt

When a command stops at review, the prompt shows the command, its parsed
segments, and how it got there (list hit, fallthrough, judge verdict). Your
choices:

- **accept (run once)** — run it this time; the guard asks again next time.
- **reject** — refuse the call.
- **add to allow list (always run)** / **add to deny list (always refuse)** —
  persist one pattern per segment to the guard config at your choice of
  **project** or **user** scope. The addition takes effect immediately, so
  the same command never asks again.

Persisted patterns are exact, regex-escaped matches of the reviewed
segments — teaching the guard never widens policy beyond what you saw. You
can hand-edit the config afterwards to generalize a pattern.

## Configuration

Guard config is read from two files, both optional:

- **User scope:** `~/.pi/marquardt.json`
- **Project scope:** `<project>/.pi/marquardt.json`

The two files are merged additively (user + project + built-in defaults);
config can only extend the guard's reach, never shrink the built-in
protections. A missing or malformed file contributes empty lists, which is
the most restrictive reading. All keys are optional:

```json
{
  "allow": ["git status", "git diff( .*)?", "ls( -[a-zA-Z]+)*( \\S+)?"],
  "humanReview": ["git push( .*)?"],
  "deny": ["sudo .*", "rm -rf /.*"],
  "interpreters": {
    "deno": ["eval"]
  },
  "protectedPaths": [".env", "secrets/"]
}
```

### `allow` / `humanReview` / `deny`

Lists of regexes matched against each segment as **anchored, full-segment**
patterns (an entry `p` matches like `^(?:p)$`). A pattern that fails to
compile matches nothing, so a broken entry can only tighten policy. Matching
is against the segment's literal text including any redirects, e.g.
`echo hi > out.txt` is one segment.

### `interpreters`

Maps interpreter names to the flags that accept inline code, used for ad-hoc
script detection. Entries override the built-in table per name. Defaults:

| Interpreter | Code flags |
| --- | --- |
| `sh`, `bash`, `zsh`, `dash`, `ksh` | `-c` |
| `python`, `python2`, `python3` | `-c` |
| `node` | `-e`, `--eval`, `-p`, `--print` |
| `ruby` | `-e` |
| `perl` | `-e`, `-E` |
| `php` | `-r` |

### Protected paths

`protectedPaths` extends the built-in protected set; it can never shrink it.
Each entry names a file or directory root; the named path and everything
below it are protected from writes by *any* tool. Patterns starting with `~`
or `/` anchor at that absolute location; bare patterns match at any depth
(so `.git/hooks` covers the hook directory of every repository the agent
could reach).

The built-in set covers the guard's own config files (`.pi/marquardt.json`),
git hook directories (`.git/hooks`), shell rc/profile files (`~/.bashrc`,
`~/.zshrc`, `~/.profile`, fish config, and friends), and user-writable
PATH-shim directories (`~/.local/bin`, `~/bin`).

## Limitations

The guard vets what the bash tool is asked to run; it is not a sandbox.
Notably, writing a script or Makefile with ordinary file tools and then
triggering it via an allow-listed command (the *write-then-execute bypass*)
is accepted residual risk outside the protected-path set — full containment
is a sandbox's job.
