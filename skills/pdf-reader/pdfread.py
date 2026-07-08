#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "pymupdf4llm>=0.0.17",
# ]
# ///
"""pdfread — read PDFs efficiently as an AI agent.

Run `pdfread.py --help` for usage and a recommended workflow.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from contextlib import closing
from pathlib import Path
from typing import Any, NoReturn

import pymupdf
import pymupdf4llm

IMG_REF = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
IMG_ID = re.compile(r"^p(\d+)-img(\d+)$")

INDEX_SCHEMA_VERSION = "1"

EPILOG = """\
image IDs:
  Text output marks figures with placeholders like [image: p12-img2 640x480px]
  (page 12, second figure on that page). Placeholders cover both embedded
  raster images and vector drawings (charts, diagrams). Retrieve one with:
      pdfread.py image FILE p12-img2
  which writes a PNG and prints its path, so you can view it with your
  file-reading tool. Tiny decorative images are skipped.

scanned pages:
  Pages without a text layer are reported as such. View them with:
      pdfread.py render FILE PAGE

keyword search:
  pdfread.py search FILE "flux capacitor" ranks pages by BM25 and prints a
  snippet per hit. The first search builds an index cached under
  ~/.cache/pdfread (seconds, keyed by file content); later searches are
  instant. Terms are ANDed and 'term*' matches prefixes; --raw passes the
  query straight to SQLite FTS5 ("exact phrase", OR, NEAR). Only the text
  layer is searched -- scanned pages are invisible to search.

recommended workflow (context-efficient reading of large PDFs):
  For pinpoint questions ("where is X discussed?"), run `search` and read
  only the hit pages with `text --pages`. For broad synthesis:
  1. pdfread.py info FILE           -- page count and outline; plan page ranges
  2. Delegate each range to a subagent with instructions like:
       "Run `pdfread.py text FILE --pages 10-25` and answer <question> /
        summarize in <=N words. Extract images by ID only if needed."
  3. Collect only the summaries/answers; never paste full page text into the
     main conversation.

examples:
  pdfread.py info report.pdf
  pdfread.py search report.pdf "termination fee" --top 5
  pdfread.py text report.pdf --pages 1-5,12
  pdfread.py images report.pdf --pages 12
  pdfread.py image report.pdf p12-img2 --out /tmp
  pdfread.py render report.pdf 7 --dpi 200
  pdfread.py render report.pdf 7 --rect 72,72,400,300
