"""
gloss-google-translate.py
Generate word-by-word Italian→English glosses using Google Translate HTML span mode,
then seed them into the backend via PUT /api/paragraphs/{id}/gloss.

Reads GOOGLE_TRANSLATE_KEY from .env (project root) or --key argument.
Uses the official Cloud Translation API v2 with format=html so each word
is translated in full-sentence context.

Usage:
  python gloss-google-translate.py --chapter 2           # Canto III (0-based)
  python gloss-google-translate.py --chapter 2 --force   # overwrite existing
  python gloss-google-translate.py --chapter 2 --dry-run
  python gloss-google-translate.py --chapter 2 --max 1   # first stanza only
"""

import argparse
import html as html_mod
import json
import os
import re
import ssl
import sys
import time
import urllib.request

# Force UTF-8 output on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

API_BASE = "http://localhost:5000"
BOOK_ID  = 5   # La Divina Commedia

# SSL context — Windows Python sometimes has an outdated CA store
_ssl = ssl.create_default_context()
_ssl.check_hostname = False
_ssl.verify_mode    = ssl.CERT_NONE

# Word token regex — Unicode letters + all apostrophe variants + hyphens
WORD_RE  = re.compile(r"[\w’’’ʼ\-]+", re.UNICODE)
STRIP_RE = re.compile(r"^[‘’’ʼ\-]+|[‘’’ʼ\-]+$")

