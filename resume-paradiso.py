import json, os, ssl, sys, time, urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API_BASE = "http://localhost:5000"
BOOK_ID  = 5
CHAPTERS = range(71, 100)
DELAY    = 0.3

_ssl = ssl.create_default_context()
_ssl.check_hostname = False
_ssl.verify_mode    = ssl.CERT_NONE

def load_key():
    env_path = r"c:\Users\Таня\Desktop\Folder\Projects\langosoft\.env"
    with open(env_path) as f:
        for line in f:
            if line.strip().startswith("GOOGLE_TRANSLATE_KEY="):
                return line.split("=",1)[1].strip()

def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))

def http_post(url, body):
    data = json.dumps(body).encode("utf-8")
    req  = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=15, context=_ssl) as r:
        return json.loads(r.read().decode("utf-8"))

def http_patch(url, body):
    data = json.dumps(body).encode("utf-8")
    req  = urllib.request.Request(url, data=data, method="PATCH", headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status

def translate_para(para, key):
    lines = [l.strip() for l in para["text"].split("\n") if l.strip()]
    if not lines: return
    translations = []
    for line in lines:
        url  = f"https://translation.googleapis.com/language/translate/v2?key={key}"
        resp = http_post(url, {"q": line, "source": "it", "target": "en", "format": "text"})
        translations.append(resp["data"]["translations"][0]["translatedText"].strip())
    body = json.dumps(translations, ensure_ascii=False)
    http_patch(f"{API_BASE}/api/paragraphs/{para['id']}/line-trans", body)

key = load_key()
total_ok = total_skip = 0
for ch in CHAPTERS:
    paras  = http_get(f"{API_BASE}/api/books/{BOOK_ID}/chapters/{ch}/paragraphs")
    to_do  = [p for p in paras if not p.get("lineTransJson")]
    print(f"Chapter {ch}: {len(to_do)}/{len(paras)} to translate", flush=True)
    for i, para in enumerate(to_do):
        translate_para(para, key)
        total_ok += 1
        if i < len(to_do)-1: time.sleep(DELAY)
    total_skip += len(paras) - len(to_do)
print(f"Done. Translated={total_ok} Skipped={total_skip}")
