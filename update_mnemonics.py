import json, sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'C:\Users\Таня\Desktop\Folder\Projects\langosoft\frontend\public\mnemonics.json'
with open(path, encoding='utf-8') as f:
    m = json.load(f)

# New compact mnemonics for first stanza of Canto I:
# Nel mezzo del cammin di nostra vita
# mi ritrovai per una selva oscura,
# che la diritta via era smarrita.
updates = {
    # Canto I, stanza 1
    'nel':       'in the nail',
    'mezzo':     'middle Messi',
    'del':       'of the deli',
    'cammin':    'journey coming',
    'di':        'of dean',
    'nostra':    'our nostril',
    'vita':      'vital life',
    'mi':        'me mime',
    'ritrovai':  'found retro',
    'per':       'through pear',
    'una':       'one tuna',
    'selva':     'wood salvage',
    'oscura':    'dark oscar',
    'ché':       'because chef',   # accented form in stanza 1
    'che':       'that check',     # unaccented form in stanza 3
    'la':        'the lard',
    'diritta':   'straight director',
    'via':       'via view',
    'era':       'era was',
    'smarrita':  'lost smartie',
    # Canto I, stanzas 2–3
    'ahi':       'ah ah',
    'quanto':    'how quantum',
    'a':         'to art',
    'dir':       'say deer',
    'qual':      'which quality',
    'è':         'is air',
    'cosa':      'coast thing',
    'dura':      'hard duration',
    'esta':      'this star',
    'selvaggia': 'wild savage',
    'e':         'and eh',
    'aspra':     'harsh asphalt',
    'forte':     'strong fort',
    'pensier':   'pansy thought',
    'rinova':    'renews innovation',
    'paura':     'fear power',
}


for k, v in updates.items():
    m[k] = v

with open(path, 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, indent=2)

print(f'Updated {len(updates)} entries. Total: {len(m)}')
