"""
import-faust2.py
Import Goethe's Faust Part 2 into LangoSoft.

German: https://www.gutenberg.org/cache/epub/2230/pg2230-images.html
English: not available on Gutenberg
Ukrainian: https://www.ukrlib.com.ua/world/printit.php?tid=145 pages 10-29
           (Part 2 begins on page 10; scene markers not all-caps so alignment is best-effort)

Usage:
  python import-faust2.py --dry-run
  python import-faust2.py
"""

import argparse, re, sqlite3, ssl, sys, time, urllib.request

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_ssl = ssl.create_default_context()
_ssl.check_hostname = False
_ssl.verify_mode    = ssl.CERT_NONE

DB_PATH    = "backend/LangoSoft.Api/langosoft.db"
GERMAN_URL = "https://www.gutenberg.org/cache/epub/2230/pg2230-images.html"
UKR_BASE   = "https://www.ukrlib.com.ua/world/printit.php?tid=145"
UKR_START  = 10   # Part 2 begins on page 10
UKR_PAGES  = 29   # last page

BOOK_TITLE  = "Faust, Part Two"
BOOK_AUTHOR = "Johann Wolfgang von Goethe"
BOOK_LANG   = "de"


# ─── HTTP ────────────────────────────────────────────────────────────────────

def fetch(url: str, encoding: str = "utf-8") -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_ssl) as r:
        raw = r.read()
    return raw.decode(encoding, errors="replace")


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


# ─── German Part 2 parser ────────────────────────────────────────────────────
# Real HTML structure (pg2230):
#   - Scene/location titles: <p> WITHOUT <br>, WITH margin-top:2-5em, NO margin-left
#   - h4/h5 with ≥2 words and no trailing period: also scene headers (rare, early acts)
#   - h4/h5 speaker names (single word or trailing period): stanza breaks
#   - <p> with <br>: verse stanza (each <p> = one stanza)
#   - <p> without <br>, not a scene title: stage direction, prepended to next verse


def _is_h_scene_header(text: str) -> bool:
    """True if an h4/h5 text is a location header rather than a speaker name."""
    t = text.strip()
    if t.endswith(".") or t.endswith(":"):
        return False          # "FAUST." / "KAISER." = speaker
    words = t.split()
    return len(words) >= 2   # multi-word, no period → location


def _is_p_scene_title(attrs: str, text: str) -> bool:
    """True if a <p> without <br> is a scene/location title."""
    if "margin-top" not in attrs or "margin-left" in attrs:
        return False
    m = re.search(r"margin-top:\s*(\d+)", attrs)
    if not m:
        return False
    mt = int(m.group(1))
    return 2 <= mt <= 5 and "\n" not in text and len(text) <= 80


def parse_german2(html: str) -> list[dict]:
    """Parse German Faust Part 2 HTML into chapters."""
    end = html.find("THE FULL PROJECT GUTENBERG")
    if end > 0:
        html = html[:end]

    chapters:        list[dict] = []
    current_title:   str | None = None
    current_stanzas: list[str]  = []
    current_buf:     list[str]  = []   # current stanza lines
    pending:         list[str]  = []   # speaker names + stage dirs → prepend to next verse
    in_content = False

    def flush_stanza() -> None:
        if current_buf:
            current_stanzas.append("\n".join(current_buf))
            current_buf.clear()

    def flush_chapter() -> None:
        flush_stanza()
        if current_title is not None and current_stanzas:
            chapters.append({"title": current_title, "stanzas": list(current_stanzas)})
        current_stanzas.clear()

    def start_scene(title: str) -> None:
        nonlocal current_title, in_content
        flush_chapter()
        current_title = title
        in_content    = True
        pending.clear()

    for m in re.finditer(
        r"<(h[2-5])[^>]*>(.*?)</\1>|<p([^>]*)>(.*?)</p>",
        html, re.DOTALL | re.IGNORECASE
    ):
        if m.group(1):  # heading
            tag  = m.group(1).lower()
            if tag == "h2":
                continue
            text = _unescape(_strip_tags(m.group(2))).strip()
            if not text:
                continue
            if _is_h_scene_header(text):
                start_scene(text)
            elif in_content:
                flush_stanza()
                pending.append(text)
        else:  # paragraph
            attrs   = m.group(3) or ""
            content = m.group(4) or ""
            has_br  = bool(re.search(r"<br", content, re.IGNORECASE))
            text_nl = re.sub(r"<br\s*/?>", "\n", content, flags=re.IGNORECASE)
            text    = _unescape(_strip_tags(text_nl)).strip()
            if not text:
                continue

            if not has_br:
                if _is_p_scene_title(attrs, text):
                    start_scene(text)
                elif in_content:
                    pending.extend(l.strip() for l in text.split("\n") if l.strip())
            else:
                if not in_content:
                    continue
                lines = [l.strip() for l in text.split("\n") if l.strip()]
                if not lines:
                    continue
                flush_stanza()
                current_buf.extend(pending)
                current_buf.extend(lines)
                pending.clear()

    flush_chapter()
    return chapters


