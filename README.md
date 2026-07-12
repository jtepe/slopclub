<p align="center">
  <img src="./assets/logo2.png" width="300" alt="slopclub logo — agents in a club">
</p>

# Slopclub

AI agent stuff like extensions, skills, prompts, \<insert next best thing\>.
These are mostly targeted at [pi](https://github.com/earendil-works/pi), but
some stuff can probably be used with other harnesses.

This strictly personal stuff but feel free to use it. ([License](./LICENSE)).

## Content

- [`extension/`](./extension) — pi extensions
  - [`shizzle-mode.ts`](./extension/shizzle-mode.ts) — toggle a laid-back, casual
    shizzle conversational style via `/shizzle`.
- [`skills/`](./skills) — agent skills

## Releasing

Releases are cut by pushing a version tag. Pushing a `v*` tag triggers the
[`release`](./.github/workflows/release.yml) workflow, which auto-generates
release notes and attaches a `slopclub-<tag>.zip` bundle (containing
`extension/`, `skills/`, `README.md`, and `LICENSE`) to a new GitHub Release.

```bash
git tag -a v0.1.0 -m "First release"
git push origin v0.1.0
```