# Articles, conjunctions, and prepositions GT absorbs into surrounding words, causing span shifts.
# Hardcode these so they never get a span — content words then map cleanly 1-to-1.
HARDCODED: dict[str, str] = {
    # articles
    "il": "the", "lo": "the", "la": "the", "gli": "the", "le": "the",
    "un": "a",   "uno": "a",  "una": "a",
    # conjunctions — e/ed left out: "and" is reliable in context and HARDCODED e causes
    # span count mismatches when e appears mid-phrase (e.g. occhi vergognosi e bassi)
    "o": "or", "ma": "but", "che": "that",
    # archaic verb forms GT absorbs into phrases
    "convien": "must", "conviene": "must",
    # nouns GT fuses with following adjective (Italian noun-adj → English adj-noun inversion)
    "colore": "color",
    # clitic pronouns GT absorbs into surrounding verb phrases
    "mi": "me", "ti": "you", "vi": "you",
    # negation — keep as plain text so HARDCODED verbs (fur, fuoro) don't shift onto it
    "non": "not",
    # archaic / rare words GT mistranslates
    "sanza": "without",   # archaic senza
    "turbo": "whirlwind", # archaic turbine; GT reads it as English "turbo"
    "tegnon": "hold",       # archaic tengono
    "fur": "were",          # archaic furono
    "fuoro": "were",        # archaic furono
    "fuor": "were",         # archaic furono (variant)
    "gote": "cheeks",       # archaic gote = guance; span-shifts with quete in "fuor quete le lanose gote"
    "quete": "quiet",       # archaic quiete (adj.); span-shifts onto gote
    "son": "are",           # archaic sono
    "sono": "are",          # GT misreads as 1st-person singular "I am" instead of 3rd-pl "are"
    "sonno": "sleep",       # GT misses in inverted "cui sonno piglia" construction
    "puote": "can",         # archaic può; GT gives "done" in context
    "era": "was",           # GT reads standalone era as English "era"
    "elli": "he",           # archaic egli
    "lassa": "allows",      # archaic lascia; GT span-shifts when preceded by esser non
    "oltre": "beyond",      # GT consistently misses/shifts this
    "ricolto": "gathered",  # archaic raccogliere past participle; GT gives "free"
    "diedi": "gave",        # archaic past of dare; in mi diedi a = "I applied myself to"
    "rei": "the guilty",    # Dante uses rei (Latin) = the guilty, not "kings"
    "costume": "custom",    # false friend: Italian costume = custom/habit, not clothing
    "trapassar": "to cross",# archaic trapassare; GT span-shifts in fa di trapassar parer
    "parer": "to seem",     # archaic parere (verb); GT gives noun meaning "opinion"
    # reflexive pronoun sé — GT confuses with conditional se (no accent)
    "sé": "himself",
    # words GT fuses with preceding "sanza/senza" into English compounds (starless, timeless)
    "stelle": "stars", "stella": "star",
    "tempo": "time",
    # archaic words — also add elided forms so GT can’t absorb context into the span
    "aere": "air", "l’aere": "air",       # archaic aria
    "anime": "souls", "l’anime": "souls", # GT extracts only the article from l’anime
    # adjectives GT turns into articles when preceding a noun phrase
    "lieto": "cheerful", "lieta": "cheerful",
    # "li occhi vergognosi e bassi": word-order inversion → GT scrambles spans; hardcode both
    "li": "the",          # archaic gli (article, masc. pl.)
    "i": "the",           # masculine plural article (= gli, li)
    "vergognosi": "ashamed", "vergognosa": "ashamed",
    # comparative marker — GT misreads as indefinite article in "più lieve legno"
    "più": "more",
    # archaic future of essere (fiero = proud → fier = will be; GT reads as "proud")
    "fier": "will be",
    # archaic past participle conte = known/counted; GT span-shifts when preceded by HARDCODED ti
    "conte": "known",
    # possessives GT absorbs onto adjacent article span
    "nostro": "our", "nostri": "our", "nostra": "our", "nostre": "our",
    # elided article/preposition before consonant ('l = il/lo/nel; 'n = in)
    "l": "the", "n": "in",
    # prepositions
    "a":   "to",      "ad":  "to",   "di":  "of",   "in":  "in",   "per": "for",
    "da":  "from",    "con": "with", "su":  "on",    "tra": "between",
    "fra": "among",   "ne":  "in",   "si":  "one",
    "de":  "of",      # archaic di (variant before definite article)
    # adverb absorbed by pronoun span
    "insieme": "together",
    # contracted prepositions
    "del": "of the",  "della": "of the", "dello": "of the",
    "dei": "of the",  "degli": "of the", "delle": "of the",
    "al":  "to the",  "alla":  "to the", "allo":  "to the",
    "ai":  "to the",  "agli":  "to the", "alle":  "to the",
    "dal": "from the","dalla": "from the","dallo": "from the",
    "nel": "in the",  "nella": "in the", "nello": "in the",
    "nei": "in the",  "negli": "in the", "nelle": "in the",
    "sul": "on the",  "sulla": "on the", "sullo": "on the",
    "sugli": "on the", "sulle": "on the",
    # "sui" omitted — ambiguous between contracted preposition "on the" and possessive "his/their own"
    # elided clitic pronouns + verb: one token, two morphemes — gloss both
    "m’è":  "is for me",   # m'è  (mi + è)
    "t’è":  "is for you",  # t'è  (ti + è)
    "s’è":  "is",          # s'è  (si + è, reflexive)
    "n’è":  "of it is",    # n'è  (ne + è)
    "m’ha":  "has [for] me",    # m'ha (mi + ha)
    "t’ho":  "have you",   # t’ho (ti + ho: auxiliary + object pronoun)
}


# ── Load API key ─────────────────────────────────────────────────────────────

def load_key(cli_key: str | None) -> str:
    if cli_key:
        return cli_key
    # Try .env in the script's directory
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GOOGLE_TRANSLATE_KEY="):
                    return line.split("=", 1)[1].strip()
    key = os.environ.get("GOOGLE_TRANSLATE_KEY", "")
    if key:
        return key
    raise SystemExit("No Google Translate API key found. Add GOOGLE_TRANSLATE_KEY to .env or pass --key.")


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def http_get(url: str) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def http_post(url: str, body: dict) -> object:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15, context=_ssl) as r:
        return json.loads(r.read().decode("utf-8"))


