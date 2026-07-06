---
name: pdf-reader
description: Read PDF files without flooding context — extract page-range text as markdown, pull out figures by ID, render pages to images. Use whenever the user asks about the contents of a PDF file.
argument-hint: "Path to the PDF and what you want from it"
---

Use the `pdfread.py` tool next to this file to read PDFs. It requires
[uv](https://docs.astral.sh/uv/) (the shebang runs it via `uv run`; the first
invocation downloads dependencies and may take a minute).

Run `pdfread.py --help` for full usage. In short:

- `pdfread.py info FILE` — page count, metadata, outline/TOC. Start here.
- `pdfread.py text FILE --pages 10-25` — markdown text for a 1-based page
  range. Figures appear as `[image: p12-img2 640x480px]` placeholders.
- `pdfread.py image FILE p12-img2` — write that figure as a PNG and print its
  path; view it with your file-reading tool.
- `pdfread.py images FILE --pages 12` — list figure IDs on pages.
- `pdfread.py render FILE 7` — render a whole page (or `--rect x0,y0,x1,y1`
  crop) to a PNG; the fallback for scanned pages and anything the text layer
  misses.

## Preserving context on large PDFs

Do not dump a whole document into the main conversation. Instead:

1. Run `info` to get the page count and outline, and partition the document
   into sensible ranges (by chapter, or ~15–25 pages).
2. Spawn a subagent per range with instructions like: "Run
   `<path>/pdfread.py text <file> --pages 10-25` and answer <the user's
   question> / summarize in at most N words. If a `[image: ...]` placeholder
   looks relevant, extract it with the `image` command and look at it."
3. Keep only the summaries/answers in the main conversation and synthesize
   from those. Re-target specific pages yourself only when a summary indicates
   the answer lives there.

## Notes

- There is no OCR: a page with no text layer comes back as just its full-page
  `[image: ...]` placeholder (or a "no extractable text" note) — extract or
  `render` it and read the image visually.
- Extraction is deterministic: image IDs are stable across runs, so a
  subagent's reported ID can be extracted later from the main conversation.
