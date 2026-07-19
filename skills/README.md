# Agent Skills

* [cf-temp-deploy](./cf-temp-deploy) **Deploy To Cloudflare Without An Account** Ship a Worker (with KV, D1, Durable Objects, etc.) to a live `workers.dev` URL via `wrangler deploy --temporary`, using Cloudflare's [temporary accounts for AI agents](https://blog.cloudflare.com/temporary-accounts/).
* [pdf-reader](./pdf-reader) **Read PDF Files** Extract page-range text as markdown, figures by ID, and BM25-ranked keyword search over pages via the bundled `pdfread.py` CLI (needs a current [uv](https://docs.astral.sh/uv/), or any Python 3.10+ with `pymupdf4llm` installed); includes a subagent workflow to keep context lean.
