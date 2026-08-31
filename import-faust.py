"""
import-faust.py
Parse Faust (Goethe) from three sources and insert into LangoSoft SQLite DB.

  German   : https://www.gutenberg.org/cache/epub/2229/pg2229-images.html
  English  : https://www.gutenberg.org/cache/epub/14591/pg14591-images.html (Bayard Taylor)
  Ukrainian: https://www.ukrlib.com.ua/world/printit.php?tid=145  (pages 1-29, windows-1251)

Usage:
  python import-faust.py --dry-run         # parse only, print chapter/para counts
  python import-faust.py                   # insert into DB
  python import-faust.py --skip-ukr        # skip Ukrainian (faster)
  python import-faust.py --ukr-pages 5     # fetch only first 5 Ukrainian pages
"""

import argparse
import re
import sqlite3
import ssl
import sys
import time
import urllib.request

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_ssl = ssl.create_default_context()
_ssl.check_hostname = False
_ssl.verify_mode    = ssl.CERT_NONE

DB_PATH   = "backend/LangoSoft.Api/langosoft.db"
GERMAN_URL  = "https://www.gutenberg.org/cache/epub/2229/pg2229-images.html"
ENGLISH_URL = "https://www.gutenberg.org/cache/epub/14591/pg14591-images.html"
UKR_BASE    = "https://www.ukrlib.com.ua/world/printit.php?tid=145"
UKR_PAGES   = 5   # 5 pages is enough to complete the 3 preamble scenes

BOOK_TITLE  = "Faust, Part One"
BOOK_AUTHOR = "Johann Wolfgang von Goethe"
BOOK_LANG   = "de"


# ─── HTTP ────────────────────────────────────────────────────────────────────

def fetch(url: str, encoding: str = "utf-8") -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_ssl) as r:
        raw = r.read()
    return raw.decode(encoding, errors="replace")


# ─── HTML helpers ────────────────────────────────────────────────────────────

def _unescape(s: str) -> str:
    return (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
             .replace("&nbsp;", " ").replace("&#160;", " ")
             .replace("&#8212;", "—").replace("&mdash;", "—")
             .replace("&#8216;", "'").replace("&#8217;", "'")
             .replace("&lsquo;", "'").replace("&rsquo;", "'")
             .replace("&#8220;", '"').replace("&#8221;", '"')
             .replace("&ldquo;", '"').replace("&rdquo;", '"'))


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html)


def _block_to_lines(html_block: str) -> list[str]:
    """Convert an HTML fragment to a list of non-empty text lines."""
    html_block = re.sub(r"<br\s*/?>", "\n", html_block, flags=re.IGNORECASE)
    text = _unescape(_strip_tags(html_block))
    return [l.strip() for l in text.split("\n") if l.strip()]


# ─── German parser ───────────────────────────────────────────────────────────
# Structure: bare <h2><a id="chapNN"></a>Title</h2> then <p>line<br>line<br></p> stanzas

def parse_german(html: str) -> list[dict]:
    """Return list of {title, stanzas} — one entry per <h2> section with verse content."""
    chapters: list[dict] = []

    parts = re.split(r"<h2>", html, flags=re.IGNORECASE)
    for part in parts[1:]:
        m = re.match(r"(?:<a[^>]+></a>)?([^<]*)</h2>(.*)", part, re.DOTALL | re.IGNORECASE)
        if not m:
            continue
        title   = m.group(1).strip()
        content = m.group(2)

        # Each <p>…</p> is one stanza (German Gutenberg uses one p per stanza)
        stanzas: list[str] = []
        for p_html in re.findall(r"<p[^>]*>(.*?)</p>", content, re.DOTALL | re.IGNORECASE):
            lines = _block_to_lines(p_html)
            if lines:
                stanzas.append("\n".join(lines))

        # Skip sections that are just headers with no verse (Contents, Part dividers)
        if stanzas:
            chapters.append({"title": title, "stanzas": stanzas})

    return chapters


# ─── English parser ──────────────────────────────────────────────────────────
# Structure: <div class="chapter"><h2><a id="..."></a>TITLE</h2>…</div>
# The Taylor translation uses one large <p> per scene with <br> for line breaks
# and blank <br> lines between stanzas — so we split by double-newline, not by <p>.

_EN_SKIP_TITLES = {"PREFACE", "AN GOETHE", "CONTENTS", "FIRST PART", "PART ONE",
                   "TRANSLATOR'S PREFACE", "TRANSLATOR'S NOTE"}


