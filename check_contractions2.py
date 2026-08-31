import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('frontend/public/mnemonics.json', encoding='utf-8') as f:
    m = json.load(f)

# All the content parts we need covered
need = [
    # contraction content parts
    'ella', 'eran', 'erano', 'uscia', 'usciva', 'ei', 'egli',
    'acqua', 'aere', 'aria', 'altezza', 'altre', 'altri',
    'amor', 'amore', 'animo', 'anima', 'avrà', 'avra', 'aveva', 'aveva',
    'erta', 'ora', 'uccide', 'uccidere',
    'apparve', 'apparire', 'aveva', 'aveva', 'aveva',
    'ammoglia', 'ammogliarsi', 'attrista', 'attristare',
    'intrai', 'entrare', 'entrai',
    'anchise', 'esto', 'questo',
    'un', 'uno', 'una',
    # elided-initial-vowel targets
    'inferno', 'impedisce', 'impedire', 'impediva', 'incontro', 'invidia',
    # prefix expansions
    'di', 'come',
]

for w in sorted(set(need)):
    status = 'OK' if m.get(w) else 'MISSING'
    if status == 'MISSING':
        print(f'MISSING: {w!r}')
