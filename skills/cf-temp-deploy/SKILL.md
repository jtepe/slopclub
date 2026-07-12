---
name: cf-temp-deploy
description: Deploy a Worker (plus bindings like KV, D1, Durable Objects) to Cloudflare without any account or login, using a temporary account via `wrangler deploy --temporary`. Use when the user wants something deployed/live/shared quickly and no Cloudflare credentials are configured.
---

# Deploy To Cloudflare Via A Temporary Account

Cloudflare's temporary accounts for AI agents let you deploy a Worker to a live `workers.dev` URL with **no account, no login,
and no human in the loop**. Wrangler provisions a throwaway account, deploys,
and prints a **claim URL** the user can open to keep the deployment by
attaching it to a real Cloudflare account.

## When to use

- The user wants a Worker/site/API deployed or shared *now* and no Cloudflare
  credentials are available in the environment.
- You are running unattended (background session, CI-like context) and cannot
  complete an OAuth browser flow.

Do **not** use `--temporary` when credentials already exist: the flag errors
out if Wrangler can authenticate via OAuth, `CLOUDFLARE_API_TOKEN`, or a
global API key. In that case, run a normal `wrangler deploy`.

## How to deploy

1. Make sure the project has a valid `wrangler.jsonc`/`wrangler.toml` and
   builds locally.
2. Check the Wrangler version — the flag requires **Wrangler 4.102.0 or
   later** (`npx wrangler --version`; use `npx wrangler@latest` if older).
3. Deploy:

   ```bash
   npx wrangler deploy --temporary
   ```

   Wrangler creates (or reuses) a temporary preview account, deploys the
   Worker to a `workers.dev` URL, and prints the claim URL.

4. **Immediately relay both URLs to the user**: the live `workers.dev` URL
   and the claim URL. The claim URL is the only way for them to keep the
   deployment — never omit or bury it.

## The claim window — critical

- The temporary account is **deleted after 60 minutes** if unclaimed, along
  with the Worker and every resource created for it.
- Claiming: the user opens the claim URL, signs up for or into Cloudflare,
  and the whole temporary account — Worker, databases, and other bindings —
  transfers to their real account.
- Tell the user about the 60-minute deadline explicitly.

## Redeploying and iterating

Wrangler caches the temporary account locally and reuses it while the account
and claim URL are still valid, so you can iterate:

```bash
# fix code, then redeploy to the same temporary account
npx wrangler deploy --temporary
```

The command output states whether the account was created or reused.

## Supported products

Temporary preview accounts support a limited product set:

- Workers (and Workers Static Assets)
- Workers KV
- D1
- Durable Objects
- Hyperdrive
- Queues
- SSL/TLS certificates

If the project needs anything outside this list (e.g. R2, custom domains,
Pages), a temporary deploy will not cover it — say so and fall back to a
normal authenticated deploy.
