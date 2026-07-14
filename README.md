<p align="center">
  <img src="./assets/logo3.png" alt="slopclub logo — agents in a club">
</p>

# Slopclub

AI agent stuff like extensions, skills, prompts, \<insert next best thing\>.
These are mostly targeted at [pi](https://github.com/earendil-works/pi), but
some stuff can probably be used with other harnesses.

This is strictly personal stuff but feel free to use it. ([License](./LICENSE)).

## Content

- [`extension/`](./extension) — pi extensions
  - [`shizzle-mode.ts`](./extension/shizzle-mode.ts) — toggle a laid-back, casual
    shizzle conversational style via `/shizzle`.
- [`skills/`](./skills) — agent skills

## Installing skills as plugins

The repo doubles as a plugin marketplace (via
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)) for
harnesses that support the plugin marketplace format, such as GitHub Copilot
CLI and Claude Code. Currently the [pdf-reader](./skills/pdf-reader) skill is
exposed as a plugin.

With GitHub Copilot CLI:

```bash
copilot plugin marketplace add jtepe/slopclub
copilot plugin install pdf-reader@slopclub
```

With Claude Code:

```
/plugin marketplace add jtepe/slopclub
/plugin install pdf-reader@slopclub
```

## Releasing

Releases are cut by pushing a version tag. Pushing a `v*` tag triggers the
[`release`](./.github/workflows/release.yml) workflow, which auto-generates
release notes and attaches a `slopclub-<tag>.zip` bundle (containing
`extension/`, `skills/`, `README.md`, and `LICENSE`) to a new GitHub Release.

```bash
git tag -a v0.1.0 -m "First release"
git push origin v0.1.0
```