def http_put(url: str, body: dict) -> int:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


# ── Tokenise Italian text ────────────────────────────────────────────────────

def tokenise(text: str) -> list[str]:
    """Return unique lowercase word tokens in order of first appearance."""
    seen: dict[str, bool] = {}
    for m in WORD_RE.finditer(text):
        raw = STRIP_RE.sub("", m.group(0)).lower()
        if raw and raw not in seen:
            seen[raw] = True
    return list(seen.keys())


# ── Google Translate HTML span mode ─────────────────────────────────────────
# Each word is wrapped in <span id="wN">word</span>.
# The full stanza is sent as a single HTML document so GT has sentence-level
# context when choosing the translation for each individual word.

def translate_html_spans(stanza_text: str, key: str) -> dict[str, str]:
    # Send one verse line at a time.
    # Only NEW words (not yet in result) get <span> tags — already-seen words
    # appear as plain text, giving GT sentence context without needing parsing.
    # This avoids GT reordering spans across a multi-line stanza.
    url = f"https://translation.googleapis.com/language/translate/v2?key={key}"
    result: dict[str, str] = {}

    for line in stanza_text.split("\n"):
        line = line.strip()
        if not line:
            continue

        html = ""
        prev_end = 0
        word_idx = 0
        idx_to_raw: dict[int, str] = {}

        for m in WORD_RE.finditer(line):
            raw = STRIP_RE.sub("", m.group(0)).lower()
            html += line[prev_end:m.start()]
            if raw and raw not in result and raw not in HARDCODED:
                html += f'<span id="w{word_idx}">{m.group(0)}</span>'
                idx_to_raw[word_idx] = raw
                word_idx += 1
            else:
                html += m.group(0)  # plain text — context only
                if raw in HARDCODED and raw not in result:
                    result[raw] = HARDCODED[raw]
            prev_end = m.end()
        html += line[prev_end:]

        if not idx_to_raw:
            continue  # all words on this line already glossed

        resp = http_post(url, {"q": html, "source": "it", "target": "en", "format": "html"})
        translated_html = resp["data"]["translations"][0]["translatedText"]

        for idx, raw in idx_to_raw.items():
            m = re.search(rf'<span[^>]*\bid="w{idx}"[^>]*>(.*?)</span>',
                          translated_html, re.IGNORECASE | re.DOTALL)
            if m:
                text_content = re.sub(r"<[^>]+>", "", m.group(1))
                text_content = html_mod.unescape(text_content).strip("’ ‘’\"«»")
                text_content = text_content.rstrip('-.,;:"')  # strip trailing hyphens/punct/quote from GT artifacts
                if text_content:
                    result[raw] = text_content

    # Retry words whose span translation is a phrase (contains a space) or is pure
    # punctuation/empty. Both are artifacts: a space means GT mapped a multi-word
    # English phrase onto a single Italian span (word-order inversion, archaic vocab, etc.),
    # so the individual-word translation is more accurate for a gloss.
    def needs_retry(t: str) -> bool:
        return " " in t or not re.search(r'\w', t, re.UNICODE)

    # Elided forms (apostrophe in key, e.g. d'una, c'hanno) whose contextual translation
    # is a phrase are usually correct — skip retry to avoid losing grammatical context.
    # Exception: pure punctuation/empty results are always garbage, retry unconditionally.
    def is_elided(w: str) -> bool:
        return bool(re.search(r'[^\w]', w, re.UNICODE))

    def is_punct_only(t: str) -> bool:
        return not re.search(r'\w', t, re.UNICODE)

    bad = [w for w, t in result.items()
           if w not in HARDCODED  # never override deliberate HARDCODED values
           and (is_punct_only(t) or (" " in t and not is_elided(w)))]
    for w in bad:
        try:
            resp = http_post(url, {"q": w, "source": "it", "target": "en", "format": "text"})
            t = resp["data"]["translations"][0]["translatedText"].strip()
            if t and not needs_retry(t):
                result[w] = t
            elif t:
                result[w] = t  # keep even if still a phrase — better than nothing
        except Exception:
            del result[w]

    return result