"""


def die(msg: str) -> NoReturn:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def open_pdf(path: str) -> pymupdf.Document:
    p = Path(path)
    if not p.is_file():
        die(f"file not found: {path}")
    try:
        doc = pymupdf.open(p)
    except Exception as exc:
        die(f"cannot open {path}: {exc}")
    if doc.needs_pass:
        die(f"{path} is password-protected")
    if not doc.is_pdf:
        die(f"{path} is not a PDF")
    return doc


def parse_pages(spec: str | None, page_count: int) -> list[int]:
    """Parse a 1-based page spec like '3', '10-25', '1-3,7' into a page list."""
    if not spec:
        return list(range(1, page_count + 1))
    pages: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        m = re.fullmatch(r"(\d+)(?:-(\d+))?", part)
        if not m:
            die(f"bad page range {part!r}; use forms like '3', '10-25', '1-3,7'")
        start = int(m.group(1))
        end = int(m.group(2) or start)
        if start < 1 or end < start:
            die(f"bad page range {part!r}")
        if end > page_count:
            die(f"page {end} out of range; document has {page_count} pages")
        pages.extend(range(start, end + 1))
    return sorted(set(pages))


def page_markdown(
    doc: pymupdf.Document, pages: list[int], image_dir: str
) -> list[dict[str, Any]]:
    """Markdown chunks for 1-based `pages`, with figures written to image_dir."""
    return pymupdf4llm.to_markdown(
        doc,
        pages=[p - 1 for p in pages],
        page_chunks=True,
        write_images=True,
        image_path=image_dir,
        image_format="png",
        show_progress=False,
    )


def image_dims(path: str) -> str:
    try:
        pix = pymupdf.Pixmap(path)
        return f"{pix.width}x{pix.height}px"
    except Exception:
        return ""


def replace_refs(
    text: str, page_no: int, collect: list[tuple[str, str, str]] | None = None
) -> str:
    """Replace markdown image refs with [image: pN-imgK WxHpx] placeholders."""
    counter = 0

    def sub(m: re.Match[str]) -> str:
        nonlocal counter
        counter += 1
        img_id = f"p{page_no}-img{counter}"
        dims = image_dims(m.group(1))
        if collect is not None:
            collect.append((img_id, m.group(1), dims))
        return f"[image: {img_id}{' ' + dims if dims else ''}]"

    return IMG_REF.sub(sub, text)


def out_path(args: argparse.Namespace, doc_path: str, name: str) -> Path:
    out_dir = Path(args.out) if args.out else Path(doc_path).resolve().parent
    if not out_dir.is_dir():
        die(f"output directory does not exist: {out_dir}")
    return out_dir / f"{Path(doc_path).stem}-{name}.png"


def cmd_info(args: argparse.Namespace) -> None:
    doc = open_pdf(args.file)
    meta = doc.metadata or {}
    print(f"file: {args.file}")
    print(f"pages: {doc.page_count}")
    for key in ("title", "author", "subject"):
        if meta.get(key):
            print(f"{key}: {meta[key]}")
    toc = doc.get_toc(simple=True)
    if toc:
        print("\noutline (level, title, page):")
        for level, title, page in toc:
            print(f"{'  ' * (level - 1)}- {title} .... p{page}")
    else:
        print(
            "\nno outline/TOC embedded; skim `text --pages 1-3` to find the structure"
        )


def cmd_text(args: argparse.Namespace) -> None:
    doc = open_pdf(args.file)
    pages = parse_pages(args.pages, doc.page_count)
    parts: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        for page_no, chunk in zip(pages, page_markdown(doc, pages, tmp)):
            body = replace_refs(chunk["text"], page_no).strip()
            parts.append(f"<!-- page {page_no} -->")
            if body:
                parts.append(body)
            else:
                parts.append(
                    f"*[page {page_no} has no extractable text or figures — "
                    f"likely scanned; view it with: "
                    f"pdfread.py render {args.file} {page_no}]*"
                )
    print("\n\n".join(parts))


def cmd_images(args: argparse.Namespace) -> None:
    doc = open_pdf(args.file)
    pages = parse_pages(args.pages, doc.page_count)
    found = 0
    with tempfile.TemporaryDirectory() as tmp:
        for page_no, chunk in zip(pages, page_markdown(doc, pages, tmp)):
            refs: list[tuple[str, str, str]] = []
            replace_refs(chunk["text"], page_no, collect=refs)
            for img_id, _, dims in refs:
                print(f"{img_id}\t{dims}")
                found += 1
    if not found:
        print(f"no figures found on page(s) {args.pages or 'all'}", file=sys.stderr)


def cmd_image(args: argparse.Namespace) -> None:
    m = IMG_ID.match(args.id)
    if not m:
        die(f"bad image ID {args.id!r}; expected form p<page>-img<n>, e.g. p12-img2")
    page_no, index = int(m.group(1)), int(m.group(2))
    doc = open_pdf(args.file)
    if page_no < 1 or page_no > doc.page_count:
        die(f"page {page_no} out of range; document has {doc.page_count} pages")
    with tempfile.TemporaryDirectory() as tmp:
        chunk = page_markdown(doc, [page_no], tmp)[0]
        refs: list[tuple[str, str, str]] = []
        replace_refs(chunk["text"], page_no, collect=refs)
        if index > len(refs):
            have = ", ".join(r[0] for r in refs) or "none"
            die(f"no image {args.id}; page {page_no} has: {have}")
        img_id, src, dims = refs[index - 1]
        dest = out_path(args, args.file, img_id)
        shutil.copyfile(src, dest)
    print(f"{dest}{'  ' + dims if dims else ''}")


def cmd_render(args: argparse.Namespace) -> None:
    doc = open_pdf(args.file)
    if args.page < 1 or args.page > doc.page_count:
        die(f"page {args.page} out of range; document has {doc.page_count} pages")
    page = doc[args.page - 1]
    clip = None
    name = f"p{args.page}"
    if args.rect:
        try:
            x0, y0, x1, y1 = (float(v) for v in args.rect.split(","))
        except ValueError:
            die(f"bad --rect {args.rect!r}; expected x0,y0,x1,y1 in PDF points")
        clip = pymupdf.Rect(x0, y0, x1, y1)
        name += "-crop"
    dest = out_path(args, args.file, name)
    pix = page.get_pixmap(dpi=args.dpi, clip=clip)
    pix.save(dest)
    print(f"{dest}  {pix.width}x{pix.height}px")


def index_path(pdf: Path) -> Path:
    """Cache location for the FTS index, keyed by file content."""
    digest = hashlib.sha256()
    with pdf.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    cache = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    cache = cache / "pdfread"
    cache.mkdir(parents=True, exist_ok=True)
    return cache / f"{digest.hexdigest()[:16]}.sqlite"


def open_index_ro(dest: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{dest}?mode=ro", uri=True)


def index_valid(dest: Path) -> bool:
    if not dest.is_file():
        return False
    try:
        with closing(open_index_ro(dest)) as con:
            row = con.execute("SELECT value FROM meta WHERE key='version'").fetchone()
        return row is not None and row[0] == INDEX_SCHEMA_VERSION
    except sqlite3.Error:
        return False


def build_index(pdf_path: str, dest: Path) -> None:
    """Index every page's text layer into a fresh FTS5 database at dest.

    Builds into a temp file and renames it into place, so concurrent
    builders never leave a corrupt index behind.
    """
    doc = open_pdf(pdf_path)
    tmp = dest.with_name(f"{dest.name}.tmp{os.getpid()}")
    try:
        with closing(sqlite3.connect(tmp)) as con:
            try:
                con.execute(
                    "CREATE VIRTUAL TABLE pages USING "
                    "fts5(body, tokenize='unicode61 remove_diacritics 2')"
                )
            except sqlite3.OperationalError:
                die(
                    "this Python's sqlite3 lacks FTS5 (unusually old or "
                    "stripped-down SQLite build); run via uv or use a Python "
                    "whose SQLite includes FTS5 -- most modern builds do"
                )
            con.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
            empty = 0
            with con:
                for page_no in range(1, doc.page_count + 1):
                    text: str = doc[page_no - 1].get_text()
                    if not text.strip():
                        empty += 1
                    con.execute(
                        "INSERT INTO pages(rowid, body) VALUES(?, ?)",
                        (page_no, text),
                    )
                con.executemany(
                    "INSERT INTO meta VALUES(?, ?)",
                    [
                        ("version", INDEX_SCHEMA_VERSION),
                        ("source", str(Path(pdf_path).resolve())),
                        ("pages", str(doc.page_count)),
                        ("empty_pages", str(empty)),
                    ],
                )
        os.replace(tmp, dest)
    finally:
        tmp.unlink(missing_ok=True)


def fts_query(raw: str) -> str:
    """Quote each term against FTS5 syntax; AND them, keep trailing-* prefixes."""
    terms: list[str] = []
    for token in raw.split():
        prefix = "*" if token.endswith("*") else ""
        token = token.rstrip("*").replace('"', '""')
        if token:
            terms.append(f'"{token}"{prefix}')
    if not terms:
        die("empty search query")
    return " AND ".join(terms)


def cmd_search(args: argparse.Namespace) -> None:
    pdf = Path(args.file)
    if not pdf.is_file():
        die(f"file not found: {args.file}")
    dest = index_path(pdf)
    if args.rebuild:
        dest.unlink(missing_ok=True)
    if not index_valid(dest):
        build_index(args.file, dest)
    query = args.query if args.raw else fts_query(args.query)
    with closing(open_index_ro(dest)) as con:
        meta = dict(con.execute("SELECT key, value FROM meta"))
        note = ""
        if int(meta["empty_pages"]):
            note = (
                f", {meta['empty_pages']} without text layer "
                "(not searchable -- use `render`)"
            )
        print(f"index: {meta['pages']} pages{note}")
        try:
            rows = con.execute(
                "SELECT rowid, -bm25(pages), snippet(pages, 0, '«', "
                "'»', '…', 10) FROM pages WHERE pages MATCH ? "
                "ORDER BY bm25(pages) LIMIT ?",
                (query, args.top),
            ).fetchall()
        except sqlite3.OperationalError as exc:
            die(f"bad FTS5 query {args.query!r}: {exc}")
    if not rows:
        print(
            f"no pages match {args.query!r}; try fewer terms or prefixes like 'term*'",
            file=sys.stderr,
        )
        return
    for page_no, score, snippet in rows:
        print(f"p{page_no}\tscore {score:.1f}\t{' '.join(snippet.split())}")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="pdfread.py",
        description="Read PDFs efficiently as an AI agent: extract page-range "
        "text as markdown (figures become [image: pN-imgK] placeholders), "
        "search pages by keyword, extract figures by ID as PNGs, render "
        "pages, inspect the outline.",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", metavar="COMMAND")

    p = sub.add_parser(
        "info", help="page count, metadata, and outline/TOC — start here"
    )
    p.add_argument("file", help="path to the PDF")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser(
        "search",
        help="BM25-ranked pages matching keywords, with snippets",
    )
    p.add_argument("file", help="path to the PDF")
    p.add_argument(
        "query",
        help="keywords, ANDed; 'term*' matches prefixes; see --raw",
    )
    p.add_argument("--top", type=int, default=10, help="max pages to list (default 10)")
    p.add_argument(
        "--raw",
        action="store_true",
        help='pass the query as raw FTS5 syntax ("exact phrase", OR, NEAR)',
    )
    p.add_argument(
        "--rebuild", action="store_true", help="force rebuilding the cached index"
    )
    p.set_defaults(func=cmd_search)

    p = sub.add_parser(
        "text",
        help="extract text of a page range as markdown with image placeholders",
    )
    p.add_argument("file", help="path to the PDF")
    p.add_argument(
        "--pages",
        help="1-based pages, e.g. '3', '10-25', '1-3,7' (default: all pages)",
    )
    p.set_defaults(func=cmd_text)

    p = sub.add_parser("images", help="list figure IDs and pixel sizes for pages")
    p.add_argument("file", help="path to the PDF")
    p.add_argument("--pages", help="1-based pages (default: all pages; can be slow)")
    p.set_defaults(func=cmd_images)

    p = sub.add_parser(
        "image", help="extract one figure by ID to a PNG and print its path"
    )
    p.add_argument("file", help="path to the PDF")
    p.add_argument("id", help="figure ID from text/images output, e.g. p12-img2")
    p.add_argument("--out", help="output directory (default: next to the PDF)")
    p.set_defaults(func=cmd_image)

    p = sub.add_parser(
        "render",
        help="render a full page (or a crop) to a PNG and print its path",
    )
    p.add_argument("file", help="path to the PDF")
    p.add_argument("page", type=int, help="1-based page number")
    p.add_argument("--rect", help="crop rectangle x0,y0,x1,y1 in PDF points")
    p.add_argument("--dpi", type=int, default=150, help="resolution (default 150)")
    p.add_argument("--out", help="output directory (default: next to the PDF)")
    p.set_defaults(func=cmd_render)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)
    args.func(args)


if __name__ == "__main__":
    main()
