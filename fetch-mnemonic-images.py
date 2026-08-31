"""
Fetch Pixabay images for every mnemonic entry.
Usage: python fetch-mnemonic-images.py <PIXABAY_API_KEY>

Images are saved to frontend/public/mnemonics-images/{key}.jpg
Keys with accents are normalized (già → gia) so both accented and
unaccented variants share the same file.
"""
import json, re, os, sys, time, unicodedata, requests, urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
sys.stdout.reconfigure(encoding='utf-8')

if len(sys.argv) < 2:
    print("Usage: python fetch-mnemonic-images.py <PIXABAY_API_KEY>")
    sys.exit(1)

API_KEY = sys.argv[1]
MNEMONICS_PATH = r"frontend/public/mnemonics.json"
OUT_DIR = r"frontend/public/mnemonics-images"
SLEEP = 0.7        # ~85 req/min, safely under the 100/min limit
BACKOFF = 60       # seconds to wait on 429

os.makedirs(OUT_DIR, exist_ok=True)

with open(MNEMONICS_PATH, encoding='utf-8') as f:
    m = json.load(f)

def normalize(k):
    nfkd = unicodedata.normalize('NFKD', k)
    return ''.join(c for c in nfkd if not unicodedata.combining(c)).lower()

SKIP = {
    'TO','THE','AN','AND','OR','BUT','FOR','NOT','IT','IS','AS','IN','ON','AT',
    'OF','BY','UP','OUT','SO','DO','GO','BE','AM','ARE','WAS','HAS','HAD',
    'YOU','HE','SHE','WE','HIS','HER','MY','ME','ITS','ALL','OWN',
    'MORE','LESS','GREAT','GOOD','BAD','FULL','JUST','VERY','LONG','STILL',
    'DEEP','HIGH','LOW','FAST','SLOW','EVER','EVEN','ONLY','MUCH','SUCH',
    'ALREADY','BEFORE','AFTER','WHILE','ONCE','ALWAYS','NEVER','EVERY','EACH',
    'THIS','THAT','THOSE','THESE','SAME','OTHER','OTHERS','ANOTHER',
    'NOW','THEN','WHEN','WHERE','WHO','WHAT','HOW','WHY',
    'TRUE','FALSE','RIGHT','WRONG','REAL','PURE','NEW','OLD','YOUNG','BIG','SMALL',
}

def caps_query(text):
    caps = [w for w in re.findall(r'\b[A-Z]{2,}\b', text) if w not in SKIP]
    return caps[0] if caps else None

def fetch(query, out_path):
    while True:
        try:
            r = requests.get('https://pixabay.com/api/', params={
                'key': API_KEY, 'q': query, 'image_type': 'photo',
                'per_page': 3, 'safesearch': 'true', 'orientation': 'horizontal'
            }, timeout=10, verify=False)

            if r.status_code == 429:
                remaining_reset = int(r.headers.get('X-RateLimit-Reset', BACKOFF))
                wait = max(remaining_reset, BACKOFF)
                print(f"\n  Rate limited — waiting {wait}s ...", flush=True)
                time.sleep(wait)
                continue  # retry same request

            remaining = int(r.headers.get('X-RateLimit-Remaining', 99))
            if remaining <= 5:
                print(f"\n  Only {remaining} requests left in window — pausing {BACKOFF}s ...", flush=True)
                time.sleep(BACKOFF)

            hits = r.json().get('hits', [])
            if not hits:
                return False

            img = requests.get(hits[0]['webformatURL'], timeout=15, verify=False)
            with open(out_path, 'wb') as f:
                f.write(img.content)
            return True

        except requests.exceptions.RequestException as e:
            print(f"\n  Network error: {e} — retrying in 10s", flush=True)
            time.sleep(10)
            continue

seen = {}
fetched = skipped = failed = 0
total = len(m)

for key, text in m.items():
    norm = normalize(key)
    out_path = os.path.join(OUT_DIR, f"{norm}.jpg")

    if norm in seen:
        continue  # accented alias of already-processed key
    seen[norm] = True

    if os.path.exists(out_path):
        skipped += 1
        continue

    query = caps_query(text)
    if not query:
        print(f"  SKIP {key!r}: no image-worthy CAPS words")
        skipped += 1
        continue

    n = fetched + skipped + failed + 1
    print(f"[{n}/{total}] {key!r:20} '{query}' ...", end=' ', flush=True)
    ok = fetch(query, out_path)
    if ok:
        fetched += 1
        print("OK")
    else:
        failed += 1
        print("FAILED (no results)")

    time.sleep(SLEEP)

print(f"\nDone: {fetched} fetched, {skipped} skipped, {failed} failed.")
