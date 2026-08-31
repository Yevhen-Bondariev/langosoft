import sqlite3, sys, json, re
sys.stdout.reconfigure(encoding='utf-8')

PART_EXPAND = {
    'ch': 'che', 'm': 'mi', 'v': 'vi', 't': 'ti', 'd': 'di',
    'c': 'ci',   's': 'si', 'i': 'io', 'n': 'non', 'l': 'lo',
    'com': 'come',
    'nferno': 'inferno', 'mpedisce': 'impedisce', 'mpediva': 'impediva',
    'ncontro': 'incontro', 'nvidia': 'invidia',
}

# U+2019 right single quote, U+2018 left, U+02BC modifier apostrophe, U+0060 backtick, U+0027 apostrophe
APOS = u"’‘ʼ`'"
apos_re = re.compile(u"[" + APOS + u"]")
token_re = re.compile(u"[A-Za-z\xc0-\xff" + APOS + u"]+")

conn = sqlite3.connect('backend/LangoSoft.Api/langosoft.db')
rows = conn.execute("""
  SELECT p.Text FROM Paragraphs p
  JOIN Chapters c ON p.ChapterId = c.Id
  WHERE c.BookId=5 AND c.Number=0
""").fetchall()
conn.close()

with open('frontend/public/mnemonics.json', encoding='utf-8') as f:
    m = json.load(f)

apos_tokens = set()
for (text,) in rows:
    if text:
        for w in token_re.findall(text):
            if apos_re.search(w):
                apos_tokens.add(w.lower())

print(f'Apostrophe tokens: {len(apos_tokens)}\n')

for token in sorted(apos_tokens):
    if m.get(token):
        continue
    raw_parts = [p for p in apos_re.split(token) if p]
    resolved = [(p, PART_EXPAND.get(p, p)) for p in raw_parts]
    missing = []
    for raw, form in resolved:
        if not m.get(form) and not m.get(raw):
            missing.append(f'{raw}->{form}')
    if missing:
        expansion = ' + '.join(form for _, form in resolved)
        print(f'{token} ({expansion}): MISSING {missing}')

print('\nDone.')
