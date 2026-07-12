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
  - [`cf-temp-deploy`](./skills/cf-temp-deploy) — deploy a Worker to Cloudflare
    without an account via [temporary accounts](https://blog.cloudflare.com/temporary-accounts/).

## Releasing

Releases are cut by pushing a version tag. Pushing a `v*` tag triggers the
[`release`](./.github/workflows/release.yml) workflow, which auto-generates
release notes and attaches a `slopclub-<tag>.zip` bundle (containing
`extension/`, `skills/`, `README.md`, and `LICENSE`) to a new GitHub Release.

```bash
git tag -a v0.1.0 -m "First release"
git push origin v0.1.0
```