def _html_to_stanzas(content_html: str) -> list[str]:
    """Convert raw HTML content to stanzas.
    Both </p> boundaries and <br><br> blank lines act as stanza separators.
    """
    # </p> marks a stanza break; <br> marks a line break within a stanza
    text = re.sub(r"</p\s*>", "\n\n", content_html, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = _unescape(_strip_tags(text))
    stanzas = []
    for block in re.split(r"\n{2,}", text):
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if lines:
            stanzas.append("\n".join(lines))
    return stanzas


def parse_english(html: str) -> list[dict]:
    """Return list of {title, stanzas} for verse chapters only (skips front matter)."""
    chapters: list[dict] = []

    parts = re.split(r'<div class="chapter">', html, flags=re.IGNORECASE)
    for part in parts[1:]:
        m = re.search(r"<h2[^>]*>(?:<a[^>]+></a>)?([^<]*)</h2>", part, re.IGNORECASE)
        if not m:
            continue
        title = m.group(1).strip()

        # Skip known non-verse front matter by exact title match
        if title.upper() in _EN_SKIP_TITLES:
            continue

        # Use all content after the h2 (including nested divs, p blocks, etc.)
        content = part[m.end():]
        stanzas = _html_to_stanzas(content)

        # Skip chapters with fewer than 3 stanzas — likely a bare header div
        if len(stanzas) < 3:
            continue

        chapters.append({"title": title, "stanzas": stanzas})

    return chapters


# ─── Ukrainian parser ─────────────────────────────────────────────────────────
# Structure: flat <br /> stream inside <article class="prose" id="content">
# Scene titles are ALL-CAPS Unicode lines; stanzas separated by blank lines.

def _is_ukr_scene_title(line: str) -> bool:
    if not line:
        return False
    stripped = line.strip()
    if not stripped or len(stripped) > 80:
        return False
    # Must be uppercase (no lowercase Ukrainian/Latin letters)
    return stripped == stripped.upper() and re.search(r"[А-ЯҐЄІЇA-Z]", stripped)


def _strip_footnotes(s: str) -> str:
    """Remove inline footnote references like [16] from a string."""
    return re.sub(r"\[\d+\]", "", s).strip()


def _parse_ukr_content(article_html: str) -> list[dict]:
    """Parse combined article HTML into scene-based chapters.

    Scene titles are ALL-CAPS Ukrainian lines.
    Stanzas are separated by blank lines.
    The preamble before the first scene title is discarded.
    """
    # Strip script/style blocks before tag removal so inline ad JS doesn't become stanzas
    article_html = re.sub(r"<script[^>]*>.*?</script>",
                          "", article_html, flags=re.DOTALL | re.IGNORECASE)
    article_html = re.sub(r"<style[^>]*>.*?</style>",
                          "", article_html, flags=re.DOTALL | re.IGNORECASE)

    # Consume br tag AND any trailing whitespace/newline so <br />\n → \n (not \n\n)
    text = re.sub(r"<br\s*/?>[ \t]*\r?\n?", "\n", article_html, flags=re.IGNORECASE)
    text = _unescape(_strip_tags(text))

    lines = text.split("\n")
    chapters: list[dict] = []
    current_title: str | None = None   # None = pre-content preamble (discarded)
    current_lines: list[str] = []

    def flush() -> None:
        if current_title is None:
            return  # discard content before first scene title
        stanzas: list[str] = []
        buf: list[str] = []
        for l in current_lines:
            if l.strip():
                buf.append(l.strip())
            else:
                if buf:
                    stanzas.append("\n".join(buf))
                    buf = []
        if buf:
            stanzas.append("\n".join(buf))
        if stanzas:
            chapters.append({"title": current_title, "stanzas": stanzas})

    for raw_line in lines:
        line = raw_line.strip()
        clean = _strip_footnotes(line)
        if _is_ukr_scene_title(clean):
            flush()
            current_title = clean
            current_lines = []
        else:
            current_lines.append(line)

    flush()
    return chapters


def fetch_ukrainian(n_pages: int, delay: float = 0.5) -> list[dict]:
    """Fetch all Ukrainian pages and parse into chapters."""
    combined_html = ""
    for page in range(1, n_pages + 1):
        url = UKR_BASE if page == 1 else f"{UKR_BASE}&page={page}"
        print(f"  Fetching Ukrainian page {page}/{n_pages}…", end="", flush=True)
        try:
            html = fetch(url, encoding="windows-1251")
        except Exception as e:
            print(f" ERROR: {e}")
            break

        # Extract article content
        m = re.search(
            r'<article[^>]+class="prose"[^>]*id="content"[^>]*>(.*?)</article>',
            html, re.DOTALL | re.IGNORECASE
        )
        if not m:
            # Try alternate attribute order
            m = re.search(
                r'<article[^>]+id="content"[^>]*>(.*?)</article>',
                html, re.DOTALL | re.IGNORECASE
            )
        if m:
            combined_html += m.group(1) + "\n"
            print(" ok")
        else:
            print(" (no article found)")

        if page < n_pages:
            time.sleep(delay)

    return _parse_ukr_content(combined_html)


# ─── DB insertion ─────────────────────────────────────────────────────────────

def insert_book(con: sqlite3.Connection, dry_run: bool) -> int:
    cur = con.cursor()
    cur.execute("SELECT Id FROM Books WHERE Title=?", (BOOK_TITLE,))
    row = cur.fetchone()
    if row:
        book_id = row[0]
        print(f"Book already exists (id={book_id}), reusing.")
        return book_id
    if dry_run:
        print(f"[DRY] Would insert book: {BOOK_TITLE}")
        return -1
    cur.execute(
        "INSERT INTO Books (Title, Author, Language) VALUES (?,?,?)",
        (BOOK_TITLE, BOOK_AUTHOR, BOOK_LANG)
    )
    con.commit()
    book_id = cur.lastrowid
    print(f"Inserted book id={book_id}")
    return book_id


def insert_chapters(
    con: sqlite3.Connection,
    book_id: int,
    german_chapters: list[dict],
    english_chapters: list[dict],
    ukr_chapters: list[dict],
    dry_run: bool,
) -> None:
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM Chapters WHERE BookId=?", (book_id,))
    if cur.fetchone()[0] > 0 and not dry_run:
        print("Chapters already exist for this book — skipping insertion.")
        return

    n_de  = len(german_chapters)
    n_en  = len(english_chapters)
    n_uk  = len(ukr_chapters)
    print(f"\nChapter counts:  DE={n_de}  EN={n_en}  UK={n_uk}")

    total_paras = 0
    for chap_idx, de_ch in enumerate(german_chapters):
        en_ch = english_chapters[chap_idx] if chap_idx < n_en else {"stanzas": []}
        uk_ch = ukr_chapters[chap_idx]     if chap_idx < n_uk else {"stanzas": []}

        title    = de_ch["title"]
        de_stanz = de_ch["stanzas"]
        en_stanz = en_ch["stanzas"]
        uk_stanz = uk_ch["stanzas"]

        n_paras = max(len(de_stanz), len(en_stanz), len(uk_stanz))
        total_paras += n_paras
        print(f"  [{chap_idx:02d}] {title[:50]:50s}  DE={len(de_stanz)} EN={len(en_stanz)} UK={len(uk_stanz)}  → {n_paras} paras")

        if dry_run:
            continue

        cur.execute(
            "INSERT INTO Chapters (BookId, Number, Title) VALUES (?,?,?)",
            (book_id, chap_idx, title)
        )
        chapter_id = cur.lastrowid

        for para_idx in range(n_paras):
            de_text = de_stanz[para_idx] if para_idx < len(de_stanz) else ""
            en_text = en_stanz[para_idx] if para_idx < len(en_stanz) else None
            uk_text = uk_stanz[para_idx] if para_idx < len(uk_stanz) else None

            cur.execute(
                """INSERT INTO Paragraphs
                   (ChapterId, "Index", Text, LongfellowText, UkrainianText)
                   VALUES (?,?,?,?,?)""",
                (chapter_id, para_idx, de_text, en_text, uk_text)
            )

    con.commit()
    print(f"\nTotal paragraphs: {total_paras}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",    action="store_true", help="Parse only, do not write to DB")
    parser.add_argument("--skip-ukr",   action="store_true", help="Skip Ukrainian fetching")
    parser.add_argument("--ukr-pages",  type=int, default=UKR_PAGES)
    parser.add_argument("--delay",      type=float, default=0.5)
    args = parser.parse_args()

    # ── German ──────────────────────────────────────────────────────────────
    print("Fetching German Faust…")
    de_html = fetch(GERMAN_URL)
    german = parse_german(de_html)
    print(f"  {len(german)} sections parsed")

    # ── English ─────────────────────────────────────────────────────────────
    print("Fetching English Faust…")
    en_html = fetch(ENGLISH_URL)
    english = parse_english(en_html)
    print(f"  {len(english)} content chapters parsed")

    # ── Ukrainian ───────────────────────────────────────────────────────────
    ukr: list[dict] = []
    if not args.skip_ukr:
        print(f"Fetching Ukrainian Faust ({args.ukr_pages} pages)…")
        ukr = fetch_ukrainian(args.ukr_pages, delay=args.delay)
        print(f"  {len(ukr)} scenes parsed")

    # ── Align: German is the authority ──────────────────────────────────────
    # German chapters 0-2 = preamble (Zueignung, Vorspiel, Prolog im Himmel)
    # German chapters 3-27 = 25 play scenes
    # English aligns 1:1 after filtering.
    # Ukrainian: ukrlib only uses ALL-CAPS titles for the 3 preamble scenes;
    # individual play scenes have no all-caps markers, so we can only align
    # the first 3 Ukrainian scenes. The rest of the Ukrainian text is discarded.
    if ukr:
        ukr = ukr[:3]  # keep only ПРИСВЯТА / ПРОЛОГ У ТЕАТРІ / ПРОЛОГ НА НЕБІ

    if len(english) != len(german):
        print(f"\nWARN: EN chapters ({len(english)}) ≠ DE chapters ({len(german)})")
        print("  English chapter titles:")
        for i, ch in enumerate(english):
            print(f"    [{i}] {ch['title']}")

    print(f"\nUkrainian scenes kept: {len(ukr)} "
          f"({', '.join(c['title'] for c in ukr) or 'none'})")

    # ── DB ──────────────────────────────────────────────────────────────────
    con = sqlite3.connect(DB_PATH)
    book_id = insert_book(con, args.dry_run)

    if book_id > 0 or args.dry_run:
        insert_chapters(con, book_id if not args.dry_run else -1,
                        german, english, ukr, args.dry_run)

    con.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