# ── Gloss one paragraph ──────────────────────────────────────────────────────

def gloss_paragraph(para: dict, key: str, dry_run: bool) -> bool:
    words = tokenise(para["text"])
    if not words:
        return True

    try:
        gloss = translate_html_spans(para["text"], key)
    except Exception as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        return False

    # Show full gloss for inspection
    for word in words:
        translation = gloss.get(word, "—")
        print(f"    {word:20s} → {translation}")

    missed = [w for w in words if w not in gloss]
    if missed:
        print(f"  MISSED ({len(missed)}): {', '.join(missed)}")

    if dry_run:
        print(f"  [DRY RUN] {len(gloss)}/{len(words)} words covered — nothing saved")
        return True

    url = f"{API_BASE}/api/paragraphs/{para['id']}/gloss"
    try:
        http_put(url, {"GlossJson": json.dumps(gloss, ensure_ascii=False),
                       "TargetLanguage": "English"})
        print(f"  Saved {len(gloss)} words to para {para['id']}")
        return True
    except Exception as e:
        print(f"  ERROR saving: {e}", file=sys.stderr)
        return False


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chapter", type=int, default=2,
                        help="0-based chapter number (default: 2 = Canto III)")
    parser.add_argument("--book",    type=int, default=BOOK_ID)
    parser.add_argument("--force",   action="store_true",
                        help="Overwrite paragraphs that already have a cached gloss")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print translations without writing to the DB")
    parser.add_argument("--key",     default=None,
                        help="Google Cloud Translation API key (overrides .env)")
    parser.add_argument("--delay",   type=float, default=0.5,
                        help="Seconds between API calls (default: 0.5)")
    parser.add_argument("--max",     type=int,   default=0,
                        help="Stop after N paragraphs (0 = all)")
    parser.add_argument("--para",    default=None,
                        help="Comma-separated paragraph IDs to target (implies --force for those IDs)")
    args = parser.parse_args()

    key = load_key(args.key)

    print(f"Fetching Canto {args.chapter + 1} paragraphs...")
    paras = http_get(f"{API_BASE}/api/books/{args.book}/chapters/{args.chapter}/paragraphs")
    print(f"  {len(paras)} paragraphs (IDs {paras[0]['id']}–{paras[-1]['id']})")

    if args.para:
        target_ids = {int(x.strip()) for x in args.para.split(",")}
        to_gloss = [p for p in paras if p["id"] in target_ids]
        print(f"  Targeting {len(to_gloss)} specific paragraph(s): {sorted(target_ids)}")
    elif args.force:
        to_gloss = paras
        print(f"  Force mode — will re-gloss all {len(to_gloss)}")
    else:
        print("  Checking which paragraphs need glossing...")
        to_gloss = []
        for p in paras:
            g = http_get(f"{API_BASE}/api/paragraphs/{p['id']}/gloss?cacheOnly=true")
            existing = g.get("gloss", "")
            if not existing or existing in ("{}", ""):
                to_gloss.append(p)
        print(f"  {len(to_gloss)} paragraph(s) without a cached gloss")

    if args.max > 0:
        to_gloss = to_gloss[:args.max]

    if not to_gloss:
        print("Nothing to do.")
        return

    ok = fail = 0
    for i, para in enumerate(to_gloss):
        preview = para["text"].replace("\n", " | ")[:70]
        print(f"\n[{i+1}/{len(to_gloss)}] Para {para['id']}: {preview}")
        if gloss_paragraph(para, key, args.dry_run):
            ok += 1
        else:
            fail += 1
        if i < len(to_gloss) - 1:
            time.sleep(args.delay)

    print(f"\nDone. OK: {ok}  Failed: {fail}")


if __name__ == "__main__":
    main()
