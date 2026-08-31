"""
finish-dante-literals.py
Run line-trans-google-translate for Purgatorio + Paradiso (chapters 34-99).
Skips paragraphs that already have a literal translation.
"""
import json, os, ssl, sys, time, urllib.request

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API_BASE = "http://localhost:5000"
BOOK_ID  = 5
CHAPTERS = range(34, 100)   # Purgatorio I through Paradiso XXXIII
DELAY    = 0.3

_ssl = ssl.create_default_context()
_ssl.check_hostname = False
_ssl.verify_mode    = ssl.CERT_NONE


def load_key():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.strip().startswith("GOOGLE_TRANSLATE_KEY="):
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
    req  = urllib.request.Request(url, data=data, method="POST",
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15, context=_ssl) as r:
        return json.loads(r.read().decode("utf-8"))


def http_patch(url, body):
    data = json.dumps(body).encode("utf-8")
    req  = urllib.request.Request(url, data=data, method="PATCH",
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def translate_line(line: str, key: str) -> str:
    url  = f"https://translation.googleapis.com/language/translate/v2?key={key}"
    resp = http_post(url, {"q": line, "source": "it", "target": "en", "format": "text"})
    return resp["data"]["translations"][0]["translatedText"].strip()


def translate_para(para: dict, key: str) -> bool:
    lines = [l.strip() for l in para["text"].split("\n") if l.strip()]
    if not lines:
        return True
    translations = []
    for line in lines:
        try:
            translations.append(translate_line(line, key))
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            return False
    body = json.dumps(translations, ensure_ascii=False)
    url  = f"{API_BASE}/api/paragraphs/{para['id']}/line-trans"
    try:
        http_patch(url, body)
        return True
    except Exception as e:
        print(f"  SAVE ERROR: {e}", file=sys.stderr)
        return False


def main():
    key = load_key()
    total_ok = total_fail = total_skip = 0

    for ch in CHAPTERS:
        paras = http_get(f"{API_BASE}/api/books/{BOOK_ID}/chapters/{ch}/paragraphs")
        to_do = [p for p in paras if not p.get("lineTransJson")]
        print(f"\nChapter {ch:3d} — {len(to_do)}/{len(paras)} need translation", flush=True)

        for i, para in enumerate(to_do):
            ok = translate_para(para, key)
            if ok:
                total_ok += 1
                preview = para["text"].split("\n")[0][:55]
                print(f"  [{i+1}/{len(to_do)}] {preview}", flush=True)
            else:
                total_fail += 1
            if i < len(to_do) - 1:
                time.sleep(DELAY)

        total_skip += len(paras) - len(to_do)

    print(f"\n\nAll done.  OK={total_ok}  Failed={total_fail}  Skipped={total_skip}")


if __name__ == "__main__":
    main()