# ─── Ukrainian Part 2 parser ─────────────────────────────────────────────────
# Pages 10-29 cover Part 2. Scene titles are not reliably all-caps,
# so we treat each page's content as one big block per act detected by
# ALL-CAPS Ukrainian lines (if any) or just sequentially split by stanza.

def _is_ukr_scene_title(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 80:
        return False
    return stripped == stripped.upper() and re.search(r"[А-ЯҐЄІЇA-Z]", stripped)


def fetch_ukrainian2(delay: float = 0.5) -> list[dict]:
    """Fetch Ukrainian Part 2 (pages 10-29) and parse into scenes."""
    combined_html = ""
    for page in range(UKR_START, UKR_PAGES + 1):
        url = f"{UKR_BASE}&page={page}"
        print(f"  Fetching Ukrainian page {page}/{UKR_PAGES}…", end="", flush=True)
        try:
            html = fetch(url, encoding="windows-1251")
        except Exception as e:
            print(f" ERROR: {e}")
            break
        m = re.search(r'<article[^>]+id="content"[^>]*>(.*?)</article>',
                      html, re.DOTALL | re.IGNORECASE)
        if m:
            combined_html += m.group(1) + "\n"
            print(" ok")
        else:
            print(" (no article)")
        if page < UKR_PAGES:
            time.sleep(delay)

    # Strip scripts/styles
    combined_html = re.sub(r"<script[^>]*>.*?</script>", "", combined_html,
                           flags=re.DOTALL | re.IGNORECASE)
    combined_html = re.sub(r"<style[^>]*>.*?</style>",  "", combined_html,
                           flags=re.DOTALL | re.IGNORECASE)

    text = re.sub(r"<br\s*/?>[ \t]*\r?\n?", "\n", combined_html, flags=re.IGNORECASE)
    text = _unescape(_strip_tags(text))

    chapters: list[dict] = []
    current_title: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        if current_title is None:
            return
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

    # Strip footnotes from titles
    def strip_fn(s: str) -> str:
        return re.sub(r"\[\d+\]", "", s).strip()

    for raw_line in text.split("\n"):
        line = raw_line.strip()
        clean = strip_fn(line)
        if _is_ukr_scene_title(clean):
            flush()
            current_title = clean
            current_lines = []
        else:
            current_lines.append(line)

    flush()
    return chapters


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
    cur.execute("INSERT INTO Books (Title, Author, Language) VALUES (?,?,?)",
                (BOOK_TITLE, BOOK_AUTHOR, BOOK_LANG))
    con.commit()
    book_id = cur.lastrowid
    print(f"Inserted book id={book_id}")
    return book_id


def insert_chapters(con, book_id, german, ukr, dry_run):
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM Chapters WHERE BookId=?", (book_id,))
    if cur.fetchone()[0] > 0 and not dry_run:
        print("Chapters already exist — skipping.")
        return

    n_de = len(german)
    n_uk = len(ukr)
    print(f"\nChapters: DE={n_de}  UK={n_uk}")

    total_paras = 0
    for i, de_ch in enumerate(german):
        uk_ch      = ukr[i] if i < n_uk else {"stanzas": []}
        de_stanz   = de_ch["stanzas"]
        uk_stanz   = uk_ch["stanzas"]
        n_paras    = max(len(de_stanz), len(uk_stanz))
        total_paras += n_paras
        print(f"  [{i:02d}] {de_ch['title'][:50]:50s}  DE={len(de_stanz)} UK={len(uk_stanz)}")

        if dry_run:
            continue

        cur.execute("INSERT INTO Chapters (BookId, Number, Title) VALUES (?,?,?)",
                    (book_id, i, de_ch["title"]))
        chapter_id = cur.lastrowid

        for j in range(n_paras):
            de_text = de_stanz[j] if j < len(de_stanz) else ""
            uk_text = uk_stanz[j] if j < len(uk_stanz) else None
            cur.execute(
                'INSERT INTO Paragraphs (ChapterId, "Index", Text, UkrainianText)'
                ' VALUES (?,?,?,?)',
                (chapter_id, j, de_text, uk_text)
            )

    con.commit()
    print(f"\nTotal paragraphs: {total_paras}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--skip-ukr", action="store_true")
    parser.add_argument("--delay",    type=float, default=0.5)
    args = parser.parse_args()

    print("Fetching German Faust Part 2…")
    de_html = fetch(GERMAN_URL)
    german  = parse_german2(de_html)
    print(f"  {len(german)} scenes parsed")

    ukr: list[dict] = []
    if not args.skip_ukr:
        print(f"Fetching Ukrainian Part 2 (pages {UKR_START}–{UKR_PAGES})…")
        ukr = fetch_ukrainian2(delay=args.delay)
        print(f"  {len(ukr)} scenes parsed")
        if ukr:
            print("  Ukrainian scene titles:")
            for i, ch in enumerate(ukr):
                print(f"    [{i}] {ch['title']}")

    con      = sqlite3.connect(DB_PATH)
    book_id  = insert_book(con, args.dry_run)
    if book_id > 0 or args.dry_run:
        insert_chapters(con, book_id if not args.dry_run else -1,
                        german, ukr, args.dry_run)
    con.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
