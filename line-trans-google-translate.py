"""
line-trans-google-translate.py
Generate per-line literal translations using Google Translate (format=text),
then store them via PATCH /api/paragraphs/{id}/line-trans.

Each Italian verse line is translated independently to English.
The result is a JSON array (one string per line), stored in LineTransJson.

Usage:
  python line-trans-google-translate.py --chapter 2           # Canto III (0-based)
  python line-trans-google-translate.py --chapter 2 --force   # overwrite existing
  python line-trans-google-translate.py --chapter 2 --dry-run
  python line-trans-google-translate.py --chapter 2 --max 3   # first 3 stanzas
  python line-trans-google-translate.py --chapter 2 --para 3928,3929
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.request

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

API_BASE = "http://localhost:5000"
BOOK_ID  = 5

_ssl = ssl.create_default_context()
_ssl.check_hostname = False
_ssl.verify_mode    = ssl.CERT_NONE


def load_key(cli_key):
    if cli_key:
        return cli_key
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
    raise SystemExit("No Google Translate API key found.")


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def http_post(url, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15, context=_ssl) as r:
        return json.loads(r.read().decode("utf-8"))


def http_patch(url, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def translate_line(line: str, key: str, source_lang: str = "it") -> str:
    url = f"https://translation.googleapis.com/language/translate/v2?key={key}"
    resp = http_post(url, {"q": line, "source": source_lang, "target": "en", "format": "text"})
    return resp["data"]["translations"][0]["translatedText"].strip()


def translate_paragraph(para: dict, key: str, dry_run: bool, source_lang: str = "it") -> bool:
    lines = [l.strip() for l in para["text"].split("\n") if l.strip()]
    if not lines:
        return True

    translations = []
    for line in lines:
        try:
            t = translate_line(line, key, source_lang)
            translations.append(t)
            print(f"    {line[:50]:50s} → {t}")
        except Exception as e:
            print(f"  ERROR translating line: {e}", file=sys.stderr)
            return False

    if dry_run:
        print(f"  [DRY RUN] {len(translations)} lines — nothing saved")
        return True

    line_trans_json = json.dumps(translations, ensure_ascii=False)
    url = f"{API_BASE}/api/paragraphs/{para['id']}/line-trans"
    try:
        http_patch(url, line_trans_json)
        print(f"  Saved {len(translations)} lines to para {para['id']}")
        return True
    except Exception as e:
        print(f"  ERROR saving: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chapter", type=int, default=2)
    parser.add_argument("--book",    type=int, default=BOOK_ID)
    parser.add_argument("--source",  default=None,
                        help="Source language code (default: auto-detect from book)")
    parser.add_argument("--force",   action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--key",     default=None)
    parser.add_argument("--delay",   type=float, default=0.3)
    parser.add_argument("--max",     type=int,   default=0)
    parser.add_argument("--para",    default=None,
                        help="Comma-separated paragraph IDs to target")
    args = parser.parse_args()

    key = load_key(args.key)

    # Auto-detect source language from book if not provided
    source_lang = args.source
    if not source_lang:
        book_info = http_get(f"{API_BASE}/api/books")
        book_map  = {b["id"]: b for b in book_info}
        source_lang = book_map.get(args.book, {}).get("language", "it")
    print(f"Source language: {source_lang}")

    print(f"Fetching chapter {args.chapter} paragraphs...")
    paras = http_get(f"{API_BASE}/api/books/{args.book}/chapters/{args.chapter}/paragraphs")
    print(f"  {len(paras)} paragraphs (IDs {paras[0]['id']}–{paras[-1]['id']})")

    if args.para:
        target_ids = {int(x.strip()) for x in args.para.split(",")}
        to_trans = [p for p in paras if p["id"] in target_ids]
        print(f"  Targeting {len(to_trans)} specific paragraph(s)")
    elif args.force:
        to_trans = paras
        print(f"  Force mode — will translate all {len(to_trans)}")
    else:
        to_trans = [p for p in paras if not p.get("lineTransJson")]
        print(f"  {len(to_trans)} paragraph(s) without a line translation")

    if args.max > 0:
        to_trans = to_trans[:args.max]

    if not to_trans:
        print("Nothing to do.")
        return

    ok = fail = 0
    for i, para in enumerate(to_trans):
        preview = para["text"].replace("\n", " | ")[:70]
        print(f"\n[{i+1}/{len(to_trans)}] Para {para['id']}: {preview}")
        if translate_paragraph(para, key, args.dry_run, source_lang):
            ok += 1
        else:
            fail += 1
        if i < len(to_trans) - 1:
            time.sleep(args.delay)

    print(f"\nDone. OK: {ok}  Failed: {fail}")


if __name__ == "__main__":
    main()
